const SUPABASE_URL = 'https://ofxvazqurjgnxxuozjlr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9meHZhenF1cmpnbnh4dW96amxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTg4ODEsImV4cCI6MjA5MDE5NDg4MX0.Zf2pwQNmxe9wBt7tlZed-ntnLPzm7JGOuqkLuBkv0GE';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let currentProfile = null;
let currentChat = null;
let realtimeChannel = null;
let allUsers = [];

document.addEventListener('visibilitychange', async () => {
    if (!currentUser || !currentChat) return;
    
    if (!document.hidden) {
        console.log('📱 Вкладка активна, отмечаем сообщения...');
        await markChatMessagesAsRead(currentChat.id);
        
        if (window.readStatusObservers) {
            window.readStatusObservers.observer?.disconnect();
            window.readStatusObservers.mutationObserver?.disconnect();
        }
        window.readStatusObservers = setupReadStatusObserver();
    }
});

// ID официального бота
const BOT_USER_ID = '00000000-0000-0000-0000-000000000000';
const BOT_PROFILE = {
    id: BOT_USER_ID,
    username: 'lumina_bot',
    full_name: 'Lumina Bot',
    bio: 'Официальный бот мессенджера Lumina Lite',
    is_bot: true
};

async function checkUserExists(userId) {
    if (userId === BOT_USER_ID) return true;
    
    try {
        const { data, error } = await _supabase
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .maybeSingle();
        
        return !error && data !== null;
    } catch (err) {
        return false;
    }
}

const getEmail = (u) => `${u.toLowerCase().trim().replace(/^@/, '')}@lumina.local`;

// Добавьте в функцию logout (оба места)
async function logout() {
    stopOnlineHeartbeat();
    if (realtimeChannel) await _supabase.removeChannel(realtimeChannel);
    if (statusSubscription) await _supabase.removeChannel(statusSubscription);
    if (typingChannel) await _supabase.removeChannel(typingChannel);
    if (window.deletionChannel) await _supabase.removeChannel(window.deletionChannel);
    
    messagesCache.clear();
    dialogCache.clear();
    observedMessages.clear();
    
    if (window.readStatusObservers) {
        window.readStatusObservers.observer?.disconnect();
        window.readStatusObservers.mutationObserver?.disconnect();
    }
    
    await _supabase.auth.signOut();
    currentUser = null;
    currentProfile = null;
    currentChat = null;
    showScreen('reg');
}

// ─── ОНЛАЙН / НЕ В СЕТИ (реальное время) ────────────────
let onlineInterval = null;
let isUserOnline = true;

async function setUserOnlineStatus(isOnline) {
    if (!currentUser) return;
    isUserOnline = isOnline;
    try {
        await _supabase
            .from('profiles')
            .update({ is_online: isOnline, last_seen: new Date().toISOString() })
            .eq('id', currentUser.id);
    } catch (err) {}
}

function startOnlineHeartbeat() {
    if (onlineInterval) clearInterval(onlineInterval);
    setUserOnlineStatus(true);
    onlineInterval = setInterval(() => {
        if (currentUser && isUserOnline) {
            setUserOnlineStatus(true);
        }
    }, 30000);
}

function stopOnlineHeartbeat() {
    if (onlineInterval) {
        clearInterval(onlineInterval);
        onlineInterval = null;
    }
    if (currentUser) setUserOnlineStatus(false);
}

window.addEventListener('beforeunload', () => {
    if (currentUser) setUserOnlineStatus(false);
});

document.addEventListener('visibilitychange', () => {
    if (!currentUser) return;
    if (document.hidden) {
        setUserOnlineStatus(false);
    } else {
        setUserOnlineStatus(true);
    }
});

// ─── Экраны ─────────────────────────────────────────────
const screens = {
    reg:     document.getElementById('step-register'),
    login:   document.getElementById('step-login'),
    chat:    document.getElementById('chat-screen'),
    profile: document.getElementById('profile-screen')
};

function showScreen(key) {
    Object.values(screens).forEach(s => {
        if (!s) return;
        s.style.display = 'none';
        s.classList.remove('active', 'visible');
    });
    const el = screens[key];
    if (!el) return;
    el.style.display = 'flex';
    el.classList.add(key === 'chat' || key === 'profile' ? 'visible' : 'active');
}

function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(() => { t.className = 'toast'; }, 3000);
}

// ─── Навигация авторизации ───────────────────────────────
const toLogin = document.getElementById('to-login');
const toRegister = document.getElementById('to-register');
if (toLogin) toLogin.onclick = () => showScreen('login');
if (toRegister) toRegister.onclick = () => showScreen('reg');

// ─── Регистрация ─────────────────────────────────────────
const regBtn = document.getElementById('btn-do-reg');
if (regBtn) {
    regBtn.onclick = async () => {
        const user = document.getElementById('reg-username').value.trim();
        const pass = document.getElementById('reg-password').value.trim();
        const name = document.getElementById('reg-full-name').value.trim();
        if (!user || !pass) return showToast('Заполните все поля', true);

        const { data, error } = await _supabase.auth.signUp({ email: getEmail(user), password: pass });
        if (error) return showToast(error.message, true);

        if (data.user) {
            await _supabase.from('profiles').upsert({
                id: data.user.id,
                username: user.replace(/^@/, ''),
                full_name: name || user,
                last_seen: new Date().toISOString()
            });
            showToast('Аккаунт создан! Войдите.');
            setTimeout(() => showScreen('login'), 1000);
        }
    };
}

// ─── Обновление нижней панели профиля ────────────────────
function updateProfileFooter() {
    if (!currentProfile) return;
    
    const footerAvatar = document.getElementById('footer-avatar');
    const footerName = document.getElementById('footer-name');
    const footerUsername = document.getElementById('footer-username');
    
    if (footerAvatar) {
        footerAvatar.textContent = (currentProfile.full_name || '?')[0].toUpperCase();
    }
    if (footerName) {
        footerName.textContent = currentProfile.full_name || currentProfile.username || 'Пользователь';
    }
    if (footerUsername) {
        footerUsername.textContent = `@${currentProfile.username || 'username'}`;
    }
}

// ─── Инициализация нижней панели ─────────────────────────
function initProfileFooter() {
    const footer = document.getElementById('profile-footer');
    if (!footer) return;
    
    const footerInfo = footer.querySelector('.profile-footer-info');
    if (footerInfo) {
        footerInfo.onclick = () => {
            if (!currentProfile) return;
            const letter = (currentProfile.full_name || '?')[0].toUpperCase();
            const avatarLetter = document.getElementById('profile-avatar-letter');
            const profileFullname = document.getElementById('profile-fullname');
            const profileUsername = document.getElementById('profile-username');
            const profileBio = document.getElementById('profile-bio');
            
            if (avatarLetter) avatarLetter.textContent = letter;
            if (profileFullname) profileFullname.value = currentProfile.full_name || '';
            if (profileUsername) profileUsername.value = currentProfile.username || '';
            if (profileBio) profileBio.value = currentProfile.bio || '';
            
            showScreen('profile');
        };
    }
    
    const settingsBtn = document.getElementById('footer-settings');
    if (settingsBtn) {
        settingsBtn.onclick = () => {
            if (!currentProfile) return;
            const letter = (currentProfile.full_name || '?')[0].toUpperCase();
            const avatarLetter = document.getElementById('profile-avatar-letter');
            const profileFullname = document.getElementById('profile-fullname');
            const profileUsername = document.getElementById('profile-username');
            const profileBio = document.getElementById('profile-bio');
            
            if (avatarLetter) avatarLetter.textContent = letter;
            if (profileFullname) profileFullname.value = currentProfile.full_name || '';
            if (profileUsername) profileUsername.value = currentProfile.username || '';
            if (profileBio) profileBio.value = currentProfile.bio || '';
            
            showScreen('profile');
        };
    }
    
    const logoutFooterBtn = document.getElementById('footer-logout');
    if (logoutFooterBtn) {
        logoutFooterBtn.onclick = async () => {
            stopOnlineHeartbeat();
            if (realtimeChannel) await _supabase.removeChannel(realtimeChannel);
            await _supabase.auth.signOut();
            currentUser = null;
            currentProfile = null;
            currentChat = null;
            showScreen('reg');
        };
    }
}

// ─── Подсчет непрочитанных сообщений ─────────────────────
async function getUnreadCount(chatId) {
    try {
        const { count, error } = await _supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('chat_id', chatId)
            .eq('is_read', false)
            .neq('user_id', currentUser.id);
        
        if (error) throw error;
        return count || 0;
    } catch (err) {
        return 0;
    }
}

// ─── Получение последнего сообщения ─────────────────────
async function getLastMessage(chatId) {
    try {
        const { data, error } = await _supabase
            .from('messages')
            .select('text, user_id')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        if (error) throw error;
        
        if (data) {
            const isOwn = data.user_id === currentUser.id;
            const prefix = isOwn ? 'Вы: ' : '';
            let text = data.text;
            if (text.length > 50) text = text.slice(0, 47) + '...';
            return prefix + text;
        }
        return null;
    } catch (err) {
        return null;
    }
}

// ─── Отметить сообщения как прочитанные (ФИКС) ───────────
let messagesCache = new Map();

async function markChatMessagesAsRead(chatId) {
    if (!chatId || !currentUser) return;
    
    try {
        // Прямое обновление в БД
        const { error } = await _supabase
            .from('messages')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('chat_id', chatId)
            .neq('user_id', currentUser.id)
            .eq('is_read', false);
        
        if (error) throw error;
        
        // Обновляем кеш
        if (messagesCache.has(chatId)) {
            const cachedMessages = messagesCache.get(chatId);
            cachedMessages.forEach(msg => {
                if (msg.user_id !== currentUser.id) {
                    msg.is_read = true;
                }
            });
            messagesCache.set(chatId, cachedMessages);
        }
        
        // Обновляем UI - меняем галочки
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer && currentChat?.id === chatId) {
            const allMessages = messagesContainer.querySelectorAll('.message:not(.own)');
            allMessages.forEach(msgDiv => {
                const readSpan = msgDiv.querySelector('.read-status');
                if (readSpan) {
                    readSpan.className = 'read-status read';
                    readSpan.innerHTML = '✓✓';
                }
                msgDiv.classList.remove('unread-message');
            });
        }
        
        // КРИТИЧНО: Обновляем список диалогов, чтобы убрать циферку
        await loadDialogs();
        
        console.log(`✅ Чат ${chatId} отмечен как прочитанный`);
        
    } catch (err) {
        console.error('Ошибка отметки прочитанных:', err);
    }
}

let observedMessages = new Set();
let readCheckTimeout = null;

function setupReadStatusObserver() {
    const container = document.getElementById('messages');
    if (!container) return;
    
    const observer = new IntersectionObserver((entries) => {
        const visibleMessages = [];
        
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const msgDiv = entry.target;
                const msgId = msgDiv.dataset.id;
                const isOwn = msgDiv.classList.contains('own');
                const isRead = msgDiv.querySelector('.read-status')?.classList.contains('read');
                
                if (!isOwn && msgId && !isRead && !observedMessages.has(msgId)) {
                    visibleMessages.push(msgId);
                    observedMessages.add(msgId);
                }
            }
        });
        
        if (visibleMessages.length > 0 && currentChat) {
            if (readCheckTimeout) clearTimeout(readCheckTimeout);
            readCheckTimeout = setTimeout(async () => {
                try {
                    const { error } = await _supabase
                        .from('messages')
                        .update({ is_read: true, read_at: new Date().toISOString() })
                        .in('id', visibleMessages);
                    
                    if (!error && currentChat) {
                        visibleMessages.forEach(msgId => {
                            const msgDiv = document.querySelector(`.message[data-id="${msgId}"]`);
                            if (msgDiv) {
                                const readSpan = msgDiv.querySelector('.read-status');
                                if (readSpan) {
                                    readSpan.className = 'read-status read';
                                    readSpan.innerHTML = '✓✓';
                                }
                                msgDiv.classList.remove('unread-message');
                            }
                        });
                        
                        if (messagesCache.has(currentChat.id)) {
                            const cached = messagesCache.get(currentChat.id);
                            cached.forEach(msg => {
                                if (visibleMessages.includes(msg.id)) msg.is_read = true;
                            });
                            messagesCache.set(currentChat.id, cached);
                        }
                        
                        await loadDialogs();
                    }
                } catch (err) {}
                readCheckTimeout = null;
            }, 500);
        }
    }, { threshold: 0.5 });
    
    const observeNewMessages = () => {
        const messages = container.querySelectorAll('.message:not(.own)');
        messages.forEach(msg => observer.observe(msg));
    };
    
    observeNewMessages();
    
    const mutationObserver = new MutationObserver(() => {
        observeNewMessages();
    });
    
    mutationObserver.observe(container, { childList: true, subtree: true });
    
    return { observer, mutationObserver };
}

// ─── Создание чата с ботом ───────────────────────────────
async function ensureBotChat() {
    try {
        const { data: existing } = await _supabase
            .from('chats')
            .select('id')
            .eq('type', 'private')
            .contains('participants', [currentUser.id, BOT_USER_ID])
            .maybeSingle();
        
        if (existing) {
            const { data: welcomeMsg } = await _supabase
                .from('messages')
                .select('id')
                .eq('chat_id', existing.id)
                .eq('is_welcome', true)
                .maybeSingle();
            
            if (!welcomeMsg) {
                await _supabase.from('messages').insert({
                    text: 'Добро пожаловать в мессенджер Lumina Lite!\n\nЭто бот-помощник. Здесь можно:\n• Найти друзей по @username\n• Общаться в реальном времени\n• Настраивать профиль\n\nПриятного общения! 🚀',
                    user_id: BOT_USER_ID,
                    chat_id: existing.id,
                    is_welcome: true,
                    is_system: true,
                    is_read: false
                });
            }
            return;
        }
        
        const { data: newChat } = await _supabase
            .from('chats')
            .insert({
                type: 'private',
                participants: [currentUser.id, BOT_USER_ID],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                is_bot_chat: true
            })
            .select()
            .single();
        
        if (newChat) {
            await _supabase.from('messages').insert({
                text: 'Добро пожаловать в мессенджер Lumina Lite!\n\nЭто бот-помощник. Здесь можно:\n• Найти друзей по @username\n• Общаться в реальном времени\n• Настраивать профиль\n\nПриятного общения! 🚀',
                user_id: BOT_USER_ID,
                chat_id: newChat.id,
                is_welcome: true,
                is_system: true,
                is_read: false
            });
        }
    } catch (err) {
        console.error(err);
    }
}

// ─── Загрузка всех пользователей ─────────────────────────
async function loadAllUsers() {
    try {
        const { data, error } = await _supabase
            .from('profiles')
            .select('id, username, full_name')
            .neq('id', currentUser.id)
            .neq('id', BOT_USER_ID);
        
        if (error) throw error;
        
        // Фильтруем существующих пользователей
        const validUsers = [];
        for (const user of data || []) {
            const exists = await checkUserExists(user.id);
            if (exists) {
                validUsers.push(user);
            }
        }
        
        allUsers = validUsers;
    } catch (err) {
        console.error('Ошибка загрузки пользователей:', err);
        allUsers = [];
    }
}

// ─── Поиск пользователей ─────────────────────────────────
async function searchUsersByUsername(username) {
    if (!username || username.length < 1) return [];
    
    let cleanUsername = username;
    if (cleanUsername.startsWith('@')) cleanUsername = cleanUsername.substring(1);
    
    try {
        const { data, error } = await _supabase
            .from('profiles')
            .select('id, username, full_name')
            .ilike('username', `%${cleanUsername}%`)
            .neq('id', currentUser.id)
            .limit(10);
        
        if (error) return [];
        return data || [];
    } catch (err) {
        return [];
    }
}

// ─── Получение или создание личного чата ─────────────────
async function getOrCreatePrivateChat(otherUserId) {
    try {
        if (otherUserId === BOT_USER_ID) {
            const { data: existing } = await _supabase
                .from('chats')
                .select('id')
                .eq('type', 'private')
                .contains('participants', [currentUser.id, BOT_USER_ID])
                .maybeSingle();
            return existing?.id;
        }
        
        const { data: existing } = await _supabase
            .from('chats')
            .select('id')
            .eq('type', 'private')
            .contains('participants', [currentUser.id, otherUserId])
            .maybeSingle();
        
        if (existing) return existing.id;
        
        const { data: newChat } = await _supabase
            .from('chats')
            .insert({
                type: 'private',
                participants: [currentUser.id, otherUserId],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();
        
        return newChat.id;
    } catch (err) {
        throw err;
    }
}

// ─── Статус пользователя ─────────────────────────────────
let lastActivityUpdate = 0;
let typingTimeout = null;
let isTyping = false;

async function updateLastSeen() {
    if (!currentUser) return;
    
    const now = Date.now();
    if (now - lastActivityUpdate < 30000) return;
    lastActivityUpdate = now;
    
    try {
        await _supabase
            .from('profiles')
            .update({ last_seen: new Date().toISOString() })
            .eq('id', currentUser.id);
    } catch (err) {}
}

function formatLastSeen(lastSeen) {
    if (!lastSeen) return 'неизвестно';
    
    const lastSeenDate = new Date(lastSeen);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (lastSeenDate >= today) {
        return `сегодня в ${lastSeenDate.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (lastSeenDate >= yesterday) {
        return `вчера в ${lastSeenDate.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
        return lastSeenDate.toLocaleDateString('ru', { day: 'numeric', month: 'short' }) + 
               ` в ${lastSeenDate.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`;
    }
}

function getUserStatusFromProfile(profile) {
    if (!profile) return { text: 'неизвестно', class: 'status-offline', isOnline: false };
    
    if (profile.is_online === true) {
        return { text: 'онлайн', class: 'status-online', isOnline: true };
    }
    
    if (!profile.last_seen) return { text: 'неизвестно', class: 'status-offline', isOnline: false };
    
    const lastSeenDate = new Date(profile.last_seen);
    const now = new Date();
    const diffMins = (now - lastSeenDate) / 60000;
    
    if (diffMins < 5) {
        return { text: 'онлайн', class: 'status-online', isOnline: true };
    }
    
    return { text: formatLastSeen(profile.last_seen), class: 'status-offline', isOnline: false };
}

let statusSubscription = null;

function subscribeToUserDeletion() {
    const deletionChannel = _supabase
        .channel('user-deletions')
        .on('postgres_changes', 
            { event: 'DELETE', schema: 'auth', table: 'users' },
            async (payload) => {
                console.log('🗑️ Пользователь удален:', payload.old.id);
                
                if (payload.old.id === currentUser?.id) {
                    showToast('Ваш аккаунт был удален', true);
                    setTimeout(() => logout(), 2000);
                    return;
                }
                
                await loadDialogs();
                
                if (currentChat?.other_user?.id === payload.old.id) {
                    currentChat = null;
                    const messagesContainer = document.getElementById('messages');
                    if (messagesContainer) {
                        messagesContainer.innerHTML = `
                            <div class="msg-stub">
                                <svg width="48" height="48" style="margin-bottom: 16px; opacity: 0.3;"><use href="#icon-chat"/></svg>
                                <p>Пользователь удален. Выберите другой диалог</p>
                            </div>
                        `;
                    }
                    const inputZone = document.querySelector('.input-zone');
                    if (inputZone) inputZone.style.display = 'none';
                }
            }
        )
        .subscribe();
    
    return deletionChannel;
}

function subscribeToUserDeletion() {
    const deletionChannel = _supabase
        .channel('user-deletions')
        .on('postgres_changes', 
            { event: 'DELETE', schema: 'auth', table: 'users' },
            async (payload) => {
                console.log('🗑️ Пользователь удален:', payload.old.id);
                
                if (payload.old.id === currentUser?.id) {
                    showToast('Ваш аккаунт был удален', true);
                    setTimeout(() => logout(), 2000);
                    return;
                }
                
                await loadDialogs();
                
                if (currentChat?.other_user?.id === payload.old.id) {
                    currentChat = null;
                    const messagesContainer = document.getElementById('messages');
                    if (messagesContainer) {
                        messagesContainer.innerHTML = `
                            <div class="msg-stub">
                                <svg width="48" height="48" style="margin-bottom: 16px; opacity: 0.3;"><use href="#icon-chat"/></svg>
                                <p>Пользователь удален. Выберите другой диалог</p>
                            </div>
                        `;
                    }
                    const inputZone = document.querySelector('.input-zone');
                    if (inputZone) inputZone.style.display = 'none';
                }
            }
        )
        .subscribe();
    
    return deletionChannel;
}

function subscribeToUserStatus(userId) {
    if (statusSubscription) {
        _supabase.removeChannel(statusSubscription);
    }
    
    statusSubscription = _supabase
        .channel(`status-${userId}`)
        .on('postgres_changes', 
            { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
            async (payload) => {
                if (payload.new && currentChat?.other_user?.id === userId) {
                    updateChatStatusFromProfile(payload.new);
                }
                // Обновляем диалог в списке
                const dialogItem = document.querySelector(`.dialog-item[data-other-user-id="${userId}"]`);
                if (dialogItem) {
                    const statusDiv = dialogItem.querySelector('.dialog-status');
                    if (statusDiv) {
                        const status = getUserStatusFromProfile(payload.new);
                        statusDiv.textContent = status.text;
                        statusDiv.className = `dialog-status ${status.class === 'status-online' ? 'dialog-status-online' : 'dialog-status-offline'}`;
                    }
                }
            }
        )
        .subscribe();
}

function updateChatStatusFromProfile(profile) {
    const chatStatus = document.querySelector('.chat-status');
    if (!chatStatus) return;
    
    const isBot = currentChat?.other_user?.id === BOT_USER_ID;
    if (isBot) {
        chatStatus.textContent = 'бот';
        chatStatus.className = 'chat-status status-bot';
        return;
    }
    
    const status = getUserStatusFromProfile(profile);
    chatStatus.textContent = status.text;
    chatStatus.className = `chat-status ${status.class}`;
}

// ─── Отслеживание печатания ──────────────────────────────
let typingChannel = null;

function setupTypingIndicator() {
    const messageInput = document.getElementById('message-input');
    if (!messageInput) return;
    
    messageInput.addEventListener('input', () => {
        if (!currentChat || currentChat.other_user?.id === BOT_USER_ID) return;
        
        if (typingTimeout) clearTimeout(typingTimeout);
        
        if (!isTyping) {
            isTyping = true;
            sendTypingStatus(true);
        }
        
        typingTimeout = setTimeout(() => {
            isTyping = false;
            sendTypingStatus(false);
        }, 1000);
    });
}

async function sendTypingStatus(isTypingNow) {
    if (!currentChat || !typingChannel) return;
    
    try {
        await typingChannel.send({
            type: 'broadcast',
            event: 'typing',
            payload: { isTyping: isTypingNow, userId: currentUser.id }
        });
    } catch (err) {}
}

function subscribeToTyping(chatId, otherUserId) {
    if (typingChannel) {
        _supabase.removeChannel(typingChannel);
    }
    
    typingChannel = _supabase
        .channel(`typing-${chatId}`)
        .on('broadcast', { event: 'typing' }, (payload) => {
            if (payload.payload.userId === currentUser.id) return;
            
            const typingStatus = document.querySelector('.typing-status');
            if (!typingStatus) return;
            
            if (payload.payload.isTyping) {
                typingStatus.textContent = 'печатает...';
                typingStatus.style.display = 'block';
                setTimeout(() => {
                    if (typingStatus.textContent === 'печатает...') {
                        typingStatus.style.display = 'none';
                    }
                }, 3000);
            } else {
                typingStatus.style.display = 'none';
            }
        })
        .subscribe();
}

// ─── ОПТИМИЗИРОВАННАЯ ЗАГРУЗКА ДИАЛОГОВ ─────────────────
let isUpdatingDialogs = false;
let dialogCache = new Map();

async function loadDialogs(searchTerm = '') {
    const container = document.getElementById('dialogs-list');
    if (!container) return;
    
    const isUserSearch = searchTerm.startsWith('@');
    
    if (isUserSearch && searchTerm.length > 1) {
        await loadUserSearchResults(searchTerm, container);
        return;
    }
    
    if (isUpdatingDialogs) return;
    isUpdatingDialogs = true;
    
    try {
        const { data: chats, error: chatsError } = await _supabase
            .from('chats')
            .select('*')
            .contains('participants', [currentUser.id])
            .order('updated_at', { ascending: false });
        
        if (chatsError) throw chatsError;
        
        // Фильтруем чаты с удаленными пользователями
        const validChats = [];
        for (const chat of chats || []) {
            const otherId = chat.participants.find(id => id !== currentUser.id);
            
            if (otherId === BOT_USER_ID) {
                validChats.push(chat);
                continue;
            }
            
            const userExists = await checkUserExists(otherId);
            if (userExists) {
                validChats.push(chat);
            } else {
                // Удаляем чат с несуществующим пользователем
                await _supabase.from('chats').delete().eq('id', chat.id);
            }
        }
        
        // Получаем непрочитанные сообщения
        const { data: unreadData, error: unreadError } = await _supabase
            .from('messages')
            .select('chat_id')
            .eq('is_read', false)
            .neq('user_id', currentUser.id)
            .in('chat_id', validChats.map(c => c.id) || []);
        
        if (unreadError) throw unreadError;
        
        const unreadCounts = new Map();
        if (unreadData) {
            unreadData.forEach(msg => {
                unreadCounts.set(msg.chat_id, (unreadCounts.get(msg.chat_id) || 0) + 1);
            });
        }
        
        // Получаем последние сообщения
        const lastMessages = new Map();
        for (const chat of validChats) {
            const { data: lastMsg } = await _supabase
                .from('messages')
                .select('text, user_id')
                .eq('chat_id', chat.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            
            if (lastMsg) {
                const isOwn = lastMsg.user_id === currentUser.id;
                const prefix = isOwn ? 'Вы: ' : '';
                let text = lastMsg.text;
                if (text && text.length > 50) text = text.slice(0, 47) + '...';
                lastMessages.set(chat.id, prefix + text);
            }
        }
        
        // Получаем профили участников
        const allParticipantIds = validChats.flatMap(c => c.participants);
        const { data: profiles } = await _supabase
            .from('profiles')
            .select('id, full_name, username, last_seen, is_online')
            .in('id', [...new Set(allParticipantIds)]);
        
        const profileMap = new Map();
        if (profiles) profiles.forEach(p => profileMap.set(p.id, p));
        profileMap.set(BOT_USER_ID, BOT_PROFILE);
        
        // Формируем данные для отображения
        const chatData = validChats.map(chat => {
            const otherId = chat.participants.find(id => id !== currentUser.id);
            const otherUser = profileMap.get(otherId);
            
            if (!otherUser && otherId !== BOT_USER_ID) return null;
            
            const name = otherUser?.full_name || otherUser?.username || 'Пользователь';
            const isBot = otherId === BOT_USER_ID;
            const unreadCount = unreadCounts.get(chat.id) || 0;
            const status = otherUser ? getUserStatusFromProfile(otherUser) : { text: '', class: '' };
            
            return {
                id: chat.id,
                otherId,
                otherUser,
                name,
                isBot,
                unreadCount,
                lastMessage: lastMessages.get(chat.id) || 'Нет сообщений',
                updatedAt: chat.updated_at,
                statusText: status.text,
                statusClass: status.class
            };
        }).filter(chat => chat !== null);
        
        // Фильтрация по поиску
        let filteredData = chatData;
        if (searchTerm && !isUserSearch) {
            filteredData = chatData.filter(chat => 
                chat.name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        
        renderDialogsList(container, filteredData);
        
    } catch (err) {
        console.error('Ошибка загрузки диалогов:', err);
        if (container.children.length === 0) {
            container.innerHTML = '<div class="dialogs-loading">Ошибка загрузки диалогов</div>';
        }
    } finally {
        isUpdatingDialogs = false;
    }
}

// Вынесенная функция рендеринга диалогов
function renderDialogsList(container, filteredData) {
    container.innerHTML = '';
    
    if (filteredData.length === 0) {
        container.innerHTML = '<div class="dialogs-loading">Нет диалогов. Введите @username для поиска</div>';
        return;
    }
    
    filteredData.forEach(chat => {
        const div = document.createElement('div');
        div.className = `dialog-item ${currentChat?.id === chat.id ? 'active' : ''} ${chat.unreadCount > 0 ? 'unread-dialog' : ''}`;
        div.dataset.chatId = chat.id;
        div.dataset.otherUserId = chat.otherId;
        
        // ВАЖНО: отображаем бейдж ТОЛЬКО если unreadCount > 0
        const unreadBadge = chat.unreadCount > 0 ? 
            `<span class="unread-badge-count">${chat.unreadCount > 99 ? '99+' : chat.unreadCount}</span>` : '';
        
        div.innerHTML = `
            <div class="dialog-avatar ${chat.isBot ? 'bot-avatar' : ''}">
                ${chat.isBot ? '<img src="lumina.svg" alt="Bot" width="32" height="32">' : `<div class="avatar-letter">${escapeHtml(chat.name.charAt(0))}</div>`}
                ${chat.isBot ? '<div class="verified-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' : ''}
            </div>
            <div class="dialog-info">
                <div class="dialog-name">
                    ${escapeHtml(chat.name)}
                    ${chat.isBot ? '<span class="bot-badge">Бот</span>' : ''}
                    ${unreadBadge}
                </div>
                <div class="dialog-preview">${escapeHtml(chat.lastMessage)}</div>
                ${!chat.isBot && chat.statusText ? `<div class="dialog-status ${chat.statusClass === 'status-online' ? 'dialog-status-online' : 'dialog-status-offline'}">${chat.statusText}</div>` : ''}
            </div>
        `;
        
        div.onclick = async () => {
            await openChat(chat.id, chat.otherId, chat.otherUser);
            if (chat.unreadCount > 0) {
                await markChatMessagesAsRead(chat.id);
            }
        };
        
        container.appendChild(div);
    });
}

// Вынесенная функция поиска пользователей
async function loadUserSearchResults(searchTerm, container) {
    const users = await searchUsersByUsername(searchTerm);
    
    container.innerHTML = `
        <div class="search-header">
            <span class="search-title">👥 Найдено пользователей: ${users.length}</span>
        </div>
    `;
    
    if (users.length === 0) {
        container.innerHTML += '<div class="dialogs-loading">Пользователи не найдены</div>';
        return;
    }
    
    users.forEach(user => {
        const name = user.full_name || user.username;
        const div = document.createElement('div');
        div.className = 'dialog-item user-search-item';
        div.dataset.userId = user.id;
        div.innerHTML = `
            <div class="dialog-avatar">
                <div class="avatar-letter">${escapeHtml(name.charAt(0))}</div>
            </div>
            <div class="dialog-info">
                <div class="dialog-name">
                    ${escapeHtml(name)}
                    <span class="username-hint">@${escapeHtml(user.username)}</span>
                </div>
                <div class="dialog-preview">Нажмите, чтобы начать чат</div>
            </div>
        `;
        div.onclick = async () => {
            try {
                const chatId = await getOrCreatePrivateChat(user.id);
                await openChat(chatId, user.id, user);
                const searchInputElem = document.getElementById('search-dialogs');
                if (searchInputElem) searchInputElem.value = '';
                loadDialogs();
            } catch (err) {
                showToast('Ошибка создания чата', true);
            }
        };
        container.appendChild(div);
    });
}

// ─── Поиск диалогов ──────────────────────────────────────
const searchInputElem = document.getElementById('search-dialogs');
if (searchInputElem) {
    let searchTimeout;
    searchInputElem.oninput = (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            loadDialogs(e.target.value);
        }, 300);
    };
}

// ─── Эмодзи панель ───────────────────────────────────────
const emojiBtn = document.getElementById('btn-emoji');
const emojiPicker = document.getElementById('emoji-picker');
if (emojiBtn && emojiPicker) {
    emojiBtn.onclick = (e) => {
        e.stopPropagation();
        const isVisible = emojiPicker.style.display === 'flex';
        emojiPicker.style.display = isVisible ? 'none' : 'flex';
    };
    
    document.querySelectorAll('.emoji-item').forEach(emoji => {
        emoji.onclick = () => {
            const input = document.getElementById('message-input');
            if (input) {
                input.value += emoji.textContent;
                input.focus();
            }
            emojiPicker.style.display = 'none';
        };
    });
    
    document.addEventListener('click', (e) => {
        if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
            emojiPicker.style.display = 'none';
        }
    });
}

// ─── Контекстное меню сообщений ──────────────────────────
const messageMenu = document.getElementById('message-menu');
let activeMessage = null;

function showMessageMenu(e, messageId, messageText, isOwn) {
    e.preventDefault();
    e.stopPropagation();
    
    if (messageMenu) {
        messageMenu.style.display = 'block';
        messageMenu.style.left = `${e.clientX}px`;
        messageMenu.style.top = `${e.clientY}px`;
        
        const menuItems = messageMenu.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            const action = item.dataset.action;
            item.onclick = () => handleMessageAction(action, messageId, messageText, isOwn);
        });
        
        setTimeout(() => {
            document.addEventListener('click', hideMessageMenu);
        }, 0);
    }
}

function hideMessageMenu() {
    if (messageMenu) {
        messageMenu.style.display = 'none';
    }
    document.removeEventListener('click', hideMessageMenu);
}

async function handleMessageAction(action, messageId, messageText, isOwn) {
    hideMessageMenu();
    
    switch (action) {
        case 'reply':
            const input = document.getElementById('message-input');
            if (input) {
                input.value = `> ${messageText}\n\n`;
                input.focus();
            }
            break;
        case 'copy':
            await navigator.clipboard.writeText(messageText);
            showToast('Текст скопирован');
            break;
        case 'edit':
            if (isOwn) {
                const newText = prompt('Изменить сообщение:', messageText);
                if (newText && newText.trim()) {
                    const { error } = await _supabase
                        .from('messages')
                        .update({ text: newText.trim(), is_edited: true })
                        .eq('id', messageId);
                    if (error) {
                        showToast('Ошибка редактирования', true);
                    } else {
                        showToast('Сообщение изменено');
                    }
                }
            } else {
                showToast('Можно редактировать только свои сообщения', true);
            }
            break;
        case 'pin':
            showToast('Функция закрепления в разработке');
            break;
        case 'forward':
            showToast('Функция пересылки в разработке');
            break;
        case 'delete':
            if (isOwn) {
                const confirm = window.confirm('Удалить сообщение?');
                if (confirm) {
                    const { error } = await _supabase
                        .from('messages')
                        .delete()
                        .eq('id', messageId);
                    if (error) {
                        showToast('Ошибка удаления', true);
                    } else {
                        showToast('Сообщение удалено');
                    }
                }
            } else {
                showToast('Можно удалять только свои сообщения', true);
            }
            break;
    }
}

// ─── Вход ────────────────────────────────────────────────
const loginBtn = document.getElementById('btn-do-login');
if (loginBtn) {
    loginBtn.onclick = async () => {
        const user = document.getElementById('login-username').value.trim();
        const pass = document.getElementById('login-password').value.trim();
        const { data, error } = await _supabase.auth.signInWithPassword({ email: getEmail(user), password: pass });
        if (error) return showToast('Ошибка входа: ' + error.message, true);

        currentUser = data.user;
        
        const { data: p } = await _supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .maybeSingle();
        
        if (!p) {
            const username = user.replace(/^@/, '');
            const { data: newProfile } = await _supabase
                .from('profiles')
                .insert({
                    id: currentUser.id,
                    username: username,
                    full_name: username,
                    last_seen: new Date().toISOString()
                })
                .select()
                .maybeSingle();
            currentProfile = newProfile;
        } else {
            currentProfile = p;
        }
        
        if (currentProfile) {
            const badge = document.getElementById('current-user-badge');
            if (badge) badge.textContent = currentProfile.full_name;
            updateProfileFooter();
            initProfileFooter();
        }
        
        await loadAllUsers();
        await ensureBotChat();
        
        showScreen('chat');
        await loadDialogs();
        
        document.getElementById('chat-title').textContent = 'Lumina Lite';
        document.querySelector('.chat-status').textContent = 'выберите диалог';
        const inputZone = document.querySelector('.input-zone');
        if (inputZone) inputZone.style.display = 'none';
        
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="msg-stub">
                    <svg width="48" height="48" style="margin-bottom: 16px; opacity: 0.3;"><use href="#icon-chat"/></svg>
                    <p>Выберите диалог, чтобы начать общение</p>
                </div>
            `;
        }
        
        currentChat = null;
        
        document.addEventListener('click', () => updateLastSeen());
        document.addEventListener('keypress', () => updateLastSeen());
        setInterval(() => updateLastSeen(), 30000);
        updateLastSeen();
        
        startOnlineHeartbeat();
        // Подписываемся на удаление пользователей
if (window.deletionChannel) {
    await _supabase.removeChannel(window.deletionChannel);
}
window.deletionChannel = subscribeToUserDeletion();
    };
}

// ─── Открыть чат (ПЛАВНОЕ ПЕРЕКЛЮЧЕНИЕ) ─────────────────
let isOpeningChat = false;
let pendingChatId = null;

async function openChat(chatId, otherUserId, otherUser) {
    if (isOpeningChat) {
        pendingChatId = chatId;
        return;
    }
    if (currentChat?.id === chatId) return;
    
    isOpeningChat = true;
    
    try {
        const isBot = otherUserId === BOT_USER_ID;
        
        // Показываем индикатор загрузки
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
            messagesContainer.innerHTML = '<div class="loading-messages">Загрузка сообщений...</div>';
        }
        
        currentChat = {
            id: chatId,
            type: 'private',
            other_user: otherUser || (isBot ? BOT_PROFILE : null)
        };
        
        const chatTitle = document.getElementById('chat-title');
        if (chatTitle) {
            const name = otherUser?.full_name || otherUser?.username || (isBot ? 'Lumina Bot' : 'Чат');
            chatTitle.innerHTML = `${escapeHtml(name)} ${isBot ? '<span class="bot-badge">Бот</span>' : ''}`;
        }
        
        if (!isBot && otherUserId) {
            const { data: profile } = await _supabase
                .from('profiles')
                .select('*')
                .eq('id', otherUserId)
                .maybeSingle();
            
            if (profile) {
                updateChatStatusFromProfile(profile);
                subscribeToUserStatus(otherUserId);
                subscribeToTyping(chatId, otherUserId);
            }
        } else if (isBot) {
            const chatStatus = document.querySelector('.chat-status');
            if (chatStatus) {
                chatStatus.textContent = 'бот';
                chatStatus.className = 'chat-status status-bot';
            }
        }
        
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('btn-send-msg');
        const inputZone = document.querySelector('.input-zone');
        
        if (isBot) {
            if (inputZone) inputZone.style.display = 'none';
            if (messageInput) messageInput.disabled = true;
            if (sendButton) sendButton.disabled = true;
        } else {
            if (inputZone) inputZone.style.display = 'block';
            if (messageInput) {
                messageInput.disabled = false;
                messageInput.placeholder = 'Написать сообщение...';
                setTimeout(() => messageInput.focus(), 100);
            }
            if (sendButton) sendButton.disabled = false;
            setupTypingIndicator();
        }
        
        await loadMessages(chatId);
subscribeToMessages(chatId);

// Отмечаем прочитанные после рендера
setTimeout(async () => {
    await markChatMessagesAsRead(chatId);
    
    if (window.readStatusObservers) {
        window.readStatusObservers.observer?.disconnect();
        window.readStatusObservers.mutationObserver?.disconnect();
    }
    window.readStatusObservers = setupReadStatusObserver();
}, 500);
        
        document.querySelectorAll('.dialog-item').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.chatId === chatId) el.classList.add('active');
        });
        
        await markChatMessagesAsRead(chatId);  // ← ЭТУ СТРОКУ УДАЛИТЬ
        
        await markChatMessagesAsRead(chatId);
        
    } finally {
        isOpeningChat = false;
        if (pendingChatId && pendingChatId !== chatId) {
            const pending = pendingChatId;
            pendingChatId = null;
            // Найдём данные для ожидающего чата
            const pendingDialog = document.querySelector(`.dialog-item[data-chat-id="${pending}"]`);
            if (pendingDialog) {
                const otherId = pendingDialog.dataset.otherUserId;
                await openChat(pending, otherId, null);
            }
        }
    }
}

// ─── Загрузка сообщений ─────────────────────────────────
let isLoadingMessages = false;

async function loadMessages(chatId) {
    const container = document.getElementById('messages');
    if (!container) return;
    
    // Проверяем кеш, но НЕ используем его если есть сомнения
    if (messagesCache.has(chatId) && messagesCache.get(chatId).length > 0) {
        const cachedMessages = messagesCache.get(chatId);
        container.innerHTML = '';
        cachedMessages.forEach(msg => renderMessage(msg));
        container.scrollTop = container.scrollHeight;
        return;
    }
    
    if (isLoadingMessages) return;
    isLoadingMessages = true;
    
    try {
        const { data: msgs, error } = await _supabase
            .from('messages')
            .select('*')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: true })
            .limit(200);
        
        if (error) throw error;
        
        const userIds = [...new Set(msgs?.map(m => m.user_id) || [])];
        const profilesMap = new Map();
        
        if (userIds.length > 0) {
            const { data: profiles } = await _supabase
                .from('profiles')
                .select('id, full_name, username')
                .in('id', userIds);
            if (profiles) profiles.forEach(p => profilesMap.set(p.id, p));
        }
        profilesMap.set(BOT_USER_ID, BOT_PROFILE);
        
        const messagesWithProfiles = (msgs || []).map(msg => ({
            ...msg,
            profiles: profilesMap.get(msg.user_id),
            // Сохраняем оригинальный статус прочитанного
            is_read: msg.is_read || false
        }));
        
        messagesCache.set(chatId, messagesWithProfiles);
        container.innerHTML = '';
        
        if (messagesWithProfiles.length > 0) {
            messagesWithProfiles.forEach(msg => renderMessage(msg));
        } else {
            container.innerHTML = '<div class="msg-stub">Начните переписку</div>';
        }
        
        container.scrollTop = container.scrollHeight;
    } catch (err) {
        console.error(err);
        container.innerHTML = '<div class="loading-messages">Ошибка загрузки</div>';
    } finally {
        isLoadingMessages = false;
    }
}

// ─── Подписка на новые сообщения (РЕАЛЬНОЕ ВРЕМЯ!) ──────
  function subscribeToMessages(chatId) {
    if (realtimeChannel) _supabase.removeChannel(realtimeChannel);
    
    realtimeChannel = _supabase
        .channel(`chat-${chatId}`)
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, 
            async (payload) => {
                if (document.querySelector(`.message[data-id="${payload.new.id}"]`)) return;
                
                let profile = currentProfile;
                if (payload.new.user_id !== currentUser?.id) {
                    if (payload.new.user_id === BOT_USER_ID) {
                        profile = BOT_PROFILE;
                    } else {
                        const { data: userProfile } = await _supabase
                            .from('profiles')
                            .select('full_name, username')
                            .eq('id', payload.new.user_id)
                            .single();
                        if (userProfile) profile = userProfile;
                    }
                }
                
                const isFromOther = payload.new.user_id !== currentUser?.id;
                
                const newMessage = { 
                    ...payload.new, 
                    profiles: profile,
                    is_read: !isFromOther
                };
                
                if (messagesCache.has(chatId)) {
                    const cached = messagesCache.get(chatId);
                    cached.push(newMessage);
                    messagesCache.set(chatId, cached);
                }
                
                renderMessage(newMessage);
                updateDialogLastMessage(chatId, payload.new.text, !isFromOther);
                
                if (currentChat?.id === chatId && isFromOther) {
                    setTimeout(() => markChatMessagesAsRead(chatId), 100);
                }
                
                await loadDialogs();
            }
        )
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
            async (payload) => {
                const messageDiv = document.querySelector(`.message[data-id="${payload.new.id}"]`);
                if (messageDiv) {
                    const textDiv = messageDiv.querySelector('.text');
                    if (textDiv) textDiv.textContent = payload.new.text;
                    const timeDiv = messageDiv.querySelector('.msg-time');
                    if (timeDiv && !timeDiv.textContent.includes('(изм)')) {
                        timeDiv.textContent = timeDiv.textContent + ' (изм)';
                    }
                    
                    if (payload.new.is_read && !messageDiv.classList.contains('own')) {
                        messageDiv.classList.remove('unread-message');
                        const readSpan = messageDiv.querySelector('.read-status');
                        if (readSpan) {
                            readSpan.className = 'read-status read';
                            readSpan.innerHTML = '✓✓';
                        }
                    }
                }
                
                if (messagesCache.has(chatId)) {
                    const cached = messagesCache.get(chatId);
                    const idx = cached.findIndex(m => m.id === payload.new.id);
                    if (idx !== -1) {
                        cached[idx].text = payload.new.text;
                        cached[idx].is_read = payload.new.is_read;
                    }
                    messagesCache.set(chatId, cached);
                }
                
                if (currentChat?.id !== chatId) {
                    updateDialogLastMessage(chatId, payload.new.text, false);
                }
                await loadDialogs();
            }
        )
        .on('postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
            (payload) => {
                const messageDiv = document.querySelector(`.message[data-id="${payload.old.id}"]`);
                if (messageDiv) messageDiv.remove();
                
                if (messagesCache.has(chatId)) {
                    const cached = messagesCache.get(chatId);
                    const filtered = cached.filter(m => m.id !== payload.old.id);
                    messagesCache.set(chatId, filtered);
                }
                // ✅ ИСПРАВЛЕНО: используем chatId из внешней функции
                loadDialogs();
            }
        )
        .subscribe();
}

// Вспомогательная функция обновления превью диалога
function updateDialogLastMessage(chatId, text, isOwn) {
    const dialogItem = document.querySelector(`.dialog-item[data-chat-id="${chatId}"]`);
    if (dialogItem) {
        const previewSpan = dialogItem.querySelector('.dialog-preview');
        if (previewSpan) {
            let shortText = text.length > 50 ? text.slice(0, 47) + '...' : text;
            const prefix = isOwn ? 'Вы: ' : '';
            previewSpan.textContent = prefix + shortText;
        }
        const parent = dialogItem.parentNode;
        parent.removeChild(dialogItem);
        parent.insertBefore(dialogItem, parent.firstChild);
    }
}

// ─── Рендер сообщения ────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderMessage(msg) {
    const container = document.getElementById('messages');
    if (!container) return;
    
    const stub = container.querySelector('.msg-stub');
    if (stub) stub.remove();
    
    const isOwn = currentUser && msg.user_id === currentUser.id;
    const isBot = msg.user_id === BOT_USER_ID;
    let name = 'Пользователь';
    
    if (msg.profiles && msg.profiles.full_name) name = msg.profiles.full_name;
    else if (isOwn && currentProfile && currentProfile.full_name) name = currentProfile.full_name;
    else if (isBot) name = 'Lumina Bot';
    
    const timeStr = new Date(msg.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });

const isRead = msg.is_read === true;
const readStatusHtml = isOwn ? `
    <span class="read-status ${isRead ? 'read' : 'unread'}">
        ${isRead ? '✓✓' : '✓'}
    </span>
` : '';
    
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'own' : 'other'} ${isBot ? 'bot-message' : ''} ${!isOwn && !isRead ? 'unread-message' : ''}`; 
    div.dataset.id = msg.id;
    div.dataset.text = msg.text;
    
    div.innerHTML = `
        <div class="msg-avatar ${isBot ? 'bot-avatar' : ''}">
            ${isBot ? '<img src="lumina.svg" alt="Bot" width="28" height="28">' : `<div class="avatar-letter">${escapeHtml(name.charAt(0))}</div>`}
            ${isBot ? '<div class="verified-badge-small"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' : ''}
        </div>
        <div class="msg-bubble">
            ${!isOwn ? `<div class="msg-sender">${escapeHtml(name)} ${isBot ? '<span class="bot-badge-small">Бот</span>' : ''}</div>` : ''}
            <div class="text">${escapeHtml(msg.text)}</div>
            <div class="msg-time">
                ${timeStr}
                ${readStatusHtml}
            </div>
        </div>
    `;
    
const textDiv = div.querySelector('.text');
    if (textDiv && msg.text && msg.text.length > 100) {
        textDiv.title = msg.text;
        textDiv.style.cursor = 'help';
    }
    
    div.oncontextmenu = (e) => {
        showMessageMenu(e, msg.id, msg.text, isOwn);
        return false;
    };
    
    container.appendChild(div);
    setTimeout(() => {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }, 50);
}
// Замените существующую функцию sendMsg
async function sendMsg() {
    const input = document.getElementById('message-input');
    if (!input) return;
    
    const text = input.value.trim();
    if (!text || !currentUser || !currentChat) {
        if (!currentChat) showToast('Выберите чат', true);
        return;
    }
    
    if (currentChat.other_user?.id === BOT_USER_ID) {
        showToast('Нельзя отправлять сообщения боту', true);
        return;
    }
    
    // Сохраняем текст на случай ошибки
    const originalText = text;
    input.value = '';
    
    // Временный ID для оптимистичного обновления
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const tempMessage = {
        id: tempId,
        text: text,
        user_id: currentUser.id,
        chat_id: currentChat.id,
        created_at: new Date().toISOString(),
        is_read: false,
        is_sending: true,
        profiles: currentProfile
    };
    
    // Оптимистичное добавление сообщения
    renderMessage(tempMessage);
    
    const sendButton = document.getElementById('btn-send-msg');
    if (sendButton) sendButton.disabled = true;
    
    try {
        const { data, error } = await _supabase
            .from('messages')
            .insert([{ 
                text, 
                user_id: currentUser.id,
                chat_id: currentChat.id,
                is_read: false,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();
        
        if (error) throw error;
        
        // Удаляем временное сообщение
        const tempMsgElement = document.querySelector(`.message[data-id="${tempId}"]`);
        if (tempMsgElement) tempMsgElement.remove();
        
        // Добавляем реальное сообщение
        renderMessage({ ...data, profiles: currentProfile });
        
        // Обновляем чат
        await _supabase
            .from('chats')
            .update({ 
                updated_at: new Date().toISOString(),
                last_message: text.slice(0, 50)
            })
            .eq('id', currentChat.id);
        
        // Обновляем список диалогов в фоне
        loadDialogs();
        
    } catch (error) {
        // Восстанавливаем текст при ошибке
        input.value = originalText;
        showToast('Ошибка отправки: ' + (error.message || 'Неизвестная ошибка'), true);
        
        // Удаляем временное сообщение
        const tempMsgElement = document.querySelector(`.message[data-id="${tempId}"]`);
        if (tempMsgElement) tempMsgElement.remove();
    } finally {
        if (sendButton) sendButton.disabled = false;
        input.focus();
    }
}

// ─── Выход ───────────────────────────────────────────────
const logoutBtn = document.getElementById('btn-logout');
if (logoutBtn) {
    logoutBtn.onclick = async () => {
        stopOnlineHeartbeat();
        if (realtimeChannel) await _supabase.removeChannel(realtimeChannel);
        if (statusSubscription) await _supabase.removeChannel(statusSubscription);
        if (typingChannel) await _supabase.removeChannel(typingChannel);
        await _supabase.auth.signOut();
        currentUser = null;
        currentProfile = null;
        currentChat = null;
        showScreen('reg');
    };
}

// ─── Профиль ─────────────────────────────────────────────
const profileBtn = document.getElementById('btn-profile');
if (profileBtn) {
    profileBtn.onclick = () => {
        if (!currentProfile) return;
        document.getElementById('profile-avatar-letter').textContent = (currentProfile.full_name || '?')[0].toUpperCase();
        document.getElementById('profile-fullname').value = currentProfile.full_name || '';
        document.getElementById('profile-username').value = currentProfile.username || '';
        document.getElementById('profile-bio').value = currentProfile.bio || '';
        showScreen('profile');
    };
}

const profileBackBtn = document.getElementById('btn-profile-back');
if (profileBackBtn) profileBackBtn.onclick = () => showScreen('chat');

const profileLogoutBtn = document.getElementById('btn-logout-profile');
if (profileLogoutBtn) {
    profileLogoutBtn.onclick = async () => {
        stopOnlineHeartbeat();
        if (realtimeChannel) await _supabase.removeChannel(realtimeChannel);
        if (statusSubscription) await _supabase.removeChannel(statusSubscription);
        if (typingChannel) await _supabase.removeChannel(typingChannel);
        await _supabase.auth.signOut();
        currentUser = null;
        currentProfile = null;
        currentChat = null;
        showScreen('reg');
    };
}

const saveProfileBtn = document.getElementById('btn-save-profile');
if (saveProfileBtn) {
    saveProfileBtn.onclick = async () => {
        const full_name = document.getElementById('profile-fullname').value.trim();
        const bio = document.getElementById('profile-bio').value.trim();
        if (!full_name) return showToast('Имя не может быть пустым', true);
        
        const { error } = await _supabase.from('profiles')
            .update({ full_name, bio })
            .eq('id', currentUser.id);
        
        if (error) return showToast('Ошибка сохранения', true);
        
        currentProfile.full_name = full_name;
        currentProfile.bio = bio;
        document.getElementById('current-user-badge').textContent = full_name;
        document.getElementById('profile-avatar-letter').textContent = full_name[0].toUpperCase();
        updateProfileFooter();
        showToast('Профиль сохранён ✓');
        setTimeout(() => showScreen('chat'), 800);
    };
}

// ─── Кнопка отправки и Enter ────────────────────────────
const sendButton = document.getElementById('btn-send-msg');
if (sendButton) sendButton.onclick = sendMsg;

const messageInputField = document.getElementById('message-input');
if (messageInputField) {
    messageInputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMsg();
        }
    });
}

// ─── DVH фикс и адаптация под клавиатуру ─────────────────
function updateDvh() {
    document.documentElement.style.setProperty('--dvh', `${window.innerHeight}px`);
}
window.addEventListener('resize', updateDvh);
updateDvh();

let originalHeight = window.innerHeight;
window.addEventListener('resize', () => {
    const newHeight = window.innerHeight;
    if (newHeight < originalHeight - 100) {
        setTimeout(() => {
            const inputZone = document.querySelector('.input-zone');
            if (inputZone && inputZone.style.display !== 'none') {
                const input = document.getElementById('message-input');
                if (input) input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }
    originalHeight = newHeight;
    updateDvh();
});

// ─── Запуск ──────────────────────────────────────────────
(async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    
    if (session) {
        currentUser = session.user;
        
        const { data: p } = await _supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .maybeSingle();
        
        if (!p) {
            const email = currentUser.email;
            let username = email ? email.split('@')[0] : 'user';
            username = username.replace(/@lumina\.local$/, '');
            const { data: newProfile } = await _supabase
                .from('profiles')
                .insert({
                    id: currentUser.id,
                    username: username,
                    full_name: username,
                    last_seen: new Date().toISOString()
                })
                .select()
                .maybeSingle();
            currentProfile = newProfile;
        } else {
            currentProfile = p;
        }
        
        if (currentProfile) {
            document.getElementById('current-user-badge').textContent = currentProfile.full_name;
            updateProfileFooter();
            initProfileFooter();
        }
        
        await loadAllUsers();
        await ensureBotChat();
        
        showScreen('chat');
        await loadDialogs();
        
        document.getElementById('chat-title').textContent = 'Lumina Lite';
        document.querySelector('.chat-status').textContent = 'выберите диалог';
        const inputZone = document.querySelector('.input-zone');
        if (inputZone) inputZone.style.display = 'none';
        
        document.getElementById('messages').innerHTML = `
            <div class="msg-stub">
                <svg width="48" height="48" style="margin-bottom: 16px; opacity: 0.3;"><use href="#icon-chat"/></svg>
                <p>Выберите диалог, чтобы начать общение</p>
            </div>
        `;
        
        currentChat = null;
        
        document.addEventListener('click', () => updateLastSeen());
        document.addEventListener('keypress', () => updateLastSeen());
        setInterval(() => updateLastSeen(), 30000);
        updateLastSeen();
        
        startOnlineHeartbeat();
    } else {
        showScreen('reg');
    }
})();
