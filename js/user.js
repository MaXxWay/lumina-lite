// user.js — пользователи, онлайн-статус

async function setUserOnlineStatus(isOnline) {
    if (!currentUser) return;
    isUserOnline = isOnline;
    try {
        await supabaseClient.from('profiles')
            .update({ is_online: isOnline, last_seen: new Date().toISOString() })
            .eq('id', currentUser.id);
    } catch {}
}

function startOnlineHeartbeat() {
    if (onlineInterval) clearInterval(onlineInterval);
    
    setUserOnlineStatus(true);
    
    onlineInterval = setInterval(() => {
        if (currentUser && isUserOnline) {
            setUserOnlineStatus(true);
        }
    }, 180000);
    
    window.addEventListener('beforeunload', () => {
        setUserOnlineStatus(false);
    });
}

function stopOnlineHeartbeat() {
    if (onlineInterval) clearInterval(onlineInterval);
    if (currentUser) setUserOnlineStatus(false);
}

async function updateLastSeen() {
    if (!currentUser) return;
    const now = Date.now();
    if (now - lastActivityUpdate < 30000) return;
    lastActivityUpdate = now;
    try {
        await supabaseClient.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', currentUser.id);
    } catch {}
}

function subscribeToUserStatus(userId) {
    if (statusSubscription) supabaseClient.removeChannel(statusSubscription);
    statusSubscription = supabaseClient.channel(`status-${userId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, payload => {
            if (payload.new && currentChat?.other_user?.id === userId && typeof updateChatStatusFromProfile === 'function') {
                updateChatStatusFromProfile(payload.new);
            }
            // Обновляем аватар если он изменился
            if (payload.new && payload.new.avatar_url !== payload.old?.avatar_url) {
                updateUserAvatarInUI(userId, payload.new.avatar_url);
            }
        })
        .subscribe();
}

function updateUserAvatarInUI(userId, avatarUrl) {
    // Обновляем аватар в списке диалогов
    document.querySelectorAll(`.dialog-item[data-other-user-id="${userId}"] .dialog-avatar`).forEach(avatar => {
        if (avatarUrl) {
            avatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            const name = avatar.closest('.dialog-item')?.querySelector('.dialog-name')?.textContent || '?';
            avatar.innerHTML = `<div class="avatar-letter">${escapeHtml(name.charAt(0))}</div>`;
        }
    });
    
    // Обновляем аватар в сообщениях
    document.querySelectorAll(`.message .msg-avatar`).forEach(avatar => {
        const msg = avatar.closest('.message');
        if (msg && msg.dataset.userId === userId) {
            if (avatarUrl) {
                avatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar">`;
            }
        }
    });
    
    // Обновляем аватар в шапке чата
    if (currentChat?.other_user?.id === userId) {
        const chatAvatar = document.getElementById('chat-user-avatar');
        if (chatAvatar) {
            if (avatarUrl) {
                chatAvatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar">`;
            } else {
                const name = currentChat.other_user?.full_name || currentChat.other_user?.username || '?';
                chatAvatar.textContent = name.charAt(0).toUpperCase();
            }
        }
    }
}

function subscribeToUserDeletion() {
    const ch = supabaseClient.channel('user-deletions')
        .on('postgres_changes', { event: 'DELETE', schema: 'auth', table: 'users' }, async payload => {
            if (payload.old.id === currentUser?.id) {
                showToast('Ваш аккаунт удалён', true);
                setTimeout(() => logout(), 2000);
                return;
            }
            await loadDialogs();
            if (currentChat?.other_user?.id === payload.old.id) {
                currentChat = null;
                document.getElementById('messages').innerHTML = '<div class="msg-stub"><p>Пользователь удалён</p></div>';
                document.querySelector('.input-zone').style.display = 'none';
                if (isMobileDevice()) closeChat();
            }
        })
        .subscribe();
    return ch;
}

async function loadAllUsers() {
    try {
        const { data } = await supabaseClient.from('profiles')
            .select('id, username, full_name, avatar_url, bio, is_verified')
            .neq('id', currentUser.id)
            .neq('id', BOT_USER_ID);
        allUsers = data || [];
    } catch { allUsers = []; }
}

async function checkUserExists(userId) {
    if (userId === BOT_USER_ID || userId === SAVED_CHAT_ID) return true;
    try {
        const { data } = await supabaseClient.from('profiles').select('id').eq('id', userId).maybeSingle();
        return data !== null;
    } catch { return false; }
}

async function searchUsersByUsername(username) {
    if (!username || username.length < 1) return [];
    const clean = username.replace(/^@/, '').trim();
    try {
        const { data } = await supabaseClient.from('profiles')
            .select('id, username, full_name, avatar_url, bio, is_verified')
            .or(`username.ilike.%${clean}%,full_name.ilike.%${clean}%`)
            .neq('id', currentUser.id)
            .limit(10);
        const users = data || [];
        const q = clean.toLowerCase();
        if (['lumina', 'bot', 'бот'].some(t => t.includes(q) || q.includes(t))) {
            users.unshift({ id: BOT_USER_ID, username: BOT_PROFILE.username, full_name: BOT_PROFILE.full_name, isBot: true });
        }
        if (['saved', 'избранное', 'закладки'].some(t => t.includes(q) || q.includes(t))) {
            users.unshift({ id: SAVED_CHAT_ID, username: SAVED_CHAT.username, full_name: SAVED_CHAT.full_name, isSaved: true });
        }
        return users;
    } catch { return []; }
}

async function ensureBotChat() {
    try {
        const { data: existing } = await supabaseClient.from('chats')
            .select('id')
            .eq('type', 'private')
            .contains('participants', [currentUser.id, BOT_USER_ID])
            .maybeSingle();
        
        if (existing) {
            const { data: botMessages } = await supabaseClient.from('messages')
                .select('id')
                .eq('chat_id', existing.id)
                .eq('user_id', BOT_USER_ID)
                .limit(1);
            
            if (!botMessages || botMessages.length === 0) {
                await supabaseClient.from('messages').insert({
                    text: '👋 Добро пожаловать в Lumina Lite!\n\nЗдесь можно:\n• Найти друзей по @username\n• Создать группу\n• Настроить профиль и аватар\n\nПриятного общения! 🚀',
                    user_id: BOT_USER_ID,
                    chat_id: existing.id,
                    is_system: false,
                    created_at: new Date().toISOString()
                });
            }
            return;
        }
        
        const { data: chat, error } = await supabaseClient.from('chats')
            .insert({ 
                type: 'private', 
                participants: [currentUser.id, BOT_USER_ID], 
                created_at: new Date().toISOString(), 
                updated_at: new Date().toISOString(), 
                is_bot_chat: true 
            })
            .select()
            .single();
        if (error) throw error;
        
        if (chat) {
            await supabaseClient.from('messages').insert({
                text: '👋 Добро пожаловать в Lumina Lite!\n\nЗдесь можно:\n• Найти друзей по @username\n• Создать группу\n• Настроить профиль и аватар\n\nПриятного общения! 🚀',
                user_id: BOT_USER_ID,
                chat_id: chat.id,
                is_system: false,
                created_at: new Date().toISOString()
            });
        }
    } catch (err) { 
        console.error('ensureBotChat:', err); 
    }
}

async function ensureSavedChat() {
    try {
        const userId = window.currentUser?.id || currentUser?.id;
        if (!userId) {
            console.error('ensureSavedChat: currentUser не определён');
            return;
        }
        
        const { data: existing } = await supabaseClient.from('chats')
            .select('id').eq('type', 'saved').contains('participants', [userId]).maybeSingle();
        if (existing) return;
        
        const { data: chat } = await supabaseClient.from('chats')
            .insert({ 
                type: 'saved', 
                participants: [userId], 
                created_at: new Date().toISOString(), 
                updated_at: new Date().toISOString(), 
                is_saved_chat: true 
            })
            .select().single();
        if (chat) {
            await supabaseClient.from('messages').insert({
                text: '💾 Избранное\n\nЗдесь хранятся ваши сохранённые сообщения.',
                user_id: userId, 
                chat_id: chat.id, 
                is_system: true, 
                is_read: true,
                created_at: new Date().toISOString()
            });
        }
    } catch (err) { 
        console.error('ensureSavedChat:', err); 
    }
}

async function cleanupDeadChats() {
    if (!currentUser) return;
    try {
        const { data: chats } = await supabaseClient.from('chats').select('*').contains('participants', [currentUser.id]);
        for (const chat of chats || []) {
            if (chat.is_group) continue;
            const otherId = chat.participants?.find(id => id !== currentUser.id);
            if (otherId && otherId !== BOT_USER_ID && otherId !== SAVED_CHAT_ID && !(await checkUserExists(otherId))) {
                await supabaseClient.from('chats').delete().eq('id', chat.id);
                await supabaseClient.from('messages').delete().eq('chat_id', chat.id);
            }
        }
        await loadDialogs();
    } catch {}
}

window.setUserOnlineStatus = setUserOnlineStatus;
window.startOnlineHeartbeat = startOnlineHeartbeat;
window.stopOnlineHeartbeat = stopOnlineHeartbeat;
window.updateLastSeen = updateLastSeen;
window.subscribeToUserStatus = subscribeToUserStatus;
window.updateUserAvatarInUI = updateUserAvatarInUI;
window.subscribeToUserDeletion = subscribeToUserDeletion;
window.loadAllUsers = loadAllUsers;
window.checkUserExists = checkUserExists;
window.searchUsersByUsername = searchUsersByUsername;
window.ensureBotChat = ensureBotChat;
window.ensureSavedChat = ensureSavedChat;
window.cleanupDeadChats = cleanupDeadChats;
