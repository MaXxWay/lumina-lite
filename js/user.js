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
    // Heartbeat каждые 4 минуты (сервер считает онлайном при last_seen < 7 мин)
    onlineInterval = setInterval(() => {
        if (currentUser && isUserOnline) setUserOnlineStatus(true);
    }, 240000);
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
        })
        .subscribe();
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
            .select('id, username, full_name')
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
            .select('id, username, full_name')
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
            .select('id').eq('type', 'private').contains('participants', [currentUser.id, BOT_USER_ID]).maybeSingle();
        if (existing) return;
        const { data: chat } = await supabaseClient.from('chats')
            .insert({ type: 'private', participants: [currentUser.id, BOT_USER_ID], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_bot_chat: true })
            .select().single();
        if (chat) {
            await supabaseClient.from('messages').insert({
                text: '👋 Добро пожаловать в Lumina Lite!\n\nЗдесь можно:\n• Найти друзей по @username\n• Создать группу\n• Настроить профиль\n\nПриятного общения! 🚀',
                user_id: BOT_USER_ID, chat_id: chat.id, is_welcome: true, is_system: true
            });
        }
    } catch (err) { console.error('ensureBotChat:', err); }
}

async function ensureSavedChat() {
    try {
        const { data: existing } = await supabaseClient.from('chats')
            .select('id').eq('type', 'saved').contains('participants', [currentUser.id]).maybeSingle();
        if (existing) return;
        const { data: chat } = await supabaseClient.from('chats')
            .insert({ type: 'saved', participants: [currentUser.id], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_saved_chat: true })
            .select().single();
        if (chat) {
            await supabaseClient.from('messages').insert({
                text: '💾 Избранное\n\nЗдесь хранятся ваши сохранённые сообщения.',
                user_id: currentUser.id, chat_id: chat.id, is_system: true, is_read: true
            });
        }
    } catch (err) { console.error('ensureSavedChat:', err); }
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

// Экспорт
window.setUserOnlineStatus = setUserOnlineStatus;
window.startOnlineHeartbeat = startOnlineHeartbeat;
window.stopOnlineHeartbeat = stopOnlineHeartbeat;
window.updateLastSeen = updateLastSeen;
window.subscribeToUserStatus = subscribeToUserStatus;
window.subscribeToUserDeletion = subscribeToUserDeletion;
window.loadAllUsers = loadAllUsers;
window.checkUserExists = checkUserExists;
window.searchUsersByUsername = searchUsersByUsername;
window.ensureBotChat = ensureBotChat;
window.ensureSavedChat = ensureSavedChat;
window.cleanupDeadChats = cleanupDeadChats;
