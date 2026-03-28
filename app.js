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
    if (!loadingOverlay) return;
    
    if (show) {
        loadingOverlay.classList.remove('hidden');
        setTimeout(() => {
            loadingOverlay.style.opacity = '1';
        }, 10);
    } else {
        loadingOverlay.classList.add('hidden');
        setTimeout(() => {
            loadingOverlay.style.opacity = '0';
        }, 10);
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
            if (realtimeChannel) await _supabase.removeChannel(realtimeChannel);
            await _supabase.auth.signOut();
            currentUser = null;
            currentProfile = null;
            currentChat = null;
            showScreen('reg');
        };
    }
}

// ─── Подсчет непрочитанных сообщений для чата ────────────
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
        console.error('Ошибка подсчета непрочитанных:', err);
        return 0;
    }
}

// ─── Получение последнего сообщения в чате ───────────────
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
        console.error('Ошибка получения последнего сообщения:', err);
        return null;
    }
}

// ─── Отметить сообщения как прочитанные ──────────────────
let messagesCache = new Map();

async function markChatMessagesAsRead(chatId) {
    if (!chatId) return;
    
    try {
        const { error } = await _supabase
            .from('messages')
            .update({ is_read: true })
            .eq('chat_id', chatId)
            .neq('user_id', currentUser.id)
            .eq('is_read', false);
        
        if (error) throw error;
        
        const dialogItem = document.querySelector(`.dialog-item[data-chat-id="${chatId}"]`);
        if (dialogItem) {
            const badge = dialogItem.querySelector('.unread-badge-count');
            if (badge) badge.remove();
            dialogItem.classList.remove('unread-dialog');
        }
        
        if (messagesCache.has(chatId)) {
            const cachedMessages = messagesCache.get(chatId);
            cachedMessages.forEach(msg => {
                if (msg.user_id !== currentUser.id) {
                    msg.is_read = true;
                }
            });
            messagesCache.set(chatId, cachedMessages);
        }
    } catch (err) {
        console.error('Ошибка отметки сообщений как прочитанных:', err);
    }
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
                .select('id, is_read')
                .eq('chat_id', existing.id)
                .eq('is_welcome', true)
                .maybeSingle();
            
            if (!welcomeMsg) {
                await _supabase.from('messages').insert({
                    text: 'Добро пожаловать в мессенджер Lumina Lite! Нажмите на мой диалог, чтобы начать общение!',
                    user_id: BOT_USER_ID,
                    chat_id: existing.id,
                    is_welcome: true,
                    is_system: true,
                    is_read: false
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
                text: 'Добро пожаловать в мессенджер Lumina Lite! Нажмите на мой диалог, чтобы начать общение!',
                user_id: BOT_USER_ID,
                chat_id: newChat.id,
                is_welcome: true,
                is_system: true,
                is_read: false
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

// ─── Поиск пользователей по юзернейму ────────────────────
async function searchUsersByUsername(username) {
    if (!username || username.length < 1) return [];
    
    let cleanUsername = username;
    if (cleanUsername.startsWith('@')) {
        cleanUsername = cleanUsername.substring(1);
    }
    
    try {
        const { data, error } = await _supabase
            .from('profiles')
            .select('id, username, full_name')
            .ilike('username', `%${cleanUsername}%`)
            .neq('id', currentUser.id)
            .limit(10);
        
        if (error) {
            console.error('Ошибка Supabase:', error);
            return [];
        }
        
        return data || [];
    } catch (err) {
        console.error('Ошибка поиска пользователей:', err);
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

// ─── Статус пользователя ─────────────────────────────────
let lastActivityUpdate = 0;

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
    } catch (err) {
        console.error('Ошибка обновления last_seen:', err);
    }
}

function getUserStatus(lastSeen) {
    if (!lastSeen) return { text: 'неизвестно', class: 'status-offline', isOnline: false };
    
    const lastSeenDate = new Date(lastSeen);
    const now = new Date();
    const diffMs = now - lastSeenDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 5) {
        return { text: 'онлайн', class: 'status-online', isOnline: true };
    }
    
    let text = '';
    if (diffMins < 60) {
        text = `был(а) ${diffMins} мин. назад`;
    } else if (diffHours < 24) {
        text = `был(а) ${diffHours} ч. назад`;
    } else if (diffDays === 1) {
        text = `был(а) вчера в ${lastSeenDate.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
        text = `был(а) ${diffDays} дн. назад`;
    }
    
    return { text, class: 'status-offline', isOnline: false };
}

let statusSubscription = null;

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
                    updateChatStatus(payload.new.last_seen);
                }
            }
        )
        .subscribe();
}

function updateChatStatus(lastSeen) {
    const chatStatus = document.querySelector('.chat-status');
    if (!chatStatus) return;
    
    const isBot = currentChat?.other_user?.id === BOT_USER_ID;
    if (isBot) {
        chatStatus.textContent = 'бот';
        chatStatus.className = 'chat-status status-bot';
        return;
    }
    
    const status = getUserStatus(lastSeen);
    chatStatus.textContent = status.text;
    chatStatus.className = `chat-status ${status.class}`;
}

function trackUserActivity() {
    document.addEventListener('click', () => updateLastSeen());
    document.addEventListener('keypress', () => updateLastSeen());
    document.addEventListener('scroll', () => updateLastSeen());
    setInterval(() => updateLastSeen(), 30000);
    updateLastSeen();
}

// ─── Загрузка диалогов (без мигания) ─────────────────────
let isUpdatingDialogs = false;
let dialogCache = new Map();

async function loadDialogs(searchTerm = '') {
    const container = document.getElementById('dialogs-list');
    if (!container) return;
    
    const isUserSearch = searchTerm.startsWith('@');
    
    if (isUserSearch && searchTerm.length > 1) {
        const users = await searchUsersByUsername(searchTerm);
        
        container.innerHTML = `
            <div class="search-header">
                <span class="search-title">👥 Найдено пользователей: ${users.length}</span>
            </div>
        `;
        
        if (users.length === 0) {
            container.innerHTML += '<div class="dialogs-loading">Пользователи не найдены</div>';
        } else {
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
        return;
    }
    
    if (isUpdatingDialogs) return;
    isUpdatingDialogs = true;
    
    try {
        const { data: chats, error } = await _supabase
            .from('chats')
            .select('*')
            .contains('participants', [currentUser.id])
            .order('updated_at', { ascending: false });
        
        if (error) throw error;
        
        const allParticipantIds = chats ? chats.flatMap(c => c.participants) : [];
        const profileMap = new Map();
        
        if (allParticipantIds.length > 0) {
            const { data: profiles } = await _supabase
                .from('profiles')
                .select('id, full_name, username, last_seen')
                .in('id', allParticipantIds);
            
            if (profiles) {
                profiles.forEach(p => profileMap.set(p.id, p));
            }
        }
        profileMap.set(BOT_USER_ID, BOT_PROFILE);
        
        const chatData = await Promise.all((chats || []).map(async (chat) => {
            const otherId = chat.participants.find(id => id !== currentUser.id);
            const otherUser = profileMap.get(otherId);
            const name = otherUser?.full_name || otherUser?.username || 'Пользователь';
            const isBot = otherId === BOT_USER_ID;
            const unreadCount = await getUnreadCount(chat.id);
            const lastMessage = await getLastMessage(chat.id);
            const status = otherUser ? getUserStatus(otherUser.last_seen) : { text: '', class: '' };
            
            return {
                id: chat.id,
                otherId,
                otherUser,
                name,
                isBot,
                unreadCount,
                lastMessage: lastMessage || 'Нет сообщений',
                updatedAt: chat.updated_at,
                statusText: status.text,
                statusClass: status.class
            };
        }));
        
        chatData.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        
        let filteredData = chatData;
        if (searchTerm && !isUserSearch) {
            filteredData = chatData.filter(chat => 
                chat.name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        
        const newIds = filteredData.map(chat => chat.id).join(',');
        const oldIds = dialogCache.get('ids') || '';
        
        if (newIds !== oldIds) {
            container.innerHTML = '';
            dialogCache.set('ids', newIds);
            
            if (filteredData.length === 0) {
                container.innerHTML = '<div class="dialogs-loading">Нет диалогов. Введите @username для поиска пользователей</div>';
            } else {
                filteredData.forEach(chat => {
                    const div = document.createElement('div');
                    div.className = `dialog-item ${currentChat?.id === chat.id ? 'active' : ''} ${chat.unreadCount > 0 ? 'unread-dialog' : ''}`;
                    div.dataset.chatId = chat.id;
                    div.dataset.otherUserId = chat.otherId;
                    div.innerHTML = `
                        <div class="dialog-avatar ${chat.isBot ? 'bot-avatar' : ''}">
                            ${chat.isBot ? '<img src="lumina.svg" alt="Bot" width="32" height="32">' : `<div class="avatar-letter">${escapeHtml(chat.name.charAt(0))}</div>`}
                            ${chat.isBot ? '<div class="verified-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' : ''}
                        </div>
                        <div class="dialog-info">
                            <div class="dialog-name">
                                ${escapeHtml(chat.name)}
                                ${chat.isBot ? '<span class="bot-badge">Бот</span>' : ''}
                                ${chat.unreadCount > 0 ? `<span class="unread-badge-count">${chat.unreadCount}</span>` : ''}
                            </div>
                            <div class="dialog-preview">${escapeHtml(chat.lastMessage)}</div>
                            ${!chat.isBot && chat.statusText ? `<div class="dialog-status ${chat.statusClass === 'status-online' ? 'dialog-status-online' : 'dialog-status-offline'}">${chat.statusText}</div>` : ''}
                        </div>
                    `;
                    div.onclick = async () => {
                        await openChat(chat.id, chat.otherId, chat.otherUser);
                        if (chat.unreadCount > 0) {
                            await markChatMessagesAsRead(chat.id);
                            const badge = div.querySelector('.unread-badge-count');
                            if (badge) badge.remove();
                            div.classList.remove('unread-dialog');
                        }
                    };
                    container.appendChild(div);
                });
            }
        }
    } catch (err) {
        console.error('Ошибка загрузки диалогов:', err);
        if (container.children.length === 0) {
            container.innerHTML = '<div class="dialogs-loading">Ошибка загрузки диалогов</div>';
        }
    } finally {
        isUpdatingDialogs = false;
    }
}

// ─── Поиск диалогов и пользователей ──────────────────────
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

// ─── Вход ────────────────────────────────────────────────
const loginBtn = document.getElementById('btn-do-login');
if (loginBtn) {
    loginBtn.onclick = async () => {
        const user = document.getElementById('login-username').value.trim();
        const pass = document.getElementById('login-password').value.trim();
        const { data, error } = await _supabase.auth.signInWithPassword({ email: getEmail(user), password: pass });
        if (error) return showToast('Ошибка входа: ' + error.message, true);

        currentUser = data.user;
        
        const { data: p, error: profileError } = await _supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .maybeSingle();
        
        if (profileError) {
            console.error('Ошибка загрузки профиля:', profileError);
        }
        
        if (!p) {
            const username = user.replace(/^@/, '');
            const { data: newProfile, error: insertError } = await _supabase
                .from('profiles')
                .insert({
                    id: currentUser.id,
                    username: username,
                    full_name: username,
                    last_seen: new Date().toISOString()
                })
                .select()
                .maybeSingle();
            
            if (insertError) {
                console.error('Ошибка создания профиля:', insertError);
            }
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
        trackUserActivity();
    };
}

// ─── Открыть чат ─────────────────────────────────────────
let isOpeningChat = false;

async function openChat(chatId, otherUserId, otherUser) {
    if (isOpeningChat) return;
    if (currentChat?.id === chatId) return;
    
    isOpeningChat = true;
    
    try {
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
        
        if (!isBot && otherUserId) {
            const { data: profile } = await _supabase
                .from('profiles')
                .select('last_seen')
                .eq('id', otherUserId)
                .maybeSingle();
            
            if (profile) {
                updateChatStatus(profile.last_seen);
                subscribeToUserStatus(otherUserId);
            } else {
                const chatStatus = document.querySelector('.chat-status');
                if (chatStatus) {
                    chatStatus.textContent = 'неизвестно';
                    chatStatus.className = 'chat-status status-offline';
                }
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
    } finally {
        isOpeningChat = false;
    }
}

// ─── Загрузка сообщений ─────────────────────────────────
let isLoadingMessages = false;

async function loadMessages(chatId) {
    const container = document.getElementById('messages');
    if (!container) return;
    
    if (messagesCache.has(chatId) && messagesCache.get(chatId).length > 0) {
        const cachedMessages = messagesCache.get(chatId);
        container.innerHTML = '';
        cachedMessages.forEach(msg => {
            renderMessage(msg);
        });
        container.scrollTop = container.scrollHeight;
        return;
    }
    
    if (isLoadingMessages) return;
    isLoadingMessages = true;
    
    const currentMessages = container.querySelectorAll('.message');
    if (currentMessages.length === 0) {
        container.innerHTML = '<div class="loading-messages">Загрузка сообщений...</div>';
    }
    
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
        
        const messagesWithProfiles = (msgs || []).map(msg => ({
            ...msg,
            profiles: profilesMap.get(msg.user_id)
        }));
        
        messagesCache.set(chatId, messagesWithProfiles);
        
        container.innerHTML = '';
        
        if (messagesWithProfiles.length > 0) {
            messagesWithProfiles.forEach(msg => {
                renderMessage(msg);
            });
        } else {
            container.innerHTML = '<div class="msg-stub">Начните переписку</div>';
        }
        
        container.scrollTop = container.scrollHeight;
    } catch (err) {
        console.error('Ошибка загрузки сообщений:', err);
        if (container.querySelector('.loading-messages')) {
            container.innerHTML = '<div class="loading-messages">Ошибка загрузки сообщений</div>';
        }
    } finally {
        isLoadingMessages = false;
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
                
                const newMessage = { ...payload.new, profiles: profile };
                
                if (messagesCache.has(chatId)) {
                    const cached = messagesCache.get(chatId);
                    cached.push(newMessage);
                    messagesCache.set(chatId, cached);
                }
                
                renderMessage(newMessage);
                
                const dialogItem = document.querySelector(`.dialog-item[data-chat-id="${chatId}"]`);
                if (dialogItem) {
                    const previewSpan = dialogItem.querySelector('.dialog-preview');
                    if (previewSpan) {
                        const isOwn = payload.new.user_id === currentUser.id;
                        const prefix = isOwn ? 'Вы: ' : '';
                        let text = payload.new.text;
                        if (text.length > 50) text = text.slice(0, 47) + '...';
                        previewSpan.textContent = prefix + text;
                    }
                    
                    if (payload.new.user_id !== currentUser.id && currentChat?.id !== chatId) {
                        let badge = dialogItem.querySelector('.unread-badge-count');
                        if (badge) {
                            const currentCount = parseInt(badge.textContent);
                            badge.textContent = currentCount + 1;
                        } else {
                            const newBadge = document.createElement('span');
                            newBadge.className = 'unread-badge-count';
                            newBadge.textContent = '1';
                            const nameSpan = dialogItem.querySelector('.dialog-name');
                            if (nameSpan) nameSpan.appendChild(newBadge);
                        }
                        dialogItem.classList.add('unread-dialog');
                    }
                    
                    const parent = dialogItem.parentNode;
                    parent.removeChild(dialogItem);
                    parent.insertBefore(dialogItem, parent.firstChild);
                }
            }
        )
        .subscribe();
}

// ─── Рендер сообщения с анимацией ────────────────────────
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
    setTimeout(() => {
        container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
        });
    }, 50);
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
            chat_id: currentChat.id,
            is_read: false
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
        
        const dialogItem = document.querySelector(`.dialog-item[data-chat-id="${currentChat.id}"]`);
        if (dialogItem) {
            const previewSpan = dialogItem.querySelector('.dialog-preview');
            if (previewSpan) {
                let shortText = text.length > 50 ? text.slice(0, 47) + '...' : text;
                previewSpan.textContent = 'Вы: ' + shortText;
            }
            const parent = dialogItem.parentNode;
            parent.removeChild(dialogItem);
            parent.insertBefore(dialogItem, parent.firstChild);
        }
    }
}

// ─── Выход ───────────────────────────────────────────────
const logoutBtn = document.getElementById('btn-logout');
if (logoutBtn) {
    logoutBtn.onclick = async () => {
        if (realtimeChannel) await _supabase.removeChannel(realtimeChannel);
        if (statusSubscription) await _supabase.removeChannel(statusSubscription);
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
        if (statusSubscription) await _supabase.removeChannel(statusSubscription);
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
            
            const { data: p, error: profileError } = await _supabase
                .from('profiles')
                .select('*')
                .eq('id', currentUser.id)
                .maybeSingle();
            
            if (profileError) {
                console.error('Ошибка загрузки профиля:', profileError);
            }
            
            if (!p) {
                const email = currentUser.email;
                let username = email ? email.split('@')[0] : 'user';
                username = username.replace(/@lumina\.local$/, '');
                
                const { data: newProfile, error: insertError } = await _supabase
                    .from('profiles')
                    .insert({
                        id: currentUser.id,
                        username: username,
                        full_name: username,
                        last_seen: new Date().toISOString()
                    })
                    .select()
                    .maybeSingle();
                
                if (insertError) {
                    console.error('Ошибка создания профиля:', insertError);
                }
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
            
            showLoading(false);
            showScreen('chat');
            await loadDialogs();
            
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
            trackUserActivity();
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
