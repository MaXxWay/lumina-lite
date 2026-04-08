// groups.js — менеджер групп

class GroupManager {
    constructor(client) {
        this.supabase = client;
    }

    async createGroup(name, description = '', memberIds = []) {
        try {
            if (!name.trim()) { showToast('Введите название группы', true); return { success: false }; }

            const { data: group, error: gErr } = await this.supabase
                .from('groups')
                .insert({ name: name.trim(), description: description.trim(), created_by: currentUser.id, member_count: 1 + memberIds.length, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                .select().single();
            if (gErr) throw gErr;

            // Добавляем создателя
            await this.supabase.from('group_members').insert({ group_id: group.id, user_id: currentUser.id, role: 'admin', joined_at: new Date().toISOString() });

            // Добавляем участников
            const valid = [];
            for (const uid of memberIds) {
                if (uid === currentUser.id) continue;
                const { error } = await this.supabase.from('group_members').insert({ group_id: group.id, user_id: uid, role: 'member', joined_at: new Date().toISOString() });
                if (!error) valid.push(uid);
            }

            const participants = [currentUser.id, ...valid];
            const { data: chat, error: cErr } = await this.supabase
                .from('chats')
                .insert({ type: 'group', is_group: true, group_id: group.id, participants, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_message: `Группа «${name}» создана` })
                .select().single();
            if (cErr) throw cErr;

            await this.supabase.from('messages').insert({
                chat_id: chat.id, user_id: BOT_USER_ID,
                text: `🎉 Группа «${name}» создана!\n\n👥 Участников: ${participants.length}`,
                is_system: true, created_at: new Date().toISOString()
            });

            showToast(`Группа «${name}» создана!`);

            // Закрываем модалку
            const m = document.getElementById('create-group-modal');
            if (m) m.style.display = 'none';

            await loadDialogs();
            await openGroupChat(chat.id, { ...group, member_count: participants.length, chat_id: chat.id });

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
                .select(`*, members:group_members(user_id, role, joined_at, profile:profiles!user_id(id, full_name, username, is_online, last_seen))`)
                .eq('id', groupId).single();
            if (error) throw error;
            if (group.members) {
                group.members.sort((a, b) => ({ admin: 0, moderator: 1, member: 2 }[a.role] - { admin: 0, moderator: 1, member: 2 }[b.role]));
            }
            return group;
        } catch (err) {
            console.error('getGroupInfo error:', err);
            return null;
        }
    }

    async addMembers(groupId, userIds) {
        try {
            const ok = await this.checkPermission(groupId, currentUser.id, 'add_members');
            if (!ok) throw new Error('Недостаточно прав');

            const added = [];
            for (const uid of userIds) {
                const { data: ex } = await this.supabase.from('group_members').select('user_id').eq('group_id', groupId).eq('user_id', uid).maybeSingle();
                if (!ex) {
                    await this.supabase.from('group_members').insert({ group_id: groupId, user_id: uid, role: 'member', joined_at: new Date().toISOString() });
                    added.push(uid);
                    const { data: p } = await this.supabase.from('profiles').select('username').eq('id', uid).single();
                    await this._systemMsg(groupId, `@${p?.username || uid} присоединился к группе`);
                }
            }
            await this.updateMemberCount(groupId);
            await this.updateGroupChat(groupId);
            showToast(`Добавлено участников: ${added.length}`);
            return { success: true, added };
        } catch (err) {
            showToast('Ошибка: ' + err.message, true);
            return { success: false };
        }
    }

    async removeMember(groupId, userId) {
        try {
            const ok = await this.checkPermission(groupId, currentUser.id, 'remove_members');
            if (!ok) throw new Error('Недостаточно прав');
            const g = await this.getGroupInfo(groupId);
            if (g.created_by === userId) throw new Error('Нельзя удалить создателя');
            const { data: p } = await this.supabase.from('profiles').select('username').eq('id', userId).single();
            await this.supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
            await this._systemMsg(groupId, `@${p?.username || userId} удалён из группы`);
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
            const g = await this.getGroupInfo(groupId);
            if (!g) throw new Error('Группа не найдена');

            if (g.created_by === currentUser.id) {
                const others = g.members.filter(m => m.user_id !== currentUser.id);
                if (others.length === 0) {
                    return await this.deleteGroup(groupId);
                }
                const nextAdmin = g.members.find(m => m.role === 'admin' && m.user_id !== currentUser.id) || others[0];
                await this.setRole(groupId, nextAdmin.user_id, 'admin');
            }

            await this.supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', currentUser.id);
            await this._systemMsg(groupId, `@${currentProfile?.username} покинул группу`);
            await this.updateMemberCount(groupId);
            await this.updateGroupChat(groupId);

            if (currentChat?.group?.id === groupId && typeof closeChat === 'function') closeChat();
            showToast('Вы покинули группу');
            await loadDialogs();
            return { success: true };
        } catch (err) {
            showToast('Ошибка: ' + err.message, true);
            return { success: false };
        }
    }

    async deleteGroup(groupId) {
        try {
            const g = await this.getGroupInfo(groupId);
            if (g?.created_by !== currentUser.id) throw new Error('Только создатель может удалить группу');

            const { data: chat } = await this.supabase.from('chats').select('id').eq('group_id', groupId).maybeSingle();
            if (chat) {
                await this.supabase.from('messages').delete().eq('chat_id', chat.id);
                await this.supabase.from('chats').delete().eq('id', chat.id);
            }
            await this.supabase.from('group_members').delete().eq('group_id', groupId);
            await this.supabase.from('groups').delete().eq('id', groupId);

            if (currentChat?.group?.id === groupId && typeof closeChat === 'function') closeChat();
            showToast('Группа удалена');
            await loadDialogs();
            return { success: true };
        } catch (err) {
            showToast('Ошибка: ' + err.message, true);
            return { success: false };
        }
    }

    async setRole(groupId, userId, role) {
        try {
            const g = await this.getGroupInfo(groupId);
            if (g.created_by !== currentUser.id) throw new Error('Только создатель назначает роли');
            if (userId === g.created_by) throw new Error('Нельзя изменить роль создателя');
            await this.supabase.from('group_members').update({ role }).eq('group_id', groupId).eq('user_id', userId);
            const names = { admin: 'администратором', moderator: 'модератором', member: 'участником' };
            await this._systemMsg(groupId, `Пользователь назначен ${names[role]}`);
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
            const perms = { add_members: ['moderator'], remove_members: ['moderator'], change_name: [], delete_group: [] };
            return perms[action]?.includes(m.role) || false;
        } catch { return false; }
    }

    async updateGroupInfo(groupId, updates) {
        try {
            const ok = await this.checkPermission(groupId, currentUser.id, 'change_name');
            if (!ok) throw new Error('Недостаточно прав');
            await this.supabase.from('groups').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', groupId);
            if (updates.name) await this._systemMsg(groupId, `Название изменено на «${updates.name}»`);
            showToast('Группа обновлена');
            return { success: true };
        } catch (err) {
            showToast('Ошибка: ' + err.message, true);
            return { success: false };
        }
    }

    async _systemMsg(groupId, text) {
        try {
            const { data: chat } = await this.supabase.from('chats').select('id').eq('group_id', groupId).maybeSingle();
            if (chat) {
                await this.supabase.from('messages').insert({ chat_id: chat.id, user_id: BOT_USER_ID, text: `📢 ${text}`, is_system: true, created_at: new Date().toISOString() });
            }
        } catch (err) { console.error('_systemMsg:', err); }
    }

    async updateMemberCount(groupId) {
        try {
            const { count } = await this.supabase.from('group_members').select('*', { count: 'exact', head: true }).eq('group_id', groupId);
            await this.supabase.from('groups').update({ member_count: count }).eq('id', groupId);
        } catch {}
    }

    async updateGroupChat(groupId) {
        try {
            const { data: members } = await this.supabase.from('group_members').select('user_id').eq('group_id', groupId);
            await this.supabase.from('chats').update({ participants: members.map(m => m.user_id) }).eq('group_id', groupId);
        } catch {}
    }

    async searchUsersForGroup(term, groupId) {
        if (!term || term.length < 2) return [];
        try {
            const { data: members } = await this.supabase.from('group_members').select('user_id').eq('group_id', groupId);
            const memberIds = members.map(m => m.user_id);
            const { data: users } = await this.supabase.from('profiles')
                .select('id, username, full_name')
                .or(`username.ilike.%${term}%,full_name.ilike.%${term}%`)
                .not('id', 'in', `(${memberIds.join(',')})`)
                .neq('id', currentUser.id)
                .limit(20);
            return users || [];
        } catch { return []; }
    }
}

let groupManager = null;

async function initGroups() {
    groupManager = new GroupManager(supabaseClient);
    window.groupManager = groupManager;

    // Вешаем обработчик на кнопку (она уже есть в HTML)
    const btn = document.getElementById('create-group-btn');
    if (btn) {
        btn.onclick = () => {
            if (typeof showCreateGroupModal === 'function') showCreateGroupModal();
        };
    }
}

function debounce(fn, wait) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

window.GroupManager = GroupManager;
window.groupManager = groupManager;
window.initGroups = initGroups;
window.debounce = debounce;
