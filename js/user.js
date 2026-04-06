async function setUserOnlineStatus(isOnline) {
    if (!currentUser) return;
    isUserOnline = isOnline;
    try {
        const { error } = await supabaseClient.from('profiles')
            .update({ is_online: isOnline, last_seen: new Date().toISOString() })
            .eq('id', currentUser.id);
        if (error) console.error('Ошибка обновления статуса:', error);
    } catch (err) { console.error('Ошибка:', err); }
}

function startOnlineHeartbeat() {
    if (onlineInterval) clearInterval(onlineInterval);
    setUserOnlineStatus(true);
    onlineInterval = setInterval(() => {
        if (currentUser && isUserOnline) setUserOnlineStatus(true);
    }, 300000);
}

function stopOnlineHeartbeat() {
    if (onlineInterval) clearInterval(onlineInterval);
    if (currentUser) setUserOnlineStatus(false);
}

async function updateLastSeen() {
    if (!currentUser) return;
    const now = Date.now();
    if (now - lastActivityUpdate < 60000) return;
    lastActivityUpdate = now;
    try {
        await supabaseClient.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', currentUser.id);
    } catch (err) {}
}

function subscribeToUserStatus(userId) {
    if (statusSubscription) supabaseClient.removeChannel(statusSubscription);
    statusSubscription = supabaseClient.channel(`status-${userId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
            async (payload) => {
                if (payload.new && currentChat?.other_user?.id === userId && typeof updateChatStatusFromProfile === 'function') {
                    updateChatStatusFromProfile(payload.new);
                }
            })
        .subscribe();
}

function subscribeToUserDeletion() {
    const deletionChannel = supabaseClient.channel('user-deletions')
        .on('postgres_changes', { event: 'DELETE', schema: 'auth', table: 'users' }, async (payload) => {
            if (payload.old.id === currentUser?.id) {
                showToast('Ваш аккаунт был удален', true);
                setTimeout(() => logout(), 2000);
                return;
            }
            if (typeof loadDialogs === 'function') await loadDialogs();
            if (currentChat?.other_user?.id === payload.old.id) {
                currentChat = null;
                const messagesContainer = document.getElementById('messages');
                if (messagesContainer) messagesContainer.innerHTML = `<div class="msg-stub"><p>Пользователь удален</p></div>`;
                const inputZone = document.querySelector('.input-zone');
                if (inputZone) inputZone.style.display = 'none';
            }
        })
        .subscribe();
    return deletionChannel;
}

async function loadAllUsers() {
    try {
        const { data, error } = await supabaseClient.from('profiles')
            .select('id, username, full_name')
            .neq('id', currentUser.id)
            .neq('id', BOT_USER_ID);
        if (error) throw error;
        const validUsers = [];
        for (const user of data || []) {
            if (await checkUserExists(user.id)) validUsers.push(user);
        }
        allUsers = validUsers;
    } catch (err) {
        console.error('Ошибка загрузки пользователей:', err);
        allUsers = [];
    }
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
    const cleanUsername = username.replace(/^@/, '').trim();
    try {
        const { data } = await supabaseClient.from('profiles')
            .select('id, username, full_name')
            .or(`username.ilike.%${cleanUsername}%,full_name.ilike.%${cleanUsername}%`)
            .neq('id', currentUser.id)
            .limit(10);
        const users = data || [];
        const q = cleanUsername.toLowerCase();

        // Добавляем системные профили в поиск
        const botTokens = ['lumina', 'bot', 'lumina_bot', 'бот'];
        if (botTokens.some(token => token.includes(q) || q.includes(token))) {
            users.unshift({
                id: BOT_USER_ID,
                username: BOT_PROFILE.username,
                full_name: BOT_PROFILE.full_name,
                isBot: true
            });
        }
        const savedTokens = ['saved', 'favorite', 'избранное', 'закладки', 'избр'];
        if (savedTokens.some(token => token.includes(q) || q.includes(token))) {
            users.unshift({
                id: SAVED_CHAT_ID,
                username: SAVED_CHAT.username,
                full_name: SAVED_CHAT.full_name,
                isSaved: true
            });
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
            const { data: welcomeMsg } = await supabaseClient.from('messages')
                .select('id')
                .eq('chat_id', existing.id)
                .eq('is_welcome', true)
                .maybeSingle();
            if (!welcomeMsg) {
                await supabaseClient.from('messages').insert({
                    text: 'Добро пожаловать в мессенджер Lumina Lite! Начните общение прямо сейчас!',
                    user_id: BOT_USER_ID, chat_id: existing.id, is_welcome: true, is_system: true, is_read: false
                });
            }
            return;
        }
        
        const { data: newChat } = await supabaseClient.from('chats')
            .insert({ type: 'private', participants: [currentUser.id, BOT_USER_ID], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_bot_chat: true })
            .select().single();
        
        if (newChat) {
            await supabaseClient.from('messages').insert({
                text: 'Добро пожаловать в мессенджер Lumina Lite!\n\nЭто бот-помощник. Здесь можно:\n• Найти друзей по @username\n• Общаться в реальном времени\n• Настраивать профиль\n\nПриятного общения! 🚀',
                user_id: BOT_USER_ID, chat_id: newChat.id, is_welcome: true, is_system: true, is_read: false
            });
        }
    } catch (err) { console.error(err); }
}

async function ensureSavedChat() {
    try {
        const { data: existing } = await supabaseClient.from('chats')
            .select('id')
            .eq('type', 'saved')
            .contains('participants', [currentUser.id])
            .maybeSingle();
        if (existing) return;
        
        const { data: newChat } = await supabaseClient.from('chats')
            .insert({ id: SAVED_CHAT_ID, type: 'saved', participants: [currentUser.id], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_saved_chat: true })
            .select().single();
        
        if (newChat) {
            await supabaseClient.from('messages').insert({
                text: '💾 Избранное\n\nЗдесь будут храниться ваши сохраненные сообщения.',
                user_id: currentUser.id, chat_id: newChat.id, is_system: true, is_read: true
            });
        }
    } catch (err) { console.error('Ошибка создания чата Избранное:', err); }
}

async function cleanupDeadChats() {
    if (!currentUser) return;
    try {
        const { data: chats } = await supabaseClient.from('chats').select('*').contains('participants', [currentUser.id]);
        for (const chat of chats || []) {
            const otherId = chat.participants.find(id => id !== currentUser.id);
            if (otherId && otherId !== BOT_USER_ID && otherId !== SAVED_CHAT_ID && !(await checkUserExists(otherId))) {
                await supabaseClient.from('chats').delete().eq('id', chat.id);
                await supabaseClient.from('messages').delete().eq('chat_id', chat.id);
            }
        }
        if (typeof loadDialogs === 'function') await loadDialogs();
    } catch (err) { console.error('Ошибка очистки мертвых чатов:', err); }
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
