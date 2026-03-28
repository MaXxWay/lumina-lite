const SUPABASE_URL = 'https://ofxvazqurjgnxxuozjlr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9meHZhenF1cmpnbnh4dW96amxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTg4ODEsImV4cCI6MjA5MDE5NDg4MX0.Zf2pwQNmxe9wBt7tlZed-ntnLPzm7JGOuqkLuBkv0GE';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let currentProfile = null;
let currentChat = null;
let realtimeChannel = null;
let allUsers = [];

// ID официального бота (фиксированный)
const BOT_USER_ID = '00000000-0000-0000-0000-000000000000';
const BOT_PROFILE = {
    id: BOT_USER_ID,
    username: 'lumina_bot',
    full_name: 'Lumina Bot',
    bio: 'Официальный бот мессенджера Lumina Lite',
    is_bot: true
};

const getEmail = (u) => `${u.toLowerCase().trim().replace(/^@/, '')}@lumina.local`;

// Показываем/скрываем индикатор загрузки
const loadingOverlay = document.getElementById('loading-overlay');

function showLoading(show) {
    if (loadingOverlay) {
        if (show) {
            loadingOverlay.classList.remove('hidden');
        } else {
            loadingOverlay.classList.add('hidden');
        }
    }
}

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
                full_name: name || user
            });
            showToast('Аккаунт создан! Войдите.');
            setTimeout(() => showScreen('login'), 1000);
        }
    };
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
        
        const { data: p, error: profileError } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).single();
        if (profileError) {
            console.error('Ошибка загрузки профиля:', profileError);
        }
        currentProfile = p;
        
        if (p) {
            const badge = document.getElementById('current-user-badge');
            if (badge) badge.textContent = p.full_name;
        }
        
        await loadAllUsers();
        await ensureBotChat();
        
        showScreen('chat');
        await loadDialogs();
        
        // НЕ открываем чат с ботом автоматически
        const chatTitle = document.getElementById('chat-title');
        if (chatTitle) chatTitle.textContent = 'Lumina Lite';
        
        const chatStatus = document.querySelector('.chat-status');
        if (chatStatus) chatStatus.textContent = 'выберите диалог';
        
        // Скрываем поле ввода
        const inputZone = document.querySelector('.input-zone');
        if (inputZone) inputZone.style.display = 'none';
        
        // Очищаем сообщения
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="msg-stub">
                    <svg width="48" height="48" style="margin-bottom: 16px; opacity: 0.3;"><use href="#icon-chat"/></svg>
                    <p>Выберите диалог, чтобы начать общение</p>
                </div>
            `;
        }
        
        // Сбрасываем currentChat
        currentChat = null;
    };
}

// ─── Создание чата с ботом ───────────────────────────────
async function ensureBotChat() {
    try {
        const { data: existing, error: findError } = await _supabase
            .from('chats')
            .select('id')
            .eq('type', 'private')
            .contains('participants', [currentUser.id, BOT_USER_ID])
            .maybeSingle();
        
        if (findError) {
            console.error('Ошибка поиска чата с ботом:', findError);
            return;
        }
        
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
                    is_system: true
                });
            }
            return;
        }
        
        const { data: newChat, error: createError } = await _supabase
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
        
        if (newChat && !createError) {
            await _supabase.from('messages').insert({
                text: 'Добро пожаловать в мессенджер Lumina Lite! Начните общение прямо сейчас!',
                user_id: BOT_USER_ID,
                chat_id: newChat.id,
                is_welcome: true,
                is_system: true
            });
        }
    } catch (err) {
        console.error('Ошибка в ensureBotChat:', err);
    }
}

// ─── Загрузка всех пользователей ─────────────────────────
async function loadAllUsers() {
    try {
        const { data, error } = await _supabase
            .from('profiles')
            .select('id, username, full_name')
            .neq('id', currentUser.id);
        
        if (error) throw error;
        allUsers = data || [];
    } catch (err) {
        console.error('Ошибка загрузки пользователей:', err);
        allUsers = [];
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
        
        const { data: newChat, error } = await _supabase
            .from('chats')
            .insert({
                type: 'private',
                participants: [currentUser.id, otherUserId],
                created_at: new Date().toISOString()
            })
            .select()
            .single();
        
        if (error) throw error;
        return newChat.id;
    } catch (err) {
        console.error('Ошибка создания чата:', err);
        throw err;
    }
}

// ─── Загрузка диалогов ────────────────────────────────────
async function loadDialogs(searchTerm = '') {
    const container = document.getElementById('dialogs-list');
    if (!container) return;
    
    container.innerHTML = '<div class="dialogs-loading">Загрузка диалогов...</div>';
    
    try {
        const { data: chats, error } = await _supabase
            .from('chats')
            .select('*')
            .contains('participants', [currentUser.id])
            .order('updated_at', { ascending: false });
        
        if (error) throw error;
        
        // Получаем профили участников
        const allParticipantIds = chats ? chats.flatMap(c => c.participants) : [];
        const profileMap = new Map();
        
        if (allParticipantIds.length > 0) {
            const { data: profiles } = await _supabase
                .from('profiles')
                .select('id, full_name, username')
                .in('id', allParticipantIds);
            
            if (profiles) {
                profiles.forEach(p => profileMap.set(p.id, p));
            }
        }
        profileMap.set(BOT_USER_ID, BOT_PROFILE);
        
        container.innerHTML = '';
        
        if (!chats || chats.length === 0) {
            container.innerHTML = '<div class="dialogs-loading">Нет диалогов</div>';
        } else {
            let filteredChats = chats;
            if (searchTerm) {
                filteredChats = chats.filter(chat => {
                    const otherId = chat.participants.find(id => id !== currentUser.id);
                    const otherUser = profileMap.get(otherId);
                    const name = (otherUser?.full_name || otherUser?.username || '').toLowerCase();
                    return name.includes(searchTerm.toLowerCase());
                });
            }
            
            if (filteredChats.length === 0) {
                container.innerHTML = '<div class="dialogs-loading">Ничего не найдено</div>';
            } else {
                filteredChats.forEach(chat => {
                    const otherId = chat.participants.find(id => id !== currentUser.id);
                    const otherUser = profileMap.get(otherId);
                    const name = otherUser?.full_name || otherUser?.username || 'Пользователь';
                    const isBot = otherId === BOT_USER_ID;
                    
                    const div = document.createElement('div');
                    div.className = `dialog-item ${currentChat?.id === chat.id ? 'active' : ''}`;
                    div.dataset.chatId = chat.id;
                    div.dataset.otherUserId = otherId;
                    div.innerHTML = `
                        <div class="dialog-avatar ${isBot ? 'bot-avatar' : ''}">
                            ${isBot ? '<img src="lumina.svg" alt="Bot" width="32" height="32">' : `<div class="avatar-letter">${escapeHtml(name.charAt(0))}</div>`}
                            ${isBot ? '<div class="verified-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' : ''}
                        </div>
                        <div class="dialog-info">
                            <div class="dialog-name">
                                ${escapeHtml(name)}
                                ${isBot ? '<span class="bot-badge">Бот</span>' : ''}
                            </div>
                            <div class="dialog-preview">${chat.last_message ? escapeHtml(chat.last_message) : 'Нет сообщений'}</div>
                        </div>
                    `;
                    div.onclick = () => openChat(chat.id, otherId, otherUser);
                    container.appendChild(div);
                });
            }
        }
    } catch (err) {
        console.error('Ошибка загрузки диалогов:', err);
        container.innerHTML = '<div class="dialogs-loading">Ошибка загрузки диалогов</div>';
    }
}

// ─── Поиск диалогов ──────────────────────────────────────
const searchInput = document.getElementById('search-dialogs');
if (searchInput) {
    searchInput.oninput = (e) => {
        loadDialogs(e.target.value);
    };
}

// ─── Диалог выбора пользователя ──────────────────────────
function showNewChatDialog() {
    const availableUsers = allUsers.filter(u => u.id !== BOT_USER_ID);
    
    if (availableUsers.length === 0) {
        showToast('Нет других пользователей', true);
        return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content glass-card">
            <h3>Выберите собеседника</h3>
            <div class="modal-search">
                <svg width="18" height="18"><use href="#icon-search"/></svg>
                <input type="text" id="modal-search-input" placeholder="Поиск...">
            </div>
            <div id="users-list" style="max-height:300px;overflow-y:auto;">
                ${availableUsers.map(user => `
                    <div class="user-select-item" data-id="${user.id}" data-name="${escapeHtml(user.full_name || user.username)}">
                        ${escapeHtml(user.full_name || user.username)}
                    </div>
                `).join('')}
            </div>
            <button class="close-modal-btn">Отмена</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const searchInputModal = modal.querySelector('#modal-search-input');
    if (searchInputModal) {
        searchInputModal.oninput = (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const items = modal.querySelectorAll('.user-select-item');
            items.forEach(item => {
                const name = item.dataset.name.toLowerCase();
                item.style.display = name.includes(searchTerm) ? 'block' : 'none';
            });
        };
    }
    
    modal.querySelectorAll('.user-select-item').forEach(el => {
        el.onclick = async () => {
            const userId = el.dataset.id;
            modal.remove();
            try {
                const chatId = await getOrCreatePrivateChat(userId);
                const otherUser = availableUsers.find(u => u.id === userId);
                await openChat(chatId, userId, otherUser);
            } catch (err) {
                showToast('Ошибка создания чата', true);
            }
        };
    });
    
    modal.querySelector('.close-modal-btn').onclick = () => modal.remove();
}

// ─── Открыть чат ─────────────────────────────────────────
async function openChat(chatId, otherUserId, otherUser) {
    const isBot = otherUserId === BOT_USER_ID;
    
    currentChat = {
        id: chatId,
        type: 'private',
        other_user: otherUser || (isBot ? BOT_PROFILE : null)
    };
    
    const chatTitle = document.getElementById('chat-title');
    if (chatTitle) {
        const name = otherUser?.full_name || otherUser?.username || (isBot ? 'Lumina Bot' : 'Чат');
        chatTitle.innerHTML = `${escapeHtml(name)} ${isBot ? '<span class="bot-badge" style="font-size:10px;margin-left:8px;">Бот</span>' : ''}`;
    }
    
    const chatStatus = document.querySelector('.chat-status');
    if (chatStatus) {
        chatStatus.textContent = isBot ? 'бот' : 'онлайн';
    }
    
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('btn-send-msg');
    const inputZone = document.querySelector('.input-zone');
    
    if (isBot) {
        if (inputZone) inputZone.style.display = 'none';
        if (messageInput) messageInput.disabled = true;
        if (sendButton) sendButton.disabled = true;
    } else {
        if (inputZone) inputZone.style.display = 'flex';
        if (messageInput) {
            messageInput.disabled = false;
            messageInput.placeholder = 'Написать сообщение...';
        }
        if (sendButton) sendButton.disabled = false;
    }
    
    await loadMessages(chatId);
    subscribeToMessages(chatId);
    
    document.querySelectorAll('.dialog-item').forEach(el => {
        el.classList.remove('active');
        if (el.dataset.chatId === chatId) {
            el.classList.add('active');
        }
    });
}

// ─── Загрузка сообщений ─────────────────────────────────
async function loadMessages(chatId) {
    const container = document.getElementById('messages');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-messages">Загрузка сообщений...</div>';
    
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
            
            if (profiles) {
                profiles.forEach(p => profilesMap.set(p.id, p));
            }
        }
        profilesMap.set(BOT_USER_ID, BOT_PROFILE);
        
        container.innerHTML = '';
        
        if (msgs && msgs.length > 0) {
            msgs.forEach(msg => {
                const profile = profilesMap.get(msg.user_id);
                renderMessage({ ...msg, profiles: profile });
            });
        } else {
            container.innerHTML = '<div class="msg-stub">Начните переписку</div>';
        }
        
        container.scrollTop = container.scrollHeight;
    } catch (err) {
        console.error('Ошибка загрузки сообщений:', err);
        container.innerHTML = '<div class="loading-messages">Ошибка загрузки сообщений</div>';
    }
}

// ─── Подписка на новые сообщения ─────────────────────────
function subscribeToMessages(chatId) {
    if (realtimeChannel) {
        _supabase.removeChannel(realtimeChannel);
    }
    
    realtimeChannel = _supabase
        .channel(`chat-${chatId}`)
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, 
            async (payload) => {
                if (document.querySelector(`[data-id="${payload.new.id}"]`)) return;
                
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
                
                renderMessage({ ...payload.new, profiles: profile });
                loadDialogs(document.getElementById('search-dialogs')?.value || '');
            }
        )
        .subscribe();
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
    
    if (msg.profiles && msg.profiles.full_name) {
        name = msg.profiles.full_name;
    } else if (isOwn && currentProfile && currentProfile.full_name) {
        name = currentProfile.full_name;
    } else if (isBot) {
        name = 'Lumina Bot';
    }
    
    const timeStr = new Date(msg.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
    
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'own' : 'other'} ${isBot ? 'bot-message' : ''}`;
    div.dataset.id = msg.id;
    div.innerHTML = `
        <div class="msg-avatar ${isBot ? 'bot-avatar' : ''}">
            ${isBot ? '<img src="lumina.svg" alt="Bot" width="28" height="28">' : `<div class="avatar-letter">${escapeHtml(name.charAt(0))}</div>`}
            ${isBot ? '<div class="verified-badge-small"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' : ''}
        </div>
        <div class="msg-bubble">
            ${!isOwn ? `<div class="msg-sender">${escapeHtml(name)} ${isBot ? '<span class="bot-badge-small">Бот</span>' : ''}</div>` : ''}
            <div class="text">${escapeHtml(msg.text)}</div>
            <div class="msg-time">${timeStr}</div>
        </div>
    `;
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ─── Отправка сообщения ─────────────────────────────────
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
    
    input.value = '';
    
    const { data, error } = await _supabase
        .from('messages')
        .insert([{ 
            text, 
            user_id: currentUser.id,
            chat_id: currentChat.id
        }])
        .select()
        .single();
    
    if (error) {
        console.error('Ошибка отправки:', error);
        showToast('Ошибка отправки: ' + error.message, true);
        input.value = text;
    } else {
        const msgWithProfile = { ...data, profiles: currentProfile };
        renderMessage(msgWithProfile);
        
        await _supabase
            .from('chats')
            .update({ 
                updated_at: new Date().toISOString(),
                last_message: text.slice(0, 50)
            })
            .eq('id', currentChat.id);
        
        loadDialogs(document.getElementById('search-dialogs')?.value || '');
    }
}

// ─── Выход ───────────────────────────────────────────────
const logoutBtn = document.getElementById('btn-logout');
if (logoutBtn) {
    logoutBtn.onclick = async () => {
        if (realtimeChannel) await _supabase.removeChannel(realtimeChannel);
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

const profileBackBtn = document.getElementById('btn-profile-back');
if (profileBackBtn) profileBackBtn.onclick = () => showScreen('chat');

const profileLogoutBtn = document.getElementById('btn-logout-profile');
if (profileLogoutBtn) {
    profileLogoutBtn.onclick = async () => {
        if (realtimeChannel) await _supabase.removeChannel(realtimeChannel);
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
        
        const badge = document.getElementById('current-user-badge');
        if (badge) badge.textContent = full_name;
        
        const avatarLetter = document.getElementById('profile-avatar-letter');
        if (avatarLetter) avatarLetter.textContent = full_name[0].toUpperCase();
        
        showToast('Профиль сохранён ✓');
        setTimeout(() => showScreen('chat'), 800);
    };
}

// ─── Кнопка отправки и Enter ────────────────────────────
const sendButton = document.getElementById('btn-send-msg');
if (sendButton) sendButton.onclick = sendMsg;

const messageInputElem = document.getElementById('message-input');
if (messageInputElem) {
    messageInputElem.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMsg();
        }
    });
}

// ─── DVH фикс ────────────────────────────────────────────
function updateDvh() {
    document.documentElement.style.setProperty('--dvh', `${window.innerHeight}px`);
}
window.addEventListener('resize', updateDvh);
updateDvh();

// ─── Запуск с индикатором загрузки ───────────────────────
(async () => {
    showLoading(true);
    
    try {
        const { data: { session } } = await _supabase.auth.getSession();
        
        if (session) {
            currentUser = session.user;
            const { data: p } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).single();
            currentProfile = p;
            if (p) {
                const badge = document.getElementById('current-user-badge');
                if (badge) badge.textContent = p.full_name;
            }
            await loadAllUsers();
            await ensureBotChat();
            
            showLoading(false);
            showScreen('chat');
            await loadDialogs();
            
            // НЕ открываем чат с ботом автоматически
            const chatTitle = document.getElementById('chat-title');
            if (chatTitle) chatTitle.textContent = 'Lumina Lite';
            
            const chatStatus = document.querySelector('.chat-status');
            if (chatStatus) chatStatus.textContent = 'выберите диалог';
            
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
        } else {
            showLoading(false);
            showScreen('reg');
        }
    } catch (err) {
        console.error('Ошибка при инициализации:', err);
        showLoading(false);
        showScreen('reg');
    }
})();
