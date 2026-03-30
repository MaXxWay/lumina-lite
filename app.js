// Supabase конфигурация
const SUPABASE_URL = 'https://ofxvazqurjgnxxuozjlr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9meHZhenF1cmpnbnh4dW96amxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTg4ODEsImV4cCI6MjA5MDE5NDg4MX0.Zf2pwQNmxe9wBt7tlZed-ntnLPzm7JGOuqkLuBkv0GE';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let currentProfile = null;
let currentChat = null;
let realtimeChannel = null;
let allUsers = [];
let messagesCache = new Map();
let dialogCache = new Map();
let observedMessages = new Set();
let isOnline = navigator.onLine;

// Константы
const BOT_USER_ID = '00000000-0000-0000-0000-000000000000';
const SAVED_CHAT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const MAX_CACHED_CHATS = 20;
const MESSAGES_PER_PAGE = 50;
let currentOffset = 0;
let hasMoreMessages = true;

const BOT_PROFILE = {
    id: BOT_USER_ID,
    username: 'lumina_bot',
    full_name: 'Lumina Bot',
    bio: 'Официальный бот мессенджера Lumina Lite',
    is_bot: true
};

const SAVED_CHAT = {
    id: SAVED_CHAT_ID,
    username: 'saved',
    full_name: 'Избранное',
    bio: 'Сохраненные сообщения',
    is_saved: true
};

// --- Офлайн детектор ---
window.addEventListener('online', () => {
    isOnline = true;
    document.getElementById('offline-indicator').style.display = 'none';
    showToast('Соединение восстановлено');
    if (currentChat) {
        loadMessages(currentChat.id, true);
    }
    loadDialogs();
});

window.addEventListener('offline', () => {
    isOnline = false;
    document.getElementById('offline-indicator').style.display = 'flex';
    showToast('Нет соединения с интернетом', true);
});

// --- Функции помощи ---
function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(() => { t.className = 'toast'; }, 3000);
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDateDivider(date) {
    const msgDate = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
    const msgDateStart = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate());
    
    if (msgDateStart.getTime() === todayStart.getTime()) {
        return 'Сегодня';
    } else if (msgDateStart.getTime() === yesterdayStart.getTime()) {
        return 'Вчера';
    } else {
        return msgDate.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' });
    }
}

function formatLastSeen(lastSeen) {
    if (!lastSeen) return 'неизвестно';
    
    const lastSeenDate = new Date(lastSeen);
    const now = new Date();
    const diffMins = (now - lastSeenDate) / 60000;
    
    if (diffMins < 5) {
        return 'онлайн';
    }
    
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

// --- Очистка мертвых чатов ---
async function checkUserExists(userId) {
    if (userId === BOT_USER_ID || userId === SAVED_CHAT_ID) return true;
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

async function cleanupDeadChats() {
    if (!currentUser) return;
    console.log('🧹 Запуск очистки мертвых чатов...');
    
    try {
        const { data: chats, error } = await _supabase
            .from('chats')
            .select('*')
            .contains('participants', [currentUser.id]);
        
        if (error) throw error;
        
        let deletedCount = 0;
        
        for (const chat of chats || []) {
            const otherId = chat.participants.find(id => id !== currentUser.id);
            
            if (otherId && otherId !== BOT_USER_ID && otherId !== SAVED_CHAT_ID) {
                const userExists = await checkUserExists(otherId);
                if (!userExists) {
                    console.log(`🗑️ Удаляем мертвый чат: ${chat.id}`);
                    await _supabase.from('chats').delete().eq('id', chat.id);
                    await _supabase.from('messages').delete().eq('chat_id', chat.id);
                    deletedCount++;
                }
            }
        }
        
        if (deletedCount > 0) {
            console.log(`✅ Удалено ${deletedCount} мертвых чатов`);
            await loadDialogs();
        }
    } catch (err) {
        console.error('Ошибка очистки мертвых чатов:', err);
    }
}

// --- Онлайн статус ---
let onlineInterval = null;
let isUserOnline = true;
let userActivityTimeout = null;
let lastActivityTime = Date.now();

async function setUserOnlineStatus(isOnline) {
    if (!currentUser) return;
    isUserOnline = isOnline;
    try {
        const { error } = await _supabase
            .from('profiles')
            .update({ is_online: isOnline, last_seen: new Date().toISOString() })
            .eq('id', currentUser.id);
        if (error) console.error('Ошибка обновления статуса:', error);
    } catch (err) {
        console.error('Ошибка:', err);
    }
}

function resetUserActivity() {
    if (!currentUser) return;
    lastActivityTime = Date.now();
    if (userActivityTimeout) clearTimeout(userActivityTimeout);
    if (!isUserOnline) setUserOnlineStatus(true);
    
    userActivityTimeout = setTimeout(async () => {
        const inactiveTime = Date.now() - lastActivityTime;
        if (inactiveTime >= 15000 && isUserOnline) {
            await setUserOnlineStatus(false);
        }
    }, 1);
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
    if (currentUser) {
        setUserOnlineStatus(false);
    }
});

document.addEventListener('visibilitychange', async () => {
    if (!currentUser) return;
    if (document.hidden) {
        await setUserOnlineStatus(false);
        if (userActivityTimeout) clearTimeout(userActivityTimeout);
    } else {
        await setUserOnlineStatus(true);
        resetUserActivity();
        if (currentChat && currentChat.id !== SAVED_CHAT_ID) {
            await markChatMessagesAsRead(currentChat.id);
        }
    }
});

// Привязка событий активности
window.addEventListener('mousemove', resetUserActivity);
window.addEventListener('keydown', resetUserActivity);
window.addEventListener('click', resetUserActivity);
window.addEventListener('scroll', resetUserActivity);

// --- Валидация пароля ---
function checkPasswordStrength(password) {
    const strengthDiv = document.getElementById('reg-password-strength');
    if (!strengthDiv) return false;
    
    if (password.length === 0) {
        strengthDiv.textContent = '';
        strengthDiv.className = 'password-strength';
        return false;
    }
    
    let strength = 0;
    if (password.length >= 6) strength++;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    
    if (strength <= 1) {
        strengthDiv.textContent = 'Слабый пароль';
        strengthDiv.className = 'password-strength weak';
        return false;
    } else if (strength <= 3) {
        strengthDiv.textContent = 'Средний пароль';
        strengthDiv.className = 'password-strength medium';
        return true;
    } else {
        strengthDiv.textContent = 'Сильный пароль';
        strengthDiv.className = 'password-strength strong';
        return true;
    }
}

// --- Экраны ---
const screens = {
    reg: document.getElementById('step-register'),
    login: document.getElementById('step-login'),
    chat: document.getElementById('chat-screen'),
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

// --- Регистрация ---
const regBtn = document.getElementById('btn-do-reg');
if (regBtn) {
    regBtn.onclick = async () => {
        const user = document.getElementById('reg-username').value.trim();
        const pass = document.getElementById('reg-password').value.trim();
        const name = document.getElementById('reg-full-name').value.trim();
        
        if (!user || !pass || !name) {
            showToast('Заполните все поля', true);
            return;
        }
        
        if (!checkPasswordStrength(pass)) {
            showToast('Придумайте более надежный пароль', true);
            return;
        }
        
        const email = `${user.toLowerCase().replace(/^@/, '')}@lumina.local`;
        
        const { data, error } = await _supabase.auth.signUp({ email, password: pass });
        if (error) return showToast(error.message, true);
        
        if (data.user) {
            await _supabase.from('profiles').upsert({
                id: data.user.id,
                username: user.replace(/^@/, ''),
                full_name: name,
                last_seen: new Date().toISOString(),
                is_online: false
            });
            showToast('Аккаунт создан! Войдите.');
            setTimeout(() => showScreen('login'), 1000);
        }
    };
}

const regPassword = document.getElementById('reg-password');
if (regPassword) {
    regPassword.oninput = (e) => checkPasswordStrength(e.target.value);
}

// --- Вход ---
const loginBtn = document.getElementById('btn-do-login');
if (loginBtn) {
    loginBtn.onclick = async () => {
        const user = document.getElementById('login-username').value.trim();
        const pass = document.getElementById('login-password').value.trim();
        const email = `${user.toLowerCase().replace(/^@/, '')}@lumina.local`;
        
        const { data, error } = await _supabase.auth.signInWithPassword({ email, password: pass });
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
                    last_seen: new Date().toISOString(),
                    is_online: true
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
        await ensureSavedChat();
        
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
        startOnlineHeartbeat();
        await cleanupDeadChats();
    };
}

// Навигация авторизации
const toLogin = document.getElementById('to-login');
const toRegister = document.getElementById('to-register');
if (toLogin) toLogin.onclick = () => showScreen('login');
if (toRegister) toRegister.onclick = () => showScreen('reg');

// --- Нижняя панель профиля ---
function updateProfileFooter() {
    if (!currentProfile) return;
    
    const footerAvatar = document.getElementById('footer-avatar');
    const footerName = document.getElementById('footer-name');
    const footerUsername = document.getElementById('footer-username');
    
    if (footerAvatar) footerAvatar.textContent = (currentProfile.full_name || '?')[0].toUpperCase();
    if (footerName) footerName.textContent = currentProfile.full_name || currentProfile.username || 'Пользователь';
    if (footerUsername) footerUsername.textContent = `@${currentProfile.username || 'username'}`;
}

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

// --- Профиль ---
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

const profileBackBtn = document.getElementById('btn-profile-back');
if (profileBackBtn) profileBackBtn.onclick = () => showScreen('chat');

const profileLogoutBtn = document.getElementById('btn-logout-profile');
if (profileLogoutBtn) {
    profileLogoutBtn.onclick = async () => {
        stopOnlineHeartbeat();
        if (realtimeChannel) await _supabase.removeChannel(realtimeChannel);
        await _supabase.auth.signOut();
        currentUser = null;
        currentProfile = null;
        currentChat = null;
        showScreen('reg');
    };
}

// --- Загрузка пользователей ---
async function loadAllUsers() {
    try {
        const { data, error } = await _supabase
            .from('profiles')
            .select('id, username, full_name')
            .neq('id', currentUser.id)
            .neq('id', BOT_USER_ID);
        
        if (error) throw error;
        
        const validUsers = [];
        for (const user of data || []) {
            const exists = await checkUserExists(user.id);
            if (exists) validUsers.push(user);
        }
        allUsers = validUsers;
    } catch (err) {
        console.error('Ошибка загрузки пользователей:', err);
        allUsers = [];
    }
}

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

// --- Бот и избранное ---
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
                    text: 'Добро пожаловать в мессенджер Lumina Lite! Начните общение прямо сейчас!',
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
                text: 'Добро пожаловать в мессенджер Lumina Lite!\n\nЭто бот-помощник. Здесь можно:\n• Найти друзей по @username\n• Общаться в реальном времени\n• Настраивать профиль\n• Сохранять важные сообщения в Избранное\n\nПриятного общения! 🚀',
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

async function ensureSavedChat() {
    try {
        const { data: existing } = await _supabase
            .from('chats')
            .select('id')
            .eq('type', 'saved')
            .contains('participants', [currentUser.id])
            .maybeSingle();
        
        if (existing) return;
        
        const { data: newChat } = await _supabase
            .from('chats')
            .insert({
                id: SAVED_CHAT_ID,
                type: 'saved',
                participants: [currentUser.id],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                is_saved_chat: true
            })
            .select()
            .single();
        
        if (newChat) {
            await _supabase.from('messages').insert({
                text: '💾 Избранное\n\nЗдесь будут храниться ваши сохраненные сообщения. Чтобы сохранить сообщение, нажмите на него правой кнопкой мыши и выберите "Сохранить в избранное".',
                user_id: currentUser.id,
                chat_id: newChat.id,
                is_system: true,
                is_read: true
            });
        }
    } catch (err) {
        console.error('Ошибка создания чата Избранное:', err);
    }
}
// --- Статус пользователя ---
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

function subscribeToUserStatus(userId) {
    if (statusSubscription) _supabase.removeChannel(statusSubscription);
    
    statusSubscription = _supabase
        .channel(`status-${userId}`)
        .on('postgres_changes', 
            { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
            async (payload) => {
                if (payload.new && currentChat?.other_user?.id === userId) {
                    updateChatStatusFromProfile(payload.new);
                }
                const dialogItem = document.querySelector(`.dialog-item[data-other-user-id="${userId}"]`);
                if (dialogItem) {
                    const onlineDot = dialogItem.querySelector('.online-dot');
                    const isOnline = payload.new.is_online === true;
                    if (onlineDot) {
                        if (isOnline) onlineDot.classList.remove('hidden');
                        else onlineDot.classList.add('hidden');
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
    const isSaved = currentChat?.id === SAVED_CHAT_ID;
    
    if (isBot) {
        chatStatus.textContent = 'бот';
        chatStatus.className = 'chat-status status-bot';
        return;
    }
    if (isSaved) {
        chatStatus.textContent = 'личное';
        chatStatus.className = 'chat-status status-offline';
        return;
    }
    
    const status = getUserStatusFromProfile(profile);
    chatStatus.textContent = status.text;
    chatStatus.className = `chat-status ${status.class}`;
}

// --- Индикатор печати ---
let typingChannel = null;
let typingTimeout = null;
let isTyping = false;

function setupTypingIndicator() {
    const messageInput = document.getElementById('message-input');
    if (!messageInput) return;
    
    messageInput.removeEventListener('input', handleTypingInput);
    messageInput.addEventListener('input', handleTypingInput);
}

function handleTypingInput() {
    if (!currentChat || currentChat.other_user?.id === BOT_USER_ID || currentChat.id === SAVED_CHAT_ID) return;
    
    if (typingTimeout) clearTimeout(typingTimeout);
    
    if (!isTyping) {
        isTyping = true;
        sendTypingStatus(true);
    }
    
    typingTimeout = setTimeout(() => {
        isTyping = false;
        sendTypingStatus(false);
    }, 2000);
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
    if (typingChannel) _supabase.removeChannel(typingChannel);
    
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
                        typingStatus.style.display ='none';
                    }
                }, 3000);
            } else {
                typingStatus.style.display = 'none';
            }
        })
        .subscribe();
}

// --- Отметить сообщения как прочитанные ---
async function markChatMessagesAsRead(chatId) {
    if (!chatId || !currentUser || chatId === SAVED_CHAT_ID) return;
    
    try {
        const { error } = await _supabase
            .from('messages')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('chat_id', chatId)
            .neq('user_id', currentUser.id)
            .eq('is_read', false);
        
        if (error) throw error;
        
        if (messagesCache.has(chatId)) {
            const cachedMessages = messagesCache.get(chatId);
            cachedMessages.forEach(msg => {
                if (msg.user_id !== currentUser.id) msg.is_read = true;
            });
            messagesCache.set(chatId, cachedMessages);
        }
        
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer && currentChat?.id === chatId) {
            const allMessages = messagesContainer.querySelectorAll('.message:not(.own)');
            allMessages.forEach(msgDiv => {
                const readSpan = msgDiv.querySelector('.read-status');
                if (readSpan && !msgDiv.classList.contains('bot-message')) {
                    readSpan.className = 'read-status read';
                    readSpan.innerHTML = '<svg width="12" height="12"><use href="#icon-check-double"/></svg>';
                }
                msgDiv.classList.remove('unread-message');
            });
        }
        
        await loadDialogs();
    } catch (err) {
        console.error('Ошибка отметки прочитанных:', err);
    }
}

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
                const isBot = msgDiv.classList.contains('bot-message');
                const isRead = msgDiv.querySelector('.read-status')?.classList.contains('read');
                
                if (!isOwn && !isBot && msgId && !isRead && !observedMessages.has(msgId)) {
                    visibleMessages.push(msgId);
                    observedMessages.add(msgId);
                }
            }
        });
        
        if (visibleMessages.length > 0 && currentChat && currentChat.id !== SAVED_CHAT_ID) {
            setTimeout(async () => {
                try {
                    await _supabase
                        .from('messages')
                        .update({ is_read: true, read_at: new Date().toISOString() })
                        .in('id', visibleMessages);
                    
                    visibleMessages.forEach(msgId => {
                        const msgDiv = document.querySelector(`.message[data-id="${msgId}"]`);
                        if (msgDiv) {
                            const readSpan = msgDiv.querySelector('.read-status');
                            if (readSpan) {
                                readSpan.className = 'read-status read';
                                readSpan.innerHTML = '<svg width="12" height="12"><use href="#icon-check-double"/></svg>';
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
                } catch (err) {}
            }, 500);
        }
    }, { threshold: 0.5 });
    
    const observeNewMessages = () => {
        const messages = container.querySelectorAll('.message:not(.own):not(.bot-message)');
        messages.forEach(msg => observer.observe(msg));
    };
    
    observeNewMessages();
    const mutationObserver = new MutationObserver(() => observeNewMessages());
    mutationObserver.observe(container, { childList: true, subtree: true });
    
    return { observer, mutationObserver };
}

// --- Загрузка диалогов ---
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

async function loadDialogs(searchTerm = '') {
    const container = document.getElementById('dialogs-list');
    if (!container) return;
    
    const isUserSearch = searchTerm.startsWith('@');
    
    if (isUserSearch && searchTerm.length > 1) {
        await loadUserSearchResults(searchTerm, container);
        return;
    }
    
    try {
        const { data: chats, error: chatsError } = await _supabase
            .from('chats')
            .select('*')
            .contains('participants', [currentUser.id])
            .order('updated_at', { ascending: false });
        
        if (chatsError) throw chatsError;
        
        const validChats = [];
        for (const chat of chats || []) {
            const otherId = chat.participants.find(id => id !== currentUser.id);
            if (otherId === BOT_USER_ID || chat.id === SAVED_CHAT_ID) {
                validChats.push(chat);
                continue;
            }
            const userExists = await checkUserExists(otherId);
            if (userExists) {
                validChats.push(chat);
            } else {
                await _supabase.from('chats').delete().eq('id', chat.id);
                await _supabase.from('messages').delete().eq('chat_id', chat.id);
            }
        }
        
        // Оптимизированный запрос последних сообщений
        const lastMessagesMap = new Map();
        if (validChats.length > 0) {
            const { data: lastMsgs } = await _supabase
                .from('messages')
                .select('chat_id, text, user_id')
                .in('chat_id', validChats.map(c => c.id))
                .order('created_at', { ascending: false });
            
            const uniqueChats = new Set();
            for (const msg of lastMsgs || []) {
                if (!uniqueChats.has(msg.chat_id)) {
                    uniqueChats.add(msg.chat_id);
                    const isOwn = msg.user_id === currentUser.id;
                    const prefix = isOwn ? 'Вы: ' : '';
                    let text = msg.text;
                    if (text && text.length > 50) text = text.slice(0, 47) + '...';
                    lastMessagesMap.set(msg.chat_id, prefix + text);
                }
            }
        }
        
        const allParticipantIds = validChats.flatMap(c => c.participants);
        const { data: profiles } = await _supabase
            .from('profiles')
            .select('id, full_name, username, last_seen, is_online')
            .in('id', [...new Set(allParticipantIds)]);
        
        const profileMap = new Map();
        if (profiles) profiles.forEach(p => profileMap.set(p.id, p));
        profileMap.set(BOT_USER_ID, BOT_PROFILE);
        
        const chatData = [];
        for (const chat of validChats) {
            const otherId = chat.participants.find(id => id !== currentUser.id);
            
            if (chat.id === SAVED_CHAT_ID) {
                chatData.push({
                    id: chat.id,
                    otherId: SAVED_CHAT_ID,
                    otherUser: SAVED_CHAT,
                    name: 'Избранное',
                    isSaved: true,
                    isBot: false,
                    unreadCount: 0,
                    lastMessage: lastMessagesMap.get(chat.id) || 'Сохраненные сообщения',
                    updatedAt: chat.updated_at,
                    statusText: 'личное',
                    statusClass: 'status-offline',
                    isOnline: false
                });
                continue;
            }
            
            const otherUser = profileMap.get(otherId);
            if (!otherUser && otherId !== BOT_USER_ID) continue;
            
            const name = otherUser?.full_name || otherUser?.username || 'Пользователь';
            const isBot = otherId === BOT_USER_ID;
            const unreadCount = await getUnreadCount(chat.id);
            const status = otherUser ? getUserStatusFromProfile(otherUser) : { text: '', class: '' };
            const isOnline = status.class === 'status-online';
            
            chatData.push({
                id: chat.id,
                otherId,
                otherUser,
                name,
                isBot,
                isSaved: false,
                unreadCount,
                lastMessage: lastMessagesMap.get(chat.id) || 'Нет сообщений',
                updatedAt: chat.updated_at,
                statusText: status.text,
                statusClass: status.class,
                isOnline
            });
        }
        
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
    }
}

function renderDialogsList(container, filteredData) {
    container.innerHTML = '';
    
    if (filteredData.length === 0) {
        container.innerHTML = '<div class="dialogs-loading">Нет диалогов. Введите @username для поиска</div>';
        return;
    }
    
    filteredData.forEach(chat => {
        const div = document.createElement('div');
        div.className = `dialog-item ${currentChat?.id === chat.id ? 'active' : ''} ${chat.unreadCount > 0 ? 'unread-dialog' : ''} ${chat.isSaved ? 'saved-dialog' : ''}`;
        div.dataset.chatId = chat.id;
        div.dataset.otherUserId = chat.otherId;
        
        const unreadBadge = chat.unreadCount > 0 ? 
            `<span class="unread-badge-count">${chat.unreadCount > 99 ? '99+' : chat.unreadCount}</span>` : '';
        
        const isOnline = chat.isOnline === true;
        
        let avatarHtml = '';
        if (chat.isBot) {
            avatarHtml = `<svg width="28" height="28"><use href="#icon-bot"/></svg>`;
        } else if (chat.isSaved) {
            avatarHtml = `<svg width="24" height="24"><use href="#icon-saved"/></svg>`;
        } else {
            avatarHtml = `<div class="avatar-letter">${escapeHtml(chat.name.charAt(0))}</div>`;
        }
        
        div.innerHTML = `
            <div class="dialog-avatar ${chat.isBot ? 'bot-avatar' : ''} ${chat.isSaved ? 'saved-avatar' : ''}">
                ${avatarHtml}
                ${chat.isBot ? '<div class="verified-badge"><svg width="14" height="14"><use href="#icon-check"/></svg></div>' : ''}
                ${!chat.isBot && !chat.isSaved ? `<div class="online-dot ${isOnline ? '' : 'hidden'}"></div>` : ''}
            </div>
            <div class="dialog-info">
                <div class="dialog-name">
                    ${escapeHtml(chat.name)}
                    ${chat.isBot ? '<span class="bot-badge">Бот</span>' : ''}
                    ${chat.isSaved ? '<span class="saved-badge">⭐</span>' : ''}
                    ${unreadBadge}
                </div>
                <div class="dialog-preview">${escapeHtml(chat.lastMessage)}</div>
            </div>
        `;
        
        div.onclick = async () => {
            if (chat.isSaved) {
                await openSavedChat(chat.id);
            } else {
                await openChat(chat.id, chat.otherId, chat.otherUser);
            }
            if (chat.unreadCount > 0 && !chat.isSaved) {
                await markChatMessagesAsRead(chat.id);
            }
        };
        
        container.appendChild(div);
    });
}

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

const searchInputElemDialogs = document.getElementById('search-dialogs');
if (searchInputElemDialogs) {
    let searchTimeout;
    searchInputElemDialogs.oninput = (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            loadDialogs(e.target.value);
        }, 300);
    };
}

// --- Загрузка сообщений с пагинацией ---
async function loadMessages(chatId, reset = true) {
    const container = document.getElementById('messages');
    if (!container) return;
    
    if (reset) {
        currentOffset = 0;
        hasMoreMessages = true;
        messagesCache.delete(chatId);
        container.innerHTML = '';
    }
    
    if (messagesCache.has(chatId) && reset) {
        const cachedMessages = messagesCache.get(chatId);
        renderMessagesBatch(cachedMessages);
        return;
    }
    
    try {
        const { data: msgs, error, count } = await _supabase
            .from('messages')
            .select('*', { count: 'exact' })
            .eq('chat_id', chatId)
            .order('created_at', { ascending: true })
            .range(currentOffset, currentOffset + MESSAGES_PER_PAGE - 1);
        
        if (error) throw error;
        
        hasMoreMessages = msgs.length === MESSAGES_PER_PAGE;
        
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
        
        const messagesWithProfiles = msgs.map(msg => ({
            ...msg,
            profiles: profilesMap.get(msg.user_id),
            is_read: msg.is_read || false
        }));
        
        if (reset) {
            messagesCache.set(chatId, messagesWithProfiles);
            renderMessagesBatch(messagesWithProfiles);
        } else {
            const existing = messagesCache.get(chatId) || [];
            messagesCache.set(chatId, [...messagesWithProfiles, ...existing]);
            renderMessagesBatch([...messagesWithProfiles, ...existing]);
        }
        
        const loadMoreBtn = document.getElementById('load-more-btn');
        if (loadMoreBtn) {
            loadMoreBtn.style.display = hasMoreMessages ? 'block' : 'none';
            loadMoreBtn.onclick = () => {
                currentOffset += MESSAGES_PER_PAGE;
                loadMessages(chatId, false);
            };
        }
        
        if (reset) {
            container.scrollTop = container.scrollHeight;
        }
    } catch (err) {
        console.error(err);
        container.innerHTML = '<div class="loading-messages">Ошибка загрузки</div>';
    }
}

function renderMessagesBatch(messages) {
    const container = document.getElementById('messages');
    if (!container) return;
    
    const stub = container.querySelector('.msg-stub');
    if (stub) stub.remove();
    
    container.innerHTML = '';
    let lastDate = null;
    
    messages.forEach(msg => {
        const currentDate = new Date(msg.created_at).toDateString();
        if (!lastDate || lastDate !== currentDate) {
            const dateDivider = document.createElement('div');
            dateDivider.className = 'date-divider';
            dateDivider.innerHTML = `
                <div class="date-divider-line"></div>
                <div class="date-divider-text">${formatDateDivider(msg.created_at)}</div>
                <div class="date-divider-line"></div>
            `;
            container.appendChild(dateDivider);
            lastDate = currentDate;
        }
        renderMessage(msg, false);
    });
    
    if (messages.length === 0) {
        container.innerHTML = '<div class="msg-stub">Начните переписку</div>';
    }
}// --- Рендер сообщения ---
function renderMessage(msg, isNewMessage = false) {
    const container = document.getElementById('messages');
    if (!container) return;
    
    const isOwn = currentUser && msg.user_id === currentUser.id;
    const isBot = msg.user_id === BOT_USER_ID;
    let name = 'Пользователь';
    
    if (msg.profiles && msg.profiles.full_name) name = msg.profiles.full_name;
    else if (isOwn && currentProfile && currentProfile.full_name) name = currentProfile.full_name;
    else if (isBot) name = 'Lumina Bot';
    
    const timeStr = new Date(msg.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
    const isRead = msg.is_read === true;
    const isSending = msg.is_sending === true;
    
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'own' : 'other'} ${isBot ? 'bot-message' : ''} ${!isOwn && !isRead && currentChat?.id !== SAVED_CHAT_ID ? 'unread-message' : ''}`;
    div.dataset.id = msg.id;
    div.dataset.text = msg.text;
    
    let readStatusHtml = '';
    if (isOwn && !isBot && currentChat?.id !== SAVED_CHAT_ID) {
        if (isSending) {
            readStatusHtml = `<span class="read-status sending"><svg width="12" height="12"><use href="#icon-clock"/></svg></span>`;
        } else if (isRead) {
            readStatusHtml = `<span class="read-status read"><svg width="12" height="12"><use href="#icon-check-double"/></svg></span>`;
        } else {
            readStatusHtml = `<span class="read-status delivered"><svg width="12" height="12"><use href="#icon-check"/></svg></span>`;
        }
    }
    
    div.innerHTML = `
        <div class="msg-avatar ${isBot ? 'bot-avatar' : ''}">
            ${isBot ? '<svg width="20" height="20"><use href="#icon-bot"/></svg>' : `<div class="avatar-letter">${escapeHtml(name.charAt(0))}</div>`}
            ${isBot ? '<div class="verified-badge-small"><svg width="12" height="12"><use href="#icon-check"/></svg></div>' : ''}
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
    
    if (isNewMessage) {
        setTimeout(() => {
            container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        }, 50);
    }
}

// --- Контекстное меню ---
const messageMenu = document.getElementById('message-menu');
let activeMessage = null;

function showMessageMenu(e, messageId, messageText, isOwn) {
    e.preventDefault();
    e.stopPropagation();
    
    if (messageMenu) {
        messageMenu.style.display = 'block';
        messageMenu.style.left = `${e.clientX}px`;
        messageMenu.style.top = `${e.client.clientYY}px}px`;
        
`;
        
        const menuItems        const = message menuItems = messageMenu.querySelectorMenu.querySelectorAll('.All('.menu-itemmenu-item');
       ');
        menuItems.forEach(item menuItems.forEach(item => {
 => {
            const            const action = action = item.dat item.dataset.action;
           aset.action;
            item.on item.onclick =click = () => () => handleMessage handleMessageAction(actionAction(action, message, messageId,Id, messageText messageText, is, isOwn);
        });
Own);
        });
        
               
        setTimeout(() => document setTimeout(() => document.addEventListener('click', hideMessage.addEventListener('click', hideMessageMenu),Menu), 0);
    0);
    }
}

 }
}

function hideMessagefunction hideMenu() {
MessageMenu()    if {
    if (messageMenu (message) messageMenuMenu) messageMenu.style.display.style.display = 'none';
    document.removeEventListener = 'none';
    document.removeEventListener('click', hide('click', hideMessageMenuMessageMenu);
}

async function);
}

async function handleMessage handleMessageAction(action, messageAction(actionId,, messageId, messageText messageText, isOwn), isOwn) {
    {
    hideMessage hideMessageMenu();
Menu();
    
       
    switch ( switch (action) {
action) {
               case ' case 'reply':
reply':
            const input =            const input = document.getElementById('message document.getElementById('message-input');
            if-input');
            if (input && current (input && currentChat?.Chat?.id !== SAVid !== SAVED_CHED_CHAT_ID)AT_ID) {
 {
                input                input.value = `>.value = `> ${message ${messageText}\Text}\n\nn\n`;
                input.f`;
                input.focus();
           ocus();
            }
 }
            break            break;
       ;
        case 'copy':
 case 'copy':
            await            await navigator navigator.clipboard.write.clipboard.writeText(messageText(messageText);
            showText);
            showToast('Toast('ТекстТекст скопирован');
 скопирован');
            break            break;
        case ';
        case 'edit':
edit':
            if            if (isOwn && (isOwn && currentChat currentChat?.id !== S?.id !== SAVEDAVED_CHAT_ID)_CHAT_ID) {
                const newText = {
                const newText = prompt('Изм prompt('Изменитьенить сообщение:', message сообщение:', messageText);
Text);
                if                if (newText && (newText && newText newText.trim()) {
                   .trim()) {
                    const { const { error } error } = await _sup = await _supabase
abase
                        .                        .from('messages')
from('messages')
                        .update({ text:                        .update({ text: newText newText.trim(),.trim(), is_edited: is_edited: true })
 true })
                        .eq                        .('id',eq('id', messageId messageId);
                    if ();
                    if (error)error) show showToast('ОшибToast('Ошибка редака редактирования', trueктирования', true);
                   );
                    else show else showToast('СообToast('Сообщение изменщение изменено');
ено');
                }
                }
            }            } else {
 else {
                showToast('                showToast('МожноМожно редактировать только свои сооб редактировать толькощения', свои сооб true);
            }
щения',            break true);
            }
            break;
        case ';
        case 'saved':
            if (currentsaved':
            if (currentChat?.id !==Chat?.id !== SAV SAVED_CHED_CHAT_ID) {
AT_ID) {
                await                await saveToSavedMessages saveToSavedMessages(messageText(messageText);
           );
            }
            break;
 }
            break;
        case        case 'forward':
            'forward':
            showToast('Ф showToast('Функцияункция пересы пересылкилки в разработке');
            в break;
        case разработке');
            break;
        case 'delete 'delete':
           ':
            if (isOwn if (isOwn) {
) {
                if (confirm                if (confirm('У('Удалитьдалить сообщение?')) сообщение?')) {
                    {
                    const { error } const { = await error } = await _sup _supabase
                        .abase
                        .from('from('messages')
messages')
                        .                        .delete()
delete()
                        .                        .eq('id',eq('id', messageId messageId);
                    if ();
                   error) if (error) showToast showToast('Ошибка('Ошибка удаления', true);
                    else showToast(' удаления', true);
                    else showToast('Сообщение удаСообщение удалено');
лено');
                }
                }
            } else {
            } else {
                show                showToast('МожноToast('Можно удалять удалять только свои только свои сообщения', true сообщения', true);
           );
            }
            break;
 }
            break;
    }
    }
}

async}

async function saveToSavedMessages function saveToSavedMessages(messageText) {
   (messageText) {
    try {
 try {
        const { data        const { data: saved: savedChat } = awaitChat } = await _sup _supabase
            .abase
            .from('from('chatschats')
            .select')
            .select('id('id')
            .eq')
            .eq('type('type', '', 'saved')
           saved')
            .contains .contains('participants',('participants', [current [currentUser.id])
           User.id])
            .single .single();
        
();
        
        if        if (savedChat (savedChat) {
            await) {
            await _sup _supabase.fromabase.from('messages').insert('messages').insert({
               ({
                text: ` text: `📌 Со📌 Сохранено из чахранено из чата:\та:\n\nn\n${messageText}`${messageText}`,
               ,
                user_id user_id: currentUser.id: currentUser.id,
               ,
                chat_id: saved chat_id: savedChat.id,
                is_readChat.id,
                is_read: true: true,
               ,
                created_at: new created_at: new Date(). Date().toISOString()
            });
toISOString()
            show            });
            showToast('Toast('СохраненоСохранено в из в избранное');
        }
    } catchбранное');
        }
    } catch (err (err) {
) {
        show        showToast('Toast('Ошибка сохОшибка сохранения',ранения', true);
 true);
    }
}

//    }
}

// --- Под --- Подписка на сообписка на сообщения ---щения ---
function subscribeTo
function subscribeToMessages(Messages(chatId) {
chatId) {
    if    if (re (realtimeChannel) _altimeChannel) _supabasesupabase.removeChannel.removeChannel(realtimeChannel);
(realtimeChannel);
    
       
    realtimeChannel = realtimeChannel = _supabase
 _supabase
        .        .channel(`chat-channel(`chat-${chat${chatId}`)
       Id}`)
        .on .on('post('postgres_changes',gres_changes', 
            
            { event: ' { event: 'INSERT',INSERT', schema: schema: 'public', table 'public', table: ': 'messages', filter:messages', filter `chat: `chat_id=_id=eq.${chateq.${chatId}`Id}` }, 
 }, 
            async (payload            async (payload) =>) => {
                {
                if (document.querySelector if (document.querySelector(`.(`.message[data-idmessage[data-id="${payload="${payload.new.id}"].new.id}"]`))`)) return;
                
                return;
                
                let profile = current let profile = currentProfile;
                ifProfile;
                if (payload.new.user_id !== (payload.new.user_id !== currentUser currentUser?.id) {
?.id) {
                    if                    if (payload (payload.new.new.user.user_id === BOT_id === BOT_USER_ID_USER_ID) {
                        profile) {
                        profile = B = BOT_PROFILE;
OT_PROFILE;
                    }                    } else {
 else {
                        const { data                        const { data: user: userProfile }Profile } = await _sup = await _supabase
abase
                            .from('                            .from('profilesprofiles')
                            .select')
                            .('fullselect('full_name,_name, username')
                            .eq(' username')
                            .id',eq('id', payload.new payload.new.user_id.user_id)
                           )
                            .single();
                        .single();
                        if ( if (userProfileuserProfile) profile) profile = user = userProfile;
Profile;
                    }
                }
                    }
                }
                
                               
                const is const isFromOtherFromOther = payload.new.user = payload_id !== currentUser.new.user_id !== currentUser?.id?.id;
               ;
                const newMessage = const newMessage = { 
 { 
                    ...payload                    ...payload.new, 
.new, 
                    profiles                    profiles: profile,
                   : profile,
                    is_read is_read: !is: !FromOther ||isFromOther || chatId chatId === SAVED_CH === SAVED_CHATAT_ID
                };
_ID
                
                               };
                
                if ( if (messagesCache.has(messagesCache.has(chatIdchatId)) {
)) {
                    const cached =                    const cached = messagesCache messagesCache.get(chatId.get(chatId);
                   );
                    cached.push(newMessage);
                    messagesCache cached.push(newMessage);
                    messagesCache.set(.set(chatId, cached);
               chatId, cached);
                }
                
 }
                
                render                renderMessage(newMessage,Message(newMessage, true);
 true);
                
                if (                
                if (currentChatcurrentChat?.id?.id === chatId && === chatId && isFrom isFromOther && chatIdOther && chat !== SId !== SAVEDAVED_CHAT_ID)_CHAT_ID) {
                    {
                    setTimeout(() setTimeout(() => mark => markChatMessagesAsReadChatMessagesAsRead(chatId),(chatId), 100 100);
               );
                }
                }
                await load await loadDialogsDialogs();
            }
       ();
            }
        )
        )
        .on .on('post('postgres_chgres_changes',
anges',
            { event: 'UPDATE', schema: 'public', table            { event: 'UPDATE', schema: 'public', table:: 'messages 'messages', filter', filter: `: `chat_id=eqchat_id=eq.${chatId.${chatId}` },
}` },
            async            async (payload (payload) => {
                const message) => {
                const messageDiv = document.querySelectorDiv = document.querySelector(`.(`.message[data-idmessage[data-id="${payload="${payload.new.id}"].new.id}"]`);
               `);
                if ( if (messageDivmessageDiv) {
) {
                    const                    const textDiv = message textDiv = messageDiv.querySelectorDiv.querySelector('.text('.text');
                   ');
                    if (textDiv) textDiv.textContent = if (textDiv) textDiv.textContent = payload.new payload.new.text;
                    
.text;
                    
                    if                    if (payload.new.is (payload.new.is_read && !message_read && !messageDiv.classListDiv.classList.contains('own')).contains('own')) {
                        {
                        messageDiv messageDiv.classList.remove.classList.remove('('ununread-mread-message');
essage');
                        const readSpan                        const readSpan = messageDiv.querySelector('.read-status');
                        if (read = messageDiv.querySelector('.read-status');
                        if (readSpan)Span) {
                            {
                            readSpan readSpan.className = '.className = 'read-statusread-status read';
                            readSpan.innerHTML read';
                            read = '<Span.innerHTMLsvg width=" = '<svg width="1212" height" height="12"><use href="#="12icon-check"><use href="#-double"/></icon-checksvg>';
-double"/></svg>';
                        }
                        }
                    }
                }
                    }
                }
                await                await loadDialogs loadDialogs();
();
            }
        )
            }
        )
        .on('postgres        .on('postgres_changes_changes',
            { event',
            { event: ': 'DELETE', schema:DELETE', schema: 'public', table 'public', table: ': 'messages', filter: `chat_id=messages', filter: `chat_id=eq.eq.${chat${chatId}` },
           Id}` },
            (payload) => (payload) => {
                {
                const message const messageDiv = document.querySelectorDiv = document.querySelector(`.message(`.message[data-id[data-id="${payload="${payload.old.id}"]`);
.old.id}                if"]`);
 (messageDiv)                if (message messageDivDiv).remove();
                if messageDiv (messages.remove();
                ifCache.has(chat (messagesCache.has(chatId))Id)) {
                    {
                    const filtered const filtered = messagesCache.get = messagesCache.get(chatId).filter(m(chatId).filter(m => m => m.id !== payload..id !== payload.old.idold.id);
                   );
                    messages messagesCache.set(Cache.set(chatIdchatId, filtered);
               , filtered);
                }
                }
                loadDial loadDialogs();
            }
ogs();
            }
        )
        .subscribe();
}

// --- От        )
        .subscribe();
}

// --- Открытиекрытие чата ---
 чата ---
let islet isOpeningChat = falseOpeningChat;

async = false;

async function open function openChat(chatIdChat(chatId, other, otherUserId, otherUserUserId,) {
 otherUser) {
    if (otherUserId && otherUserId !== BOT_USER_ID)    if (otherUserId && otherUserId !== BOT_USER_ID) {
        const user {
        const userExists =Exists = await checkUserExists await checkUserExists(otherUserId);
       (otherUserId);
        if (!userExists if (!userExists) {
) {
            show            showToast('ПользоваToast('Пользователь удатель удален, чат будет закрылен, чатт', будет закрыт', true);
            await true);
            await _sup _supabaseabase.from('chats').delete()..from('chats').delete().eq('id',eq('id', chatId chatId);
            await _);
            await _supabasesupabase.from('messages')..from('delete().messages').delete().eq('chat_id', chateq('chat_id', chatId);
Id);
            await loadDial            await loadDialogs();
            returnogs();
            return;
       ;
        }
    }
    
 }
    }
    
    if    if (isOpeningChat (isOpeningChat || current || currentChat?.Chat?.id === chatIdid === chatId) return) return;
   ;
    isOpeningChat = isOpeningChat = true;
 true;
    
    try {
    
    try {
        const isBot        const isBot = otherUserId === = otherUserId === BOT_USER_ID BOT_USER_ID;
       ;
        const messages const messagesContainer =Container = document.getElementById('messages document.getElementById('messages');
       ');
        if (messagesContainer) messages if (messagesContainerContainer.innerHTML) messagesContainer.innerHTML = '<div class="loading = '<div class="loading-messages-messages">Загрузка">Загрузка сообщений сообщений...</div>';
        
...</div>';
        
        current        currentChat =Chat = {
            {
            id: chatId id: chatId,
            type: 'private,
            type: '',
           private other_user:',
            otherUser || other_user: otherUser || (is (isBot ?Bot ? BOT BOT_PROFILE_PROFILE : null)
        : null)
        };
        
 };
        
        const        const chatTitle = document.getElementById(' chatTitle = document.getElementById('chat-title');
       chat-title');
        if ( if (chatTitlechatTitle) {
) {
            const name =            const name = otherUser otherUser?.full_name || otherUser?.username?.full_name || otherUser?.username || (isBot || (isBot ? ' ? 'LuminaLumina Bot' Bot' : ' : 'Чат');
           Чат');
            chatTitle chatTitle.innerHTML = `${.innerHTML = `${escapeescapeHtml(nameHtml(name)} ${)} ${isBot ? '<isBot ? '<span classspan class="bot="bot-badge">Б-badge">Бот</от</span>' :span>' : ''}`;
 ''}`;
        }
        }
        
        if (!        
        if (!isBot && otherisBotUserId) && otherUserId) {
            {
            const { data: const { data: profile } profile } = await _sup = await _supabase
abase
                .                .from('profilesfrom('profiles')
               ')
                .select(' .select('**')
               ')
                .eq .eq('id('id', other', otherUserId)
UserId)
                .                .maybemaybeSingleSingle();
           ();
            if ( if (profile)profile) {
                updateChat {
               StatusFrom updateChatStatusFromProfile(profile);
Profile(                subscribeprofile);
                subscribeToUserStatus(otherToUserStatus(otherUserId);
UserId);
                subscribe                subscribeToTypToTyping(ing(chatIdchatId, other, otherUserId);
            }
UserId);
        }            }
        } else if (is else if (isBot) {
            constBot) {
            chat const chatStatus = document.querySelectorStatus =('.chat-status');
 document.querySelector('.chat-status');
            if            if (chat (chatStatus) {
               Status) {
                chatStatus chatStatus.textContent = '.textContent = 'бот';
бот';
                chatStatus.className =                chat 'chatStatus.className =-status status 'chat-bot';
           -status status-bot';
            }
        }
        }
        
        const messageInput }
        
        const messageInput = document = document.getElementById('message-input');
       .getElementById('message-input');
        const sendButton = const sendButton = document.getElementById document.getElementById('btn('btn-send-msg-send-msg');
       ');
        const input const inputZone = document.querySelectorZone = document.querySelector('.input('.input-zone');
        const clear-zone');
       ChatBtn const clearChatBtn = document = document.getElementById('clear-ch.getElementById('clear-chat-btn');
        
at-btn');
        
        if        if (isBot (isBot)) {
            {
            if ( if (inputZone) inputinputZone) inputZone.style.displayZone.style.display = 'none';
            if (messageInput) message = 'none';
            if (messageInput)Input.disabled = true;
            if (send messageInput.disabled = true;
            if (sendButton) sendButtonButton).disabled sendButton.disabled = true = true;
            if (;
            if (clearChatclearChatBtn)Btn) clearChatBtn.style clearChatBtn.style.display = 'none';
.display = 'none';
        } else        } else {
            {
            if (inputZone if (inputZone) input) inputZone.styleZone.style.display =.display = 'block 'block';
            if (messageInput) {
                messageInput.disabled =';
            if (messageInput) {
                messageInput.disabled = false;
 false;
                messageInput.                messageInput.placeholder =placeholder = 'На 'Написать сообщениеписать сообщение...';
...';
                setTimeout(() =>                setTimeout(() => messageInput messageInput.focus.focus(), 100);
(), 100);
            }
            }
            if (            if (sendsendButton)Button) sendButton sendButton.disabled.disabled = false = false;
           ;
            if (clearChat if (clearChatBtn)Btn) clear clearChatChatBtn.styleBtn.style.display =.display = 'block 'block';
           ';
            setupTypingIndicator setupTypingIndicator();
       ();
        }
        
 }
        
        if        if (clear (clearChatBtnChatBtn) {
            clear) {
            clearChatBtn.onclick = ()ChatBtn.onclick = () => {
 => {
                document                document.getElementById('.getElementById('confirm-dialog').style.displayconfirm-dialog').style.display = ' = 'flex';
flex';
                               const const confirmYes confirmYes = document = document.getElementById('.getElementById('confirmconfirm-y-yes');
es');
                const                const confirm confirmNo = documentNo = document.getElementById('.getElementById('confirm-noconfirm-no');
                
                confirm');
                
                confirmYes.onclick = async () => {
                    awaitYes.onclick = async () => {
                    await _supabase.from _supabase.from('messages('messages').delete').delete().eq('chat().eq('chat_id',_id', chatId chatId);
                    await);
                    await loadMessages loadMessages(chatId,(chatId, true);
 true);
                    document                    document.getElementById('confirm-d.getElementById('confirm-dialog').style.display = 'ialog').style.display =none';
 'none';
                    show                    showToast('Toast('История очищИстория очищена');
                };
ена');
                };
                confirm                confirmNo.onNo.onclick =click = () => () => {
                    document {
                    document.getElementById('confirm.getElementById('confirm-dialog').style-dialog').style.display = 'none';
               .display = 'none';
                };
            };
            };
        }
        
 };
        }
        
        await        await loadMessages loadMessages(chatId,(chatId, true);
 true);
        subscribe        subscribeToMessages(chatId);
ToMessages(chatId);
        
        setTimeout(async        
        setTimeout(async () => () => {
            {
            await markChatMessages await markChatMessagesAsReadAsRead(chat(chatId);
            if (windowId);
            if (window.readStatusObservers.readStatusObservers) {
) {
                window                window.readStatusObservers.readStatusObservers.observer.observer?.disconnect();
?.disconnect();
                window                window.readStatus.readStatusObservers.mutationObservers.mutationObserver?.Observer?.disconnect();
           disconnect();
            }
            }
            window.read window.readStatusObservers =StatusObservers = setupReadStatusObserver();
        setupReadStatusObserver }, ();
        }, 500);
500);
        
        document.querySelector        
        document.querySelectorAll('.All('.dialog-item').forEach(el =>dialog-item').forEach(el => {
            {
            el.classList el.classList.remove('active');
.remove('active');
            if            if (el.dataset (el.dataset.chat.chatId === chatIdId === chatId) el) el.classList.add.classList.add('active');
        });
   ('active');
        });
    } finally } finally {
        {
        isOpeningChat = isOpeningChat = false;
 false;
    }
}

async    }
}

async function openSavedChat function openSavedChat(chat(chatId)Id) {
    if (isOpening {
    if (Chat || currentChatisOpening?.idChat || currentChat?.id === chat === chatId) return;
Id) return;
    is    isOpeningChatOpeningChat = true;
    
 = true;
    
    try    try {
        const messages {
        const messagesContainer =Container = document.getElementById document.getElementById('messages');
       ('messages');
        if (messagesContainer) messagesContainer.innerHTML = '<div class="loading-messages">Загрузка сообщений if (messagesContainer) messagesContainer.innerHTML = '<div class="loading-messages">Загрузка сообщений...</div>';
        
...</div>';
        
        current        currentChat =Chat = {
            id: {
            id: chatId chatId,
            type:,
            type: 's 'saved',
aved',
            other_user:            other_user: SAV SAVED_CHAT
ED_CHAT
        };
        };
        
               
        const chatTitle = const chatTitle = document.getElementById document.getElementById('chat('chat-title');
-title');
        if        if (chat (chatTitle) chatTitleTitle) chatTitle.innerHTML =.innerHTML = 'Избран 'Изное <spanбранное <span class=" class="saved-badgesaved-badge">⭐">⭐</span>';
        
        const chat</span>';
        
        const chatStatus = document.querySelector('.chat-statusStatus = document.querySelector('.chat-status');
       ');
        if (chatStatus if (chatStatus) {
) {
            chat            chatStatus.textContent =Status.textContent = 'лич 'личное';
            chatное';
            chatStatus.classStatus.className =Name = 'chat-status status 'chat-status status-offline-offline';
       ';
        }
        
 }
        
        const messageInput        const messageInput = document = document.getElementById('message-input.getElementById('message-input');
       ');
        const sendButton = const sendButton = document.getElementById('btn document.getElementById('btn-send-msg-send-msg');
       ');
        const input const inputZone = document.querySelectorZone = document.querySelector('.input-zone');
        const clear('.input-zone');
        const clearChatBtnChatBtn = document = document.getElementById('clear-ch.getElementById('clear-chat-btn');
        
        ifat-btn');
        
        if (input (inputZone)Zone) inputZone.style.display inputZone.style.display = ' = 'block';
block';
        if        if (message (messageInput)Input) {
            messageInput {
            messageInput.disabled = false;
           .disabled messageInput = false;
           .placeholder messageInput = 'Сохра.placeholderнить сооб = 'Сохращение...нить сообщение...';
            setTimeout(()';
            setTimeout(() => message => messageInput.focus(),Input.focus(), 100 100);
       );
        }
        if ( }
        if (sendButton) sendButton.dissendButton) sendButton.disabled =abled = false;
 false;
        if (clear        if (clearChatBtn) clearChatBtnChatBtn) clearChatBtn.style.display.style.display = ' = 'none';
        
       none';
        
        await load await loadMessages(chatIdMessages(chatId, true, true);
       );
        subscribeToMessages( subscribeToMessages(chatId);
        
        documentchatId);
        
        document.querySelectorAll.querySelectorAll('.dialog('.dialog-item').-item').forEach(elforEach(el => {
 => {
            el            el.classList.remove('active');
            if (el.dataset.ch.classList.remove('active');
            if (el.dataset.chatIdatId === chatId) === chatId) el.classList el.classList.add('.add('active');
        });
active');
        });
    } finally {
        is    } finally {
OpeningChat        is = false;
   OpeningChat = false;
    }
}

 }
}

// ---// --- Отправ Отправка сообка сообщения ---щения ---
async
async function send function sendMsg()Msg() {
    {
    const input const input = document = document.getElementById('.getElementById('message-inputmessage-input');
   ');
    if (!input) if (! return;
    
   input) return;
 const text    
    const text = input = input.value.trim.value.trim();
   ();
    if (!text || if (! !currenttext ||User || !currentUser || !current !currentChat)Chat) {
 {
        if        if (!current (!currentChat)Chat) showToast showToast('Вы('Выберитеберите чат чат', true', true);
        return;
    }
);
        return;
    
       }
 if (    
    if (currentChat.othercurrentChat.other_user?._user?.id ===id === BOT BOT_USER_ID) {
_USER_ID)        show {
        showToast('Toast('Нельзя отправлятьНельзя отправлять сообщения сообщения боту', true боту', true);
       );
        return;
 return;
    }
    
       }
    
    const originalText = text;
 const originalText = text;
    input    input.value =.value = '';
    
    const '';
    
    const tempId = `temp- tempId = `temp-${Date${Date.now()}-${.now()}-${Math.randomMath.random()}`;
   ()}`;
    const temp const tempMessage =Message = {
        id: {
        id: tempId,
        text: tempId,
        text: text,
        user text,
        user_id: currentUser_id: currentUser.id,
.id,
        chat        chat_id: currentChat_id: currentChat.id,
.id,
        created_at:        created_at: new Date new Date().toISOString().to(),
       ISOString(),
        is_read: currentChat.id is_read: currentChat.id === S === SAVEDAVED_CHAT_ID,
_CHAT_ID,
        is        is_sending: true_sending: true,
       ,
        profiles: profiles: currentProfile
    currentProfile
    };
    
 };
    
    render    renderMessage(tempMessage, true);
Message(tempMessage, true);
    
    const send    
    const sendButton =Button = document.getElementById('btn document.getElementById('btn-send-send-msg-msg');
    if (');
    if (sendButton) sendButton.disabled = true;
    
   sendButton) sendButton.disabled = true;
    
    try {
        const try {
        const { data { data, error, error } = } = await _ await _supabasesupabase
           
            .from .from('messages('messages')
            .insert')
            .insert([{([{ 
                
                text, 
                text, 
                user_id user_id: current: currentUserUser.id,
               .id,
                chat_id chat_id: current: currentChat.id,
                is_readChat.id,
                is_read: current: currentChat.idChat.id === S === SAVEDAVED_CHAT_CHAT_ID,
_ID,
                created                created_at: new Date_at:().to new Date().toISOStringISOString()
            }])
()
            }])
            .            .select()
select()
            .            .single();
single();
        
               
        if ( if (error) throw error;
        
error) throw error;
        
        const tempMsg        const tempMsgElement =Element = document.querySelector(`. document.querySelector(`.messagemessage[data-id[data-id="${tempId}="${tempId}"]`);
"]`);
        if        if (tempMsgElement (tempMsgElement) temp) tempMsgElementMsgElement.remove();
.remove();
        
               
        renderMessage renderMessage({ ...data, profiles:({ ...data, profiles: currentProfile currentProfile }, true }, true);
        
        await);
        
        await _sup _supabase
abase
            .            .from('from('chatschats')
            .update')
            .update({ updated({ updated_at_at:: new Date().to new Date().toISOStringISOString() })
            .() })
            .eq('eq('id', currentChatid', currentChat.id);
.id);
        
        loadDial        
       ogs();
 loadDialogs();
    }    } catch (error) catch (error {
       ) {
        input.value input.value = originalText;
 = originalText;
        show        showToast('ОToast('Ошибшибка отправка отправки:ки: ' + (error ' + (error.message ||.message || 'Не 'Неизвестная ошибка'),известная ошиб true);
ка'), true);
        const tempMsg        const tempMsgElement =Element = document.querySelector document.querySelector(`.message(`.message[data-id="${tempId}[data-id="${tempId}"]`);
        if"]`);
        if (tempMsgElement (tempMsgElement) temp) tempMsgElementMsgElement.remove.remove();
();
    } finally {
    } finally {
        if (send        if (sendButton)Button) sendButton.disabled sendButton.disabled = false;
        = false input.focus();
;
           }
 input.focus();
}

//    }
}

// --- Эмод --- Эмодзи пизи пикер ---
кер ---
const emconst emojiBtnojiBtn = document = document.getElementById('btn-.getElementById('btn-emojiemoji');
const emoji');
const emojiPicker =Picker = document.getElementById('emo document.getElementById('emoji-pji-picker');
icker');
if (if (emojiemojiBtn &&Btn && emoji emojiPicker) {
   Picker) {
    emojiBtn.on emojiBtn.onclick = (eclick = (e) =>) => {
        e.stop {
       Propagation e.stopPropagation();
        const is();
       Visible = const isVisible = emojiPicker.style emojiPicker.style.display ===.display === 'flex 'flex';
       ';
        emoji emojiPicker.style.display =Picker.style.display = isVisible ? 'none' isVisible : ' ? 'none'flex';
 : 'flex';
    };
    
       };
    
    document.querySelector document.querySelectorAll('.emojiAll('.emoji-item').-item').forEach(forEach(emoji => {
emoji => {
        em        emoji.onoji.onclick =click = () => {
            () => {
            const input const input = document.getElementById = document.getElementById('('message-inputmessage-input');
           ');
            if (input) if (input) {
                {
                const start = input.selectionStart;
 const start = input.selectionStart;
                const end =                const end = input.se input.selectionEndlectionEnd;
                const em;
                const emojiTextojiText = em = emoji.textContent;
                inputoji.textContent;
.value =                input.value = input.value.slice( input.value.slice(0, start) + emojiText + input.value.slice0, start) + emojiText + input.value.slice(end);
                input(end);
                input.setSelection.setSelectionRange(startRange(start + em + emojiText.length, start +ojiText.length, start + emojiText.length emojiText.length);
               );
                input.focus();
 input.focus();
            }
            }
            em            emojiPicker.style.displayojiPicker.style.display = ' = 'none';
none';
        };
        };
    });
    });
    
       
    document.addEventListener('click document.addEventListener('click', (', (e)e) => {
 => {
        if (!emo        if (!emojiPicker.contains(ejiPicker.contains(e.target).target) && e && e.target !==.target !== emoji emojiBtn)Btn) {
            em {
            emojiojiPicker.stylePicker.style.display =.display = 'none';
        'none';
        }
    }
    });
}

// --- });
}

// --- От Отправкаправка по Enter по Enter ---
 ---
const sendButton =const sendButton = document.getElementById document.getElementById('btn-send('btn-send-msg-msg');
if');
if (sendButton) (sendButton) sendButton sendButton.onclick.onclick = sendMsg;

 = sendMsg;

const messageconst messageInputField = document.getElementById('InputField = document.getElementById('message-inputmessage-input');
if (message');
if (messageInputFieldInputField) {
) {
       messageInputField messageInputField.addEventListener('.addEventListener('keypress', (e)keypress', (e) => {
 => {
        if (e        if (e.key ===.key === 'Enter' && 'Enter !e' && !e.shiftKey).shift {
           Key) {
            e.preventDefault e.preventDefault();
           ();
            sendMsg sendMsg();
       ();
        }
    }
    });
}

// --- });
}

// --- DVH DVH фикс фикс ---
 ---
function updatefunction updateDvhDvh() {
() {
    document    document.documentElement.style.document.setProperty('--Element.styledvh.setProperty('--', `${window.innerdvhHeight}', `${window.innerpx`);
}
windowHeight}.addEventListener('px`);
}
window.addEventListener('resizeresize', update', updateDvh);
updateDvh);
updateDvh();

//Dvh();

// --- Ав --- Автозатозапуск ---
(async () => {
пуск ---
(async () => {
       const { data const { data: {: { session } } = session } } = await _ await _supabasesupabase.auth.getSession();
    
   .auth.getSession();
 if (session)    
    {
        if (session) currentUser {
        currentUser = session = session.user.user;
;
        
        const {        
        const { data: p } data: p } = await = await _supabase
 _supabase
            .from('            .from('profilesprofiles')
            .select')
            .select('*('*')
            .eq')
            .eq('id('id', currentUser.id', currentUser.id)
           )
            .maybe .maybeSingle();
        
       Single();
        
        if (!p) {
 if (!p) {
                       const email const email = current = currentUser.email;
            let usernameUser.email;
            let username = email = email ? ? email.split(' email.split('@@')[0] : '')[0] : 'user';
            usernameuser';
 = username.replace(/            username = username.replace(/@l@lumina\.umina\.local$local$/, '');
            const/, '');
            const { { data: newProfile } = data: newProfile } = await _supabase await _supabase
               
                .from('prof .from('profiles')
                .iles')
                .insert({
                    id:insert({
                    id: currentUser.id,
 currentUser.id,
                    username: username,
                    full_name:                    username: username,
                    full_name: username,
 username,
                    last                    last_seen: new_seen: new Date(). Date().toISOString(),
toISOString(),
                    is                    is_online_online: true: true
               
                })
                })
                .select()
                .select()
                .maybe .maybeSingle();
Single();
            currentProfile =            currentProfile = newProfile newProfile;
        } else;
        } else {
            {
            currentProfile currentProfile = p;
        = p;
        }
        
 }
        
        if (current        if (currentProfile)Profile) {
            document.getElementById {
            document.getElementById('current('current-user-b-user-badge').adge').textContenttext = currentContent = currentProfileProfile.full_name;
            updateProfileFooter.full_name;
            updateProfileFooter();
            initProfileFooter();
();
            initProfile        }
Footer();
        
        await load        }
AllUsers        
        await load();
        await ensureAllUsers();
        await ensureBotChatBotChat();
        await ensure();
        await ensureSavedChatSavedChat();
        
();
        
        showScreen('        showScreen('chat');
chat');
        await        await loadDialogs();
        
        loadDialogs();
        
        document.getElementById('chat-title'). document.getElementById('chat-title').textContenttextContent = 'Lumina = 'Lumina Lite';
 Lite';
        document        document.querySelector('.chat-status.querySelector('.chat-status').textContent = 'выберите').textContent = 'выберите диал диалог';
ог';
        const inputZone        const inputZone = document = document.querySelector('..querySelector('.input-zone');
input-zone');
        if        if (inputZone) (inputZone) inputZone inputZone.style.display.style.display = 'none';
 = 'none';
        
               
        document.getElementById('messages document.getElementById('messages').innerHTML =').inner `
            <divHTML = class=" `
            <div class="msg-stmsg-stubub">
                <">
                <svg widthsvg width="="48" height48" height="48" style="48" style="margin-bottom:="margin-bottom: 16px; 16px; opacity: 0 opacity: 0.3.3;"><use;"><use href="#icon-ch href="#icon-chat"/at"/></svg>
               ></svg>
                <p <p>Вы>Выберите диалберите диалог, чтобы начаог, чтобы начать общение</ть общение</p>
p>
            </div>
            </div>
        `        `;
        
;
        
        currentChat =        currentChat = null;
        start null;
        startOnlineHeartbeat();
OnlineHeartbeat();
    }    } else {
        show else {
        showScreen('Screen('reg');
reg');
    }
})();
    }
})();
