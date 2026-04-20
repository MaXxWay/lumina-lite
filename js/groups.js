// groups.js — менеджер групп (ИСПРАВЛЕННЫЙ)

class GroupManager {
    constructor(client) {
        this.supabase = client;
    }

    async createGroup(name, description = '', memberIds = []) {
        try {
            if (!name.trim()) { showToast('Введите название группы', true); return { success: false }; }
            
            const userId = window.currentUser?.id;
            if (!userId) { showToast('Не авторизован', true); return { success: false }; }

            const { data: group, error: gErr } = await this.supabase
                .from('groups')
                .insert({ 
                    name: name.trim(), 
                    description: description.trim(), 
                    created_by: userId, 
                    member_count: 1 + memberIds.length,
                    avatar_emoji: '👥',
                    created_at: new Date().toISOString(), 
                    updated_at: new Date().toISOString() 
                })
                .select().single();
            if (gErr) throw gErr;

            await this.supabase.from('group_members').insert({ 
                group_id: group.id, 
                user_id: userId, 
                role: 'admin', 
                joined_at: new Date().toISOString() 
            });

            const valid = [];
            for (const uid of memberIds) {
                if (uid === userId) continue;
                const { error } = await this.supabase.from('group_members').insert({ 
                    group_id: group.id, 
                    user_id: uid, 
                    role: 'member', 
                    joined_at: new Date().toISOString() 
                });
                if (!error) valid.push(uid);
            }

            const participants = [userId, ...valid];
            const { data: chat, error: cErr } = await this.supabase
                .from('chats')
                .insert({ 
                    type: 'group', 
                    is_group: true, 
                    group_id: group.id, 
                    participants, 
                    created_at: new Date().toISOString(), 
                    updated_at: new Date().toISOString(), 
                    last_message: `Группа «${name}» создана` 
                })
                .select().single();
            if (cErr) throw cErr;

            await this._addSystemMessage(chat.id, `🎉 Группа «${name}» создана\n👥 Участников: ${participants.length}`);

            showToast(`Группа «${name}» создана!`);

            const modal = document.getElementById('create-group-modal');
            if (modal) modal.style.display = 'none';

            if (typeof loadDialogs === 'function') await loadDialogs();
            if (typeof openGroupChat === 'function') await openGroupChat(chat.id, { ...group, member_count: participants.length, chat_id: chat.id });

            return { success: true, group, chat };
        } catch (err) {
            console.error('createGroup error:', err);
            showToast('Ошибка создания группы: ' + err.message, true);
            return { success: false };
        }
    }

    async getGroupInfo(groupId) {
        try {
            const { data: group, error } = await this.supabase
                .from('groups')
                .select(`
                    *,
                    members:group_members(
                        user_id,
                        role,
                        joined_at,
                        profile:profiles(id, full_name, username, bio, is_online, last_seen, is_verified, avatar_url)
                    )
                `)
                .eq('id', groupId).single();
            if (error) throw error;
            if (group && group.members) {
                const roleOrder = { admin: 0, moderator: 1, member: 2 };
                group.members.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);
            }
            return group;
        } catch (err) {
            console.error('getGroupInfo error:', err);
            return null;
        }
    }

    async addMembers(groupId, userIds) {
        try {
            const userId = window.currentUser?.id;
            if (!userId) throw new Error('Не авторизован');
            
            const ok = await this.checkPermission(groupId, userId, 'add_members');
            if (!ok) throw new Error('Недостаточно прав');

            const { data: chat } = await this.supabase.from('chats').select('id').eq('group_id', groupId).single();
            
            const added = [];
            for (const uid of userIds) {
                const { data: ex } = await this.supabase.from('group_members').select('user_id').eq('group_id', groupId).eq('user_id', uid).maybeSingle();
                if (!ex) {
                    const { error: insErr } = await this.supabase.from('group_members').insert({ 
                        group_id: groupId, 
                        user_id: uid, 
                        role: 'member', 
                        joined_at: new Date().toISOString() 
                    });
                    if (!insErr) {
                        added.push(uid);
                        const { data: p } = await this.supabase.from('profiles').select('username, full_name').eq('id', uid).single();
                        const name = p?.full_name || p?.username || uid;
                        await this._addSystemMessage(chat.id, `👤 ${name} присоединился к группе`);
                    }
                }
            }
            
            if (added.length > 0) {
                await this.updateMemberCount(groupId);
                await this.updateGroupChat(groupId);
                showToast(`Добавлено участников: ${added.length}`);
            } else {
                showToast('Новых участников не добавлено', true);
            }
            
            return { success: true, added };
        } catch (err) {
            console.error('addMembers error:', err);
            showToast('Ошибка: ' + err.message, true);
            return { success: false };
        }
    }

    async removeMember(groupId, userId) {
        try {
            const currentUserId = window.currentUser?.id;
            if (!currentUserId) throw new Error('Не авторизован');
            
            const ok = await this.checkPermission(groupId, currentUserId, 'remove_members');
            if (!ok) throw new Error('Недостаточно прав');
            
            const g = await this.getGroupInfo(groupId);
            if (g && g.created_by === userId) throw new Error('Нельзя удалить создателя');
            
            const { data: chat } = await this.supabase.from('chats').select('id').eq('group_id', groupId).single();
            const { data: p } = await this.supabase.from('profiles').select('username, full_name').eq('id', userId).single();
            const name = p?.full_name || p?.username || userId;
            
            await this.supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
            await this._addSystemMessage(chat.id, `❌ ${name} удалён из группы`);
            await this.updateMemberCount(groupId);
            await this.updateGroupChat(groupId);
            showToast('Участник удалён');
            return { success: true };
        } catch (err) {
            showToast('Ошибка: ' + err.message, true);
            return { success: false };
        }
    }

    async leaveGroup(groupId) {
        try {
            const userId = window.currentUser?.id;
            if (!userId) throw new Error('Не авторизован');
            
            const g = await this.getGroupInfo(groupId);
            if (!g) throw new Error('Группа не найдена');
            
            const { data: chat } = await this.supabase.from('chats').select('id').eq('group_id', groupId).single();
            const name = window.currentProfile?.full_name || window.currentProfile?.username || 'Пользователь';

            if (g.created_by === userId) {
                const others = g.members.filter(m => m.user_id !== userId);
                if (others.length === 0) {
                    return await this.deleteGroup(groupId);
                }
                const nextAdmin = others[0];
                await this.setRole(groupId, nextAdmin.user_id, 'admin');
                await this._addSystemMessage(chat.id, `👑 Права администратора переданы ${nextAdmin.profile?.full_name || nextAdmin.profile?.username}`);
            }

            await this.supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
            await this._addSystemMessage(chat.id, `👋 ${name} покинул группу`);
            await this.updateMemberCount(groupId);
            await this.updateGroupChat(groupId);

            if (window.currentChat?.group?.id === groupId && typeof closeChat === 'function') closeChat();
            showToast('Вы покинули группу');
            if (typeof loadDialogs === 'function') await loadDialogs();
            return { success: true };
        } catch (err) {
            showToast('Ошибка: ' + err.message, true);
            return { success: false };
        }
    }

    async deleteGroup(groupId) {
        try {
            const userId = window.currentUser?.id;
            if (!userId) throw new Error('Не авторизован');
            
            const g = await this.getGroupInfo(groupId);
            if (!g || g.created_by !== userId) throw new Error('Только создатель может удалить группу');

            const { data: chat } = await this.supabase.from('chats').select('id').eq('group_id', groupId).maybeSingle();
            if (chat) {
                await this.supabase.from('messages').delete().eq('chat_id', chat.id);
                await this.supabase.from('chats').delete().eq('id', chat.id);
            }
            await this.supabase.from('group_members').delete().eq('group_id', groupId);
            await this.supabase.from('groups').delete().eq('id', groupId);

            if (window.currentChat?.group?.id === groupId && typeof closeChat === 'function') closeChat();
            showToast('Группа удалена');
            if (typeof loadDialogs === 'function') await loadDialogs();
            return { success: true };
        } catch (err) {
            showToast('Ошибка: ' + err.message, true);
            return { success: false };
        }
    }

    async setRole(groupId, userId, role) {
        try {
            const currentUserId = window.currentUser?.id;
            if (!currentUserId) throw new Error('Не авторизован');
            
            const g = await this.getGroupInfo(groupId);
            if (!g || (g.created_by !== currentUserId && currentUserId !== g.created_by)) throw new Error('Только создатель назначает роли');
            if (userId === g.created_by) throw new Error('Нельзя изменить роль создателя');
            
            const { data: chat } = await this.supabase.from('chats').select('id').eq('group_id', groupId).single();
            const { data: p } = await this.supabase.from('profiles').select('username, full_name').eq('id', userId).single();
            const name = p?.full_name || p?.username || userId;
            
            let message = '';
            if (role === 'admin') {
                message = `👑 ${name} назначен администратором`;
            } else if (role === 'moderator') {
                message = `🛡️ ${name} назначен модератором`;
            } else if (role === 'member') {
                message = `📝 ${name} сняты права, теперь участник`;
            }
            
            await this.supabase.from('group_members').update({ role }).eq('group_id', groupId).eq('user_id', userId);
            await this._addSystemMessage(chat.id, message);
            showToast(`Роль изменена`);
            return { success: true };
        } catch (err) {
            showToast('Ошибка: ' + err.message, true);
            return { success: false };
        }
    }

    async checkPermission(groupId, userId, action) {
        try {
            const { data: m } = await this.supabase.from('group_members').select('role').eq('group_id', groupId).eq('user_id', userId).single();
            if (!m) return false;
            if (m.role === 'admin') return true;
            const perms = { add_members: ['moderator'], remove_members: ['moderator'], change_name: ['moderator'], change_description: ['moderator'] };
            return perms[action]?.includes(m.role) || false;
        } catch { return false; }
    }

    async updateGroupInfo(groupId, updates) {
        try {
            const userId = window.currentUser?.id;
            if (!userId) throw new Error('Не авторизован');
            
            const group = await this.getGroupInfo(groupId);
            if (!group) throw new Error('Группа не найдена');
            
            const isAdmin = group.created_by === userId;
            const isMod = group.members?.find(m => m.user_id === userId)?.role === 'moderator';
            
            if (!isAdmin && !isMod) throw new Error('Недостаточно прав');
            
            const { data: chat } = await this.supabase.from('chats').select('id').eq('group_id', groupId).single();
            
            if (updates.name && updates.name !== group.name) {
                await this._addSystemMessage(chat.id, `✏️ Название группы изменено с «${group.name}» на «${updates.name}»`);
            }
            if (updates.description && updates.description !== group.description) {
                await this._addSystemMessage(chat.id, `📝 Описание группы обновлено`);
            }
            
            await this.supabase.from('groups').update({ 
                ...updates, 
                updated_at: new Date().toISOString() 
            }).eq('id', groupId);
            
            showToast('Группа обновлена');
            return { success: true };
        } catch (err) {
            showToast('Ошибка: ' + err.message, true);
            return { success: false };
        }
    }

    async _addSystemMessage(chatId, text) {
        try {
            await this.supabase.from('messages').insert({ 
                chat_id: chatId, 
                user_id: '00000000-0000-0000-0000-000000000001', // BOT_USER_ID
                text: text, 
                is_system: true, 
                created_at: new Date().toISOString() 
            });
            
            if (window.currentChat?.id === chatId && typeof renderSystemMessage === 'function') {
                renderSystemMessage(text, new Date().toISOString());
            }
        } catch (err) { 
            console.error('_addSystemMessage:', err); 
        }
    }

    async updateMemberCount(groupId) {
        try {
            const { count } = await this.supabase.from('group_members').select('*', { count: 'exact', head: true }).eq('group_id', groupId);
            await this.supabase.from('groups').update({ member_count: count }).eq('id', groupId);
        } catch (err) { console.error('updateMemberCount error:', err); }
    }

    async updateGroupChat(groupId) {
        try {
            const { data: members } = await this.supabase.from('group_members').select('user_id').eq('group_id', groupId);
            if (members) {
                await this.supabase.from('chats').update({ participants: members.map(m => m.user_id) }).eq('group_id', groupId);
            }
        } catch (err) { console.error('updateGroupChat error:', err); }
    }

    async searchUsersForGroup(term, groupId) {
        if (!term || term.length < 2) return [];
        try {
            const userId = window.currentUser?.id;
            if (!userId) return [];
            
            const { data: members } = await this.supabase.from('group_members').select('user_id').eq('group_id', groupId);
            const memberIds = members.map(m => m.user_id);
            const { data: users } = await this.supabase.from('profiles')
                .select('id, username, full_name, is_verified')
                .or(`username.ilike.%${term}%,full_name.ilike.%${term}%`)
                .not('id', 'in', `(${memberIds.join(',')})`)
                .neq('id', userId)
                .limit(20);
            return users || [];
        } catch (err) { 
            console.error('searchUsersForGroup error:', err);
            return []; 
        }
    }
}

let groupManager = null;

async function initGroups() {
    // ИСПРАВЛЕНО: проверяем window.currentUser
    if (!supabaseClient) {
        console.log('initGroups: waiting for supabaseClient...');
        setTimeout(initGroups, 500);
        return;
    }
    
    if (!window.currentUser || !window.currentUser.id) {
        console.log('initGroups: waiting for currentUser...');
        setTimeout(initGroups, 500);
        return;
    }
    
    groupManager = new GroupManager(supabaseClient);
    window.groupManager = groupManager;
    
    const createGroupBtn = document.getElementById('create-group-menu-btn');
    if (createGroupBtn) {
        createGroupBtn.onclick = () => {
            if (typeof showCreateGroupModal === 'function') showCreateGroupModal();
        };
    }
    
    console.log('GroupManager инициализирован');
}

window.GroupManager = GroupManager;
window.groupManager = groupManager;
window.initGroups = initGroups;// groups.js — менеджер групп (ИСПРАВЛЕННЫЙ)

class GroupManager {
    constructor(client) {
        this.supabase = client;
    }

    async createGroup(name, description = '', memberIds = []) {
        try {
            if (!name.trim()) { showToast('Введите название группы', true); return { success: false }; }
            
            const userId = window.currentUser?.id;
            if (!userId) { showToast('Не авторизован', true); return { success: false }; }

            const { data: group, error: gErr } = await this.supabase
                .from('groups')
                .insert({ 
                    name: name.trim(), 
                    description: description.trim(), 
                    created_by: userId, 
                    member_count: 1 + memberIds.length,
                    avatar_emoji: '👥',
                    created_at: new Date().toISOString(), 
                    updated_at: new Date().toISOString() 
                })
                .select().single();
            if (gErr) throw gErr;

            await this.supabase.from('group_members').insert({ 
                group_id: group.id, 
                user_id: userId, 
                role: 'admin', 
                joined_at: new Date().toISOString() 
            });

            const valid = [];
            for (const uid of memberIds) {
                if (uid === userId) continue;
                const { error } = await this.supabase.from('group_members').insert({ 
                    group_id: group.id, 
                    user_id: uid, 
                    role: 'member', 
                    joined_at: new Date().toISOString() 
                });
                if (!error) valid.push(uid);
            }

            const participants = [userId, ...valid];
            const { data: chat, error: cErr } = await this.supabase
                .from('chats')
                .insert({ 
                    type: 'group', 
                    is_group: true, 
                    group_id: group.id, 
                    participants, 
                    created_at: new Date().toISOString(), 
                    updated_at: new Date().toISOString(), 
                    last_message: `Группа «${name}» создана` 
                })
                .select().single();
            if (cErr) throw cErr;

            await this._addSystemMessage(chat.id, `🎉 Группа «${name}» создана\n👥 Участников: ${participants.length}`);

            showToast(`Группа «${name}» создана!`);

            const modal = document.getElementById('create-group-modal');
            if (modal) modal.style.display = 'none';

            if (typeof loadDialogs === 'function') await loadDialogs();
            if (typeof openGroupChat === 'function') await openGroupChat(chat.id, { ...group, member_count: participants.length, chat_id: chat.id });

            return { success: true, group, chat };
        } catch (err) {
            console.error('createGroup error:', err);
            showToast('Ошибка создания группы: ' + err.message, true);
            return { success: false };
        }
    }

    async getGroupInfo(groupId) {
        try {
            const { data: group, error } = await this.supabase
                .from('groups')
                .select(`
                    *,
                    members:group_members(
                        user_id,
                        role,
                        joined_at,
                        profile:profiles(id, full_name, username, bio, is_online, last_seen, is_verified, avatar_url)
                    )
                `)
                .eq('id', groupId).single();
            if (error) throw error;
            if (group && group.members) {
                const roleOrder = { admin: 0, moderator: 1, member: 2 };
                group.members.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);
            }
            return group;
        } catch (err) {
            console.error('getGroupInfo error:', err);
            return null;
        }
    }

    async addMembers(groupId, userIds) {
        try {
            const userId = window.currentUser?.id;
            if (!userId) throw new Error('Не авторизован');
            
            const ok = await this.checkPermission(groupId, userId, 'add_members');
            if (!ok) throw new Error('Недостаточно прав');

            const { data: chat } = await this.supabase.from('chats').select('id').eq('group_id', groupId).single();
            
            const added = [];
            for (const uid of userIds) {
                const { data: ex } = await this.supabase.from('group_members').select('user_id').eq('group_id', groupId).eq('user_id', uid).maybeSingle();
                if (!ex) {
                    const { error: insErr } = await this.supabase.from('group_members').insert({ 
                        group_id: groupId, 
                        user_id: uid, 
                        role: 'member', 
                        joined_at: new Date().toISOString() 
                    });
                    if (!insErr) {
                        added.push(uid);
                        const { data: p } = await this.supabase.from('profiles').select('username, full_name').eq('id', uid).single();
                        const name = p?.full_name || p?.username || uid;
                        await this._addSystemMessage(chat.id, `👤 ${name} присоединился к группе`);
                    }
                }
            }
            
            if (added.length > 0) {
                await this.updateMemberCount(groupId);
                await this.updateGroupChat(groupId);
                showToast(`Добавлено участников: ${added.length}`);
            } else {
                showToast('Новых участников не добавлено', true);
            }
            
            return { success: true, added };
        } catch (err) {
            console.error('addMembers error:', err);
            showToast('Ошибка: ' + err.message, true);
            return { success: false };
        }
    }

    async removeMember(groupId, userId) {
        try {
            const currentUserId = window.currentUser?.id;
            if (!currentUserId) throw new Error('Не авторизован');
            
            const ok = await this.checkPermission(groupId, currentUserId, 'remove_members');
            if (!ok) throw new Error('Недостаточно прав');
            
            const g = await this.getGroupInfo(groupId);
            if (g && g.created_by === userId) throw new Error('Нельзя удалить создателя');
            
            const { data: chat } = await this.supabase.from('chats').select('id').eq('group_id', groupId).single();
            const { data: p } = await this.supabase.from('profiles').select('username, full_name').eq('id', userId).single();
            const name = p?.full_name || p?.username || userId;
            
            await this.supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
            await this._addSystemMessage(chat.id, `❌ ${name} удалён из группы`);
            await this.updateMemberCount(groupId);
            await this.updateGroupChat(groupId);
            showToast('Участник удалён');
            return { success: true };
        } catch (err) {
            showToast('Ошибка: ' + err.message, true);
            return { success: false };
        }
    }

    async leaveGroup(groupId) {
        try {
            const userId = window.currentUser?.id;
            if (!userId) throw new Error('Не авторизован');
            
            const g = await this.getGroupInfo(groupId);
            if (!g) throw new Error('Группа не найдена');
            
            const { data: chat } = await this.supabase.from('chats').select('id').eq('group_id', groupId).single();
            const name = window.currentProfile?.full_name || window.currentProfile?.username || 'Пользователь';

            if (g.created_by === userId) {
                const others = g.members.filter(m => m.user_id !== userId);
                if (others.length === 0) {
                    return await this.deleteGroup(groupId);
                }
                const nextAdmin = others[0];
                await this.setRole(groupId, nextAdmin.user_id, 'admin');
                await this._addSystemMessage(chat.id, `👑 Права администратора переданы ${nextAdmin.profile?.full_name || nextAdmin.profile?.username}`);
            }

            await this.supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
            await this._addSystemMessage(chat.id, `👋 ${name} покинул группу`);
            await this.updateMemberCount(groupId);
            await this.updateGroupChat(groupId);

            if (window.currentChat?.group?.id === groupId && typeof closeChat === 'function') closeChat();
            showToast('Вы покинули группу');
            if (typeof loadDialogs === 'function') await loadDialogs();
            return { success: true };
        } catch (err) {
            showToast('Ошибка: ' + err.message, true);
            return { success: false };
        }
    }

    async deleteGroup(groupId) {
        try {
            const userId = window.currentUser?.id;
            if (!userId) throw new Error('Не авторизован');
            
            const g = await this.getGroupInfo(groupId);
            if (!g || g.created_by !== userId) throw new Error('Только создатель может удалить группу');

            const { data: chat } = await this.supabase.from('chats').select('id').eq('group_id', groupId).maybeSingle();
            if (chat) {
                await this.supabase.from('messages').delete().eq('chat_id', chat.id);
                await this.supabase.from('chats').delete().eq('id', chat.id);
            }
            await this.supabase.from('group_members').delete().eq('group_id', groupId);
            await this.supabase.from('groups').delete().eq('id', groupId);

            if (window.currentChat?.group?.id === groupId && typeof closeChat === 'function') closeChat();
            showToast('Группа удалена');
            if (typeof loadDialogs === 'function') await loadDialogs();
            return { success: true };
        } catch (err) {
            showToast('Ошибка: ' + err.message, true);
            return { success: false };
        }
    }

    async setRole(groupId, userId, role) {
        try {
            const currentUserId = window.currentUser?.id;
            if (!currentUserId) throw new Error('Не авторизован');
            
            const g = await this.getGroupInfo(groupId);
            if (!g || (g.created_by !== currentUserId && currentUserId !== g.created_by)) throw new Error('Только создатель назначает роли');
            if (userId === g.created_by) throw new Error('Нельзя изменить роль создателя');
            
            const { data: chat } = await this.supabase.from('chats').select('id').eq('group_id', groupId).single();
            const { data: p } = await this.supabase.from('profiles').select('username, full_name').eq('id', userId).single();
            const name = p?.full_name || p?.username || userId;
            
            let message = '';
            if (role === 'admin') {
                message = `👑 ${name} назначен администратором`;
            } else if (role === 'moderator') {
                message = `🛡️ ${name} назначен модератором`;
            } else if (role === 'member') {
                message = `📝 ${name} сняты права, теперь участник`;
            }
            
            await this.supabase.from('group_members').update({ role }).eq('group_id', groupId).eq('user_id', userId);
            await this._addSystemMessage(chat.id, message);
            showToast(`Роль изменена`);
            return { success: true };
        } catch (err) {
            showToast('Ошибка: ' + err.message, true);
            return { success: false };
        }
    }

    async checkPermission(groupId, userId, action) {
        try {
            const { data: m } = await this.supabase.from('group_members').select('role').eq('group_id', groupId).eq('user_id', userId).single();
            if (!m) return false;
            if (m.role === 'admin') return true;
            const perms = { add_members: ['moderator'], remove_members: ['moderator'], change_name: ['moderator'], change_description: ['moderator'] };
            return perms[action]?.includes(m.role) || false;
        } catch { return false; }
    }

    async updateGroupInfo(groupId, updates) {
        try {
            const userId = window.currentUser?.id;
            if (!userId) throw new Error('Не авторизован');
            
            const group = await this.getGroupInfo(groupId);
            if (!group) throw new Error('Группа не найдена');
            
            const isAdmin = group.created_by === userId;
            const isMod = group.members?.find(m => m.user_id === userId)?.role === 'moderator';
            
            if (!isAdmin && !isMod) throw new Error('Недостаточно прав');
            
            const { data: chat } = await this.supabase.from('chats').select('id').eq('group_id', groupId).single();
            
            if (updates.name && updates.name !== group.name) {
                await this._addSystemMessage(chat.id, `✏️ Название группы изменено с «${group.name}» на «${updates.name}»`);
            }
            if (updates.description && updates.description !== group.description) {
                await this._addSystemMessage(chat.id, `📝 Описание группы обновлено`);
            }
            
            await this.supabase.from('groups').update({ 
                ...updates, 
                updated_at: new Date().toISOString() 
            }).eq('id', groupId);
            
            showToast('Группа обновлена');
            return { success: true };
        } catch (err) {
            showToast('Ошибка: ' + err.message, true);
            return { success: false };
        }
    }

    async _addSystemMessage(chatId, text) {
        try {
            await this.supabase.from('messages').insert({ 
                chat_id: chatId, 
                user_id: '00000000-0000-0000-0000-000000000001', // BOT_USER_ID
                text: text, 
                is_system: true, 
                created_at: new Date().toISOString() 
            });
            
            if (window.currentChat?.id === chatId && typeof renderSystemMessage === 'function') {
                renderSystemMessage(text, new Date().toISOString());
            }
        } catch (err) { 
            console.error('_addSystemMessage:', err); 
        }
    }

    async updateMemberCount(groupId) {
        try {
            const { count } = await this.supabase.from('group_members').select('*', { count: 'exact', head: true }).eq('group_id', groupId);
            await this.supabase.from('groups').update({ member_count: count }).eq('id', groupId);
        } catch (err) { console.error('updateMemberCount error:', err); }
    }

    async updateGroupChat(groupId) {
        try {
            const { data: members } = await this.supabase.from('group_members').select('user_id').eq('group_id', groupId);
            if (members) {
                await this.supabase.from('chats').update({ participants: members.map(m => m.user_id) }).eq('group_id', groupId);
            }
        } catch (err) { console.error('updateGroupChat error:', err); }
    }

    async searchUsersForGroup(term, groupId) {
        if (!term || term.length < 2) return [];
        try {
            const userId = window.currentUser?.id;
            if (!userId) return [];
            
            const { data: members } = await this.supabase.from('group_members').select('user_id').eq('group_id', groupId);
            const memberIds = members.map(m => m.user_id);
            const { data: users } = await this.supabase.from('profiles')
                .select('id, username, full_name, is_verified')
                .or(`username.ilike.%${term}%,full_name.ilike.%${term}%`)
                .not('id', 'in', `(${memberIds.join(',')})`)
                .neq('id', userId)
                .limit(20);
            return users || [];
        } catch (err) { 
            console.error('searchUsersForGroup error:', err);
            return []; 
        }
    }
}

let groupManager = null;

async function initGroups() {
    // ИСПРАВЛЕНО: проверяем window.currentUser
    if (!supabaseClient) {
        console.log('initGroups: waiting for supabaseClient...');
        setTimeout(initGroups, 500);
        return;
    }
    
    if (!window.currentUser || !window.currentUser.id) {
        console.log('initGroups: waiting for currentUser...');
        setTimeout(initGroups, 500);
        return;
    }
    
    groupManager = new GroupManager(supabaseClient);
    window.groupManager = groupManager;
    
    const createGroupBtn = document.getElementById('create-group-menu-btn');
    if (createGroupBtn) {
        createGroupBtn.onclick = () => {
            if (typeof showCreateGroupModal === 'function') showCreateGroupModal();
        };
    }
    
    console.log('GroupManager инициализирован');
}

window.GroupManager = GroupManager;
window.groupManager = groupManager;
window.initGroups = initGroups;
