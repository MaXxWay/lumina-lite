const SUPABASE_URL = 'https://ofxvazqurjgnxxuozjlr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9meHZhenF1cmpnbnh4dW96amxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTg4ODEsImV4cCI6MjA5MDE5NDg4MX0.Zf2pwQNmxe9wBt7tlZed-ntnLPzm7JGOuqkLuBkv0GE';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser    = null;
let currentProfile = null;
let currentChat    = null;
let realtimeChannel    = null;
let statusSubscription = null;
let typingChannel      = null;
let allUsers = [];

const BOT_USER_ID = '00000000-0000-0000-0000-000000000000';
const BOT_PROFILE = { id: BOT_USER_ID, username: 'lumina_bot', full_name: 'Lumina Bot', bio: 'Официальный бот мессенджера Lumina Lite', is_bot: true };

const getEmail = (u) => `${u.toLowerCase().trim().replace(/^@/, '')}@lumina.local`;

// ─── Утилиты ─────────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'toast'; }, 3000);
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

// ─── Мобильная навигация (сайдбар ↔ чат) ─────────────────
function isMobile() {
    return window.innerWidth <= 768;
}

function showMobileChat() {
    if (!isMobile()) return;
    const sidebar = document.querySelector('.dialogs-sidebar');
    const chatArea = document.querySelector('.glass-chat-area');
    if (sidebar) sidebar.classList.add('chat-open');
    if (chatArea) chatArea.classList.add('chat-open');
}

function showMobileDialogs() {
    if (!isMobile()) return;
    const sidebar = document.querySelector('.dialogs-sidebar');
    const chatArea = document.querySelector('.glass-chat-area');
    if (sidebar) sidebar.classList.remove('chat-open');
    if (chatArea) chatArea.classList.remove('chat-open');
}

// Кнопка "назад" на мобилке
const mobileBackBtn = document.getElementById('btn-mobile-back');
if (mobileBackBtn) {
    mobileBackBtn.onclick = () => {
        showMobileDialogs();
        // Сбрасываем активный чат визуально
        currentChat = null;
        const chatTitle = document.getElementById('chat-title');
        if (chatTitle) chatTitle.textContent = 'Lumina Lite';
        const chatStatus = document.querySelector('.chat-status');
        if (chatStatus) chatStatus.textContent = 'выберите диалог';
        const inputZone = document.querySelector('.input-zone');
        if (inputZone) inputZone.style.display = 'none';
        document.querySelectorAll('.dialog-item').forEach(el => el.classList.remove('active'));
        // Отписываемся от realtime
        if (realtimeChannel) { _supabase.removeChannel(realtimeChannel); realtimeChannel = null; }
        if (statusSubscription) { _supabase.removeChannel(statusSubscription); statusSubscription = null; }
        if (typingChannel) { _supabase.removeChannel(typingChannel); typingChannel = null; }
    };
}

// ─── Навигация авторизации ───────────────────────────────
const toLogin = document.getElementById('to-login');
const toRegister = document.getElementById('to-register');
if (toLogin) toLogin.onclick = () => showScreen('login');
if (toRegister) toRegister.onclick = () => showScreen('reg');

// Enter на полях авторизации
const loginPassField = document.getElementById('login-password');
if (loginPassField) loginPassField.onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('btn-do-login')?.click(); };
const regPassField = document.getElementById('reg-password');
if (regPassField) regPassField.onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('btn-do-reg')?.click(); };

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

// ─── Вход ────────────────────────────────────────────────
const loginBtn = document.getElementById('btn-do-login');
if (loginBtn) {
    loginBtn.onclick = async () => {
        const user = document.getElementById('login-username').value.trim();
        const pass = document.getElementById('login-password').value.trim();
        if (!user || !pass) return showToast('Заполните все поля', true);

        const { data, error } = await _supabase.auth.signInWithPassword({ email: getEmail(user), password: pass });
        if (error) return showToast('Ошибка входа: ' + error.message, true);

        currentUser = data.user;
        await afterLogin(user);
    };
}

// ─── Инициализация после входа ───────────────────────────
async function afterLogin(rawUsername) {
    const { data: p } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();

    if (!p) {
        const username = (rawUsername || '').replace(/^@/, '') || currentUser.email.split('@')[0];
        const { data: np } = await _supabase.from('profiles')
            .insert({ id: currentUser.id, username, full_name: username, last_seen: new Date().toISOString() })
            .select().maybeSingle();
        currentProfile = np;
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
    const messagesEl = document.getElementById('messages');
    if (messagesEl) {
        messagesEl.innerHTML = `
            <div class="msg-stub">
                <svg width="48" height="48" style="margin-bottom:16px;opacity:0.3;"><use href="#icon-chat"/></svg>
                <p>Выберите диалог, чтобы начать общение</p>
            </div>`;
    }
    currentChat = null;

    // Обновляем last_seen
    document.addEventListener('click', () => updateLastSeen(), { passive: true });
    document.addEventListener('keypress', () => updateLastSeen(), { passive: true });
    setInterval(() => updateLastSeen(), 30000);
    updateLastSeen();
}

// ─── Выход ───────────────────────────────────────────────
async function doLogout() {
    if (realtimeChannel) await _supabase.removeChannel(realtimeChannel);
    if (statusSubscription) await _supabase.removeChannel(statusSubscription);
    if (typingChannel) await _supabase.removeChannel(typingChannel);
    await _supabase.auth.signOut();
    currentUser = null; currentProfile = null; currentChat = null;
    showScreen('reg');
}

const logoutBtn = document.getElementById('btn-logout');
if (logoutBtn) logoutBtn.onclick = doLogout;

// ─── Профиль — нижняя панель ─────────────────────────────
function updateProfileFooter() {
    if (!currentProfile) return;
    const el = (id) => document.getElementById(id);
    if (el('footer-avatar')) el('footer-avatar').textContent = (currentProfile.full_name || '?')[0].toUpperCase();
    if (el('footer-name')) el('footer-name').textContent = currentProfile.full_name || currentProfile.username || 'Пользователь';
    if (el('footer-username')) el('footer-username').textContent = `@${currentProfile.username || 'username'}`;
}

function openProfileScreen() {
    if (!currentProfile) return;
    const el = (id) => document.getElementById(id);
    const letter = (currentProfile.full_name || '?')[0].toUpperCase();
    if (el('profile-avatar-letter')) el('profile-avatar-letter').textContent = letter;
    if (el('profile-fullname')) el('profile-fullname').value = currentProfile.full_name || '';
    if (el('profile-username')) el('profile-username').value = currentProfile.username || '';
    if (el('profile-bio')) el('profile-bio').value = currentProfile.bio || '';
    showScreen('profile');
}

function initProfileFooter() {
    const footerInfo = document.querySelector('.profile-footer-info');
    if (footerInfo) footerInfo.onclick = openProfileScreen;

    const settingsBtn = document.getElementById('footer-settings');
    if (settingsBtn) settingsBtn.onclick = (e) => { e.stopPropagation(); openProfileScreen(); };

    const logoutFooterBtn = document.getElementById('footer-logout');
    if (logoutFooterBtn) logoutFooterBtn.onclick = (e) => { e.stopPropagation(); doLogout(); };
}

// Профиль — кнопка назад
const profileBackBtn = document.getElementById('btn-profile-back');
if (profileBackBtn) profileBackBtn.onclick = () => showScreen('chat');

// Профиль — кнопка выйти
const profileLogoutBtn = document.getElementById('btn-logout-profile');
if (profileLogoutBtn) profileLogoutBtn.onclick = doLogout;

// Профиль — сохранить
const saveProfileBtn = document.getElementById('btn-save-profile');
if (saveProfileBtn) {
    saveProfileBtn.onclick = async () => {
        const full_name = document.getElementById('profile-fullname').value.trim();
        const bio = document.getElementById('profile-bio').value.trim();
        if (!full_name) return showToast('Имя не может быть пустым', true);

        const { error } = await _supabase.from('profiles').update({ full_name, bio }).eq('id', currentUser.id);
        if (error) return showToast('Ошибка сохранения', true);

        currentProfile.full_name = full_name;
        currentProfile.bio = bio;
        const badge = document.getElementById('current-user-badge');
        if (badge) badge.textContent = full_name;
        const avatarLetter = document.getElementById('profile-avatar-letter');
        if (avatarLetter) avatarLetter.textContent = full_name[0].toUpperCase();
        updateProfileFooter();
        showToast('Профиль сохранён ✓');
        setTimeout(() => showScreen('chat'), 700);
    };
}

// ─── Статус ──────────────────────────────────────────────
let lastActivityUpdate = 0;
async function updateLastSeen() {
    if (!currentUser) return;
    const now = Date.now();
    if (now - lastActivityUpdate < 30000) return;
    lastActivityUpdate = now;
    try { await _supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', currentUser.id); } catch {}
}

function formatLastSeen(lastSeen) {
    if (!lastSeen) return 'неизвестно';
    const d = new Date(lastSeen), now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const time = d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
    if (d >= today) return `сегодня в ${time}`;
    if (d >= yesterday) return `вчера в ${time}`;
    return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' }) + ` в ${time}`;
}

function getUserStatus(lastSeen) {
    if (!lastSeen) return { text: 'неизвестно', class: 'status-offline', isOnline: false };
    const diffMins = Math.floor((Date.now() - new Date(lastSeen)) / 60000);
    if (diffMins < 5) return { text: 'онлайн', class: 'status-online', isOnline: true };
    return { text: formatLastSeen(lastSeen), class: 'status-offline', isOnline: false };
}

function updateChatStatus(lastSeen) {
    const chatStatus = document.querySelector('.chat-status');
    if (!chatStatus) return;
    if (currentChat?.other_user?.id === BOT_USER_ID) {
        chatStatus.textContent = 'бот'; chatStatus.className = 'chat-status status-bot'; return;
    }
    const status = getUserStatus(lastSeen);
    chatStatus.textContent = status.text;
    chatStatus.className = `chat-status ${status.class}`;
}

function subscribeToUserStatus(userId) {
    if (statusSubscription) _supabase.removeChannel(statusSubscription);
    statusSubscription = _supabase
        .channel(`status-${userId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, (payload) => {
            if (payload.new && currentChat?.other_user?.id === userId) updateChatStatus(payload.new.last_seen);
        })
        .subscribe();
}

// ─── Индикатор печатания ─────────────────────────────────
let typingTimeout = null;
let isTyping = false;

function setupTypingIndicator() {
    const messageInput = document.getElementById('message-input');
    if (!messageInput) return;
    messageInput.oninput = () => {
        if (!currentChat || currentChat.other_user?.id === BOT_USER_ID) return;
        if (typingTimeout) clearTimeout(typingTimeout);
        if (!isTyping) { isTyping = true; sendTypingStatus(true); }
        typingTimeout = setTimeout(() => { isTyping = false; sendTypingStatus(false); }, 1500);
    };
}

async function sendTypingStatus(isTypingNow) {
    if (!currentChat || !typingChannel) return;
    try { await typingChannel.send({ type: 'broadcast', event: 'typing', payload: { isTyping: isTypingNow, userId: currentUser.id } }); } catch {}
}

function subscribeToTyping(chatId) {
    if (typingChannel) _supabase.removeChannel(typingChannel);
    typingChannel = _supabase
        .channel(`typing-${chatId}`)
        .on('broadcast', { event: 'typing' }, (payload) => {
            if (payload.payload.userId === currentUser?.id) return;
            const typingStatus = document.querySelector('.typing-status');
            if (!typingStatus) return;
            if (payload.payload.isTyping) {
                typingStatus.textContent = 'печатает...'; typingStatus.style.display = 'block';
                clearTimeout(typingStatus._timer);
                typingStatus._timer = setTimeout(() => { typingStatus.style.display = 'none'; }, 3000);
            } else {
                typingStatus.style.display = 'none';
            }
        })
        .subscribe();
}

// ─── Пользователи ────────────────────────────────────────
async function loadAllUsers() {
    try {
        const { data } = await _supabase.from('profiles').select('id, username, full_name').neq('id', currentUser.id);
        allUsers = data || [];
    } catch { allUsers = []; }
}

async function searchUsersByUsername(username) {
    let clean = username.startsWith('@') ? username.substring(1) : username;
    if (!clean) return [];
    try {
        const { data } = await _supabase.from('profiles').select('id, username, full_name')
            .ilike('username', `%${clean}%`).neq('id', currentUser.id).limit(10);
        return data || [];
    } catch { return []; }
}

// ─── Чаты ────────────────────────────────────────────────
async function getOrCreatePrivateChat(otherUserId) {
    const { data: existing } = await _supabase
        .from('chats').select('id').eq('type', 'private')
        .contains('participants', [currentUser.id, otherUserId]).maybeSingle();
    if (existing) return existing.id;

    const { data: newChat } = await _supabase
        .from('chats').insert({
            type: 'private',
            participants: [currentUser.id, otherUserId],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }).select().single();
    return newChat.id;
}

async function ensureBotChat() {
    try {
        const { data: existing } = await _supabase
            .from('chats').select('id').eq('type', 'private')
            .contains('participants', [currentUser.id, BOT_USER_ID]).maybeSingle();

        const chatId = existing?.id || (await (async () => {
            const { data: nc } = await _supabase.from('chats').insert({
                type: 'private', participants: [currentUser.id, BOT_USER_ID],
                created_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_bot_chat: true
            }).select().single();
            return nc?.id;
        })());

        if (!chatId) return;

        const { data: welcomeMsg } = await _supabase.from('messages').select('id')
            .eq('chat_id', chatId).eq('is_welcome', true).maybeSingle();
        if (!welcomeMsg) {
            await _supabase.from('messages').insert({
                text: 'Добро пожаловать в Lumina Lite! 🚀\n\nЗдесь можно найти друзей по @username и общаться в реальном времени.',
                user_id: BOT_USER_ID, chat_id: chatId, is_welcome: true, is_system: true, is_read: false
            });
        }
    } catch (err) { console.error('ensureBotChat:', err); }
}

// ─── Непрочитанные / последнее сообщение ─────────────────
async function getUnreadCount(chatId) {
    try {
        const { count } = await _supabase.from('messages').select('id', { count: 'exact', head: true })
            .eq('chat_id', chatId).eq('is_read', false).neq('user_id', currentUser.id);
        return count || 0;
    } catch { return 0; }
}

async function getLastMessage(chatId) {
    try {
        const { data } = await _supabase.from('messages').select('text, user_id')
            .eq('chat_id', chatId).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (!data) return null;
        const prefix = data.user_id === currentUser.id ? 'Вы: ' : '';
        return prefix + (data.text.length > 50 ? data.text.slice(0, 47) + '...' : data.text);
    } catch { return null; }
}

async function markChatMessagesAsRead(chatId) {
    if (!chatId || !currentUser) return;
    try {
        await _supabase.from('messages').update({ is_read: true, read_at: new Date().toISOString() })
            .eq('chat_id', chatId).neq('user_id', currentUser.id).eq('is_read', false);

        // Обновляем только бейдж в UI, без полной перезагрузки диалогов
        const dialogItem = document.querySelector(`.dialog-item[data-chat-id="${chatId}"]`);
        if (dialogItem) {
            const badge = dialogItem.querySelector('.unread-badge-count');
            if (badge) badge.remove();
            dialogItem.classList.remove('unread-dialog');
        }
    } catch (err) { console.error('markAsRead:', err); }
}

// ─── Загрузка диалогов ───────────────────────────────────
let isUpdatingDialogs = false;
let dialogCacheIds = '';

async function loadDialogs(searchTerm = '') {
    const container = document.getElementById('dialogs-list');
    if (!container) return;

    const isUserSearch = searchTerm.startsWith('@');

    // Поиск пользователей
    if (isUserSearch && searchTerm.length > 1) {
        const users = await searchUsersByUsername(searchTerm);
        container.innerHTML = `<div class="search-header"><span class="search-title">👥 Найдено: ${users.length}</span></div>`;
        if (users.length === 0) {
            container.innerHTML += '<div class="dialogs-loading">Пользователи не найдены</div>';
        } else {
            users.forEach(user => {
                const name = user.full_name || user.username;
                const div = document.createElement('div');
                div.className = 'dialog-item user-search-item';
                div.innerHTML = `
                    <div class="dialog-avatar"><div class="avatar-letter">${escapeHtml(name.charAt(0))}</div></div>
                    <div class="dialog-info">
                        <div class="dialog-name">${escapeHtml(name)}<span class="username-hint">@${escapeHtml(user.username)}</span></div>
                        <div class="dialog-preview">Нажмите, чтобы начать чат</div>
                    </div>`;
                div.onclick = async () => {
                    try {
                        const chatId = await getOrCreatePrivateChat(user.id);
                        const searchInputElem = document.getElementById('search-dialogs');
                        if (searchInputElem) searchInputElem.value = '';
                        await openChat(chatId, user.id, user);
                        loadDialogs();
                    } catch { showToast('Ошибка создания чата', true); }
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
            .from('chats').select('*').contains('participants', [currentUser.id])
            .order('updated_at', { ascending: false });
        if (error) throw error;

        const allIds = chats ? chats.flatMap(c => c.participants) : [];
        const profileMap = new Map();
        if (allIds.length > 0) {
            const { data: profiles } = await _supabase.from('profiles')
                .select('id, full_name, username, last_seen').in('id', allIds);
            if (profiles) profiles.forEach(p => profileMap.set(p.id, p));
        }
        profileMap.set(BOT_USER_ID, BOT_PROFILE);

        const chatData = await Promise.all((chats || []).map(async (chat) => {
            const otherId = chat.participants.find(id => id !== currentUser.id);
            const otherUser = profileMap.get(otherId);
            const name = otherUser?.full_name || otherUser?.username || 'Пользователь';
            const isBot = otherId === BOT_USER_ID;
            const [unreadCount, lastMessage] = await Promise.all([getUnreadCount(chat.id), getLastMessage(chat.id)]);
            const status = otherUser ? getUserStatus(otherUser.last_seen) : { text: '', class: '' };
            return { id: chat.id, otherId, otherUser, name, isBot, unreadCount, lastMessage: lastMessage || 'Нет сообщений', updatedAt: chat.updated_at, statusText: status.text, statusClass: status.class };
        }));

        chatData.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        let filtered = chatData;
        if (searchTerm && !isUserSearch) {
            filtered = chatData.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
        }

        const newIds = filtered.map(c => c.id).join(',');
        if (newIds === dialogCacheIds && !searchTerm) { return; }
        dialogCacheIds = newIds;

        container.innerHTML = '';
        if (filtered.length === 0) {
            container.innerHTML = '<div class="dialogs-loading">Нет диалогов. Введите @username для поиска</div>';
        } else {
            filtered.forEach(chat => {
                const div = document.createElement('div');
                div.className = `dialog-item ${currentChat?.id === chat.id ? 'active' : ''} ${chat.unreadCount > 0 ? 'unread-dialog' : ''}`;
                div.dataset.chatId = chat.id;
                div.dataset.otherUserId = chat.otherId;
                div.innerHTML = `
                    <div class="dialog-avatar ${chat.isBot ? 'bot-avatar' : ''}">
                        ${chat.isBot ? '<img src="lumina.svg" alt="Bot"><div class="verified-badge"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>' : `<div class="avatar-letter">${escapeHtml(chat.name.charAt(0))}</div>`}
                    </div>
                    <div class="dialog-info">
                        <div class="dialog-name">
                            ${escapeHtml(chat.name)}
                            ${chat.isBot ? '<span class="bot-badge">Бот</span>' : ''}
                            ${chat.unreadCount > 0 ? `<span class="unread-badge-count">${chat.unreadCount}</span>` : ''}
                        </div>
                        <div class="dialog-preview">${escapeHtml(chat.lastMessage)}</div>
                        ${!chat.isBot && chat.statusText ? `<div class="dialog-status ${chat.statusClass === 'status-online' ? 'dialog-status-online' : 'dialog-status-offline'}">${chat.statusText}</div>` : ''}
                    </div>`;
                div.onclick = async () => {
                    await openChat(chat.id, chat.otherId, chat.otherUser);
                    if (chat.unreadCount > 0) await markChatMessagesAsRead(chat.id);
                };
                container.appendChild(div);
            });
        }
    } catch (err) {
        console.error('loadDialogs:', err);
        if (container.children.length === 0) container.innerHTML = '<div class="dialogs-loading">Ошибка загрузки</div>';
    } finally {
        isUpdatingDialogs = false;
    }
}

// Поиск диалогов
const searchInputElem = document.getElementById('search-dialogs');
if (searchInputElem) {
    let searchTimeout;
    searchInputElem.oninput = (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => loadDialogs(e.target.value), 300);
    };
}

// ─── Открыть чат ─────────────────────────────────────────
let isOpeningChat = false;

async function openChat(chatId, otherUserId, otherUser) {
    if (isOpeningChat) return;
    // Разрешаем переоткрытие при возврате с профиля
    if (currentChat?.id === chatId && !isMobile()) return;
    isOpeningChat = true;

    try {
        const isBot = otherUserId === BOT_USER_ID;
        currentChat = { id: chatId, type: 'private', other_user: otherUser || (isBot ? BOT_PROFILE : null) };

        const chatTitle = document.getElementById('chat-title');
        if (chatTitle) {
            const name = otherUser?.full_name || otherUser?.username || (isBot ? 'Lumina Bot' : 'Чат');
            chatTitle.innerHTML = escapeHtml(name) + (isBot ? ' <span class="bot-badge">Бот</span>' : '');
        }

        if (!isBot && otherUserId) {
            const { data: prof } = await _supabase.from('profiles').select('last_seen').eq('id', otherUserId).maybeSingle();
            if (prof) { updateChatStatus(prof.last_seen); subscribeToUserStatus(otherUserId); subscribeToTyping(chatId); }
        } else if (isBot) {
            const cs = document.querySelector('.chat-status');
            if (cs) { cs.textContent = 'бот'; cs.className = 'chat-status status-bot'; }
        }

        const inputZone = document.querySelector('.input-zone');
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('btn-send-msg');

        if (isBot) {
            if (inputZone) inputZone.style.display = 'none';
            if (messageInput) messageInput.disabled = true;
            if (sendButton) sendButton.disabled = true;
        } else {
            if (inputZone) inputZone.style.display = 'block';
            if (messageInput) { messageInput.disabled = false; messageInput.placeholder = 'Написать сообщение...'; setTimeout(() => { if (!isMobile()) messageInput.focus(); }, 150); }
            if (sendButton) sendButton.disabled = false;
            setupTypingIndicator();
        }

        await loadMessages(chatId);
        subscribeToMessages(chatId);

        document.querySelectorAll('.dialog-item').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.chatId === chatId) el.classList.add('active');
        });

        await markChatMessagesAsRead(chatId);

        // На мобилке — показываем чат
        if (isMobile()) showMobileChat();
    } finally {
        isOpeningChat = false;
    }
}

// ─── Загрузка сообщений ──────────────────────────────────
let messagesCache = new Map();
let isLoadingMessages = false;

async function loadMessages(chatId) {
    const container = document.getElementById('messages');
    if (!container) return;

    // Кэш
    if (messagesCache.has(chatId) && messagesCache.get(chatId).length > 0) {
        container.innerHTML = '';
        messagesCache.get(chatId).forEach(msg => renderMessage(msg));
        container.scrollTop = container.scrollHeight;
        return;
    }

    if (isLoadingMessages) return;
    isLoadingMessages = true;

    try {
        const { data: msgs, error } = await _supabase.from('messages').select('*')
            .eq('chat_id', chatId).order('created_at', { ascending: true }).limit(200);
        if (error) throw error;

        const userIds = [...new Set((msgs || []).map(m => m.user_id))];
        const profilesMap = new Map();
        if (userIds.length > 0) {
            const { data: profiles } = await _supabase.from('profiles').select('id, full_name, username').in('id', userIds);
            if (profiles) profiles.forEach(p => profilesMap.set(p.id, p));
        }
        profilesMap.set(BOT_USER_ID, BOT_PROFILE);

        const withProfiles = (msgs || []).map(msg => ({ ...msg, profiles: profilesMap.get(msg.user_id) }));
        messagesCache.set(chatId, withProfiles);

        container.innerHTML = '';
        if (withProfiles.length > 0) {
            withProfiles.forEach(msg => renderMessage(msg));
        } else {
            container.innerHTML = '<div class="msg-stub">Начните переписку ✉️</div>';
        }
        container.scrollTop = container.scrollHeight;
    } catch (err) {
        console.error('loadMessages:', err);
        container.innerHTML = '<div class="loading-messages">Ошибка загрузки сообщений</div>';
    } finally {
        isLoadingMessages = false;
    }
}

// ─── Realtime ────────────────────────────────────────────
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
                    profile = payload.new.user_id === BOT_USER_ID ? BOT_PROFILE : null;
                    if (!profile) {
                        const { data: up } = await _supabase.from('profiles').select('full_name, username').eq('id', payload.new.user_id).single();
                        profile = up;
                    }
                }

                const newMessage = { ...payload.new, profiles: profile };
                if (messagesCache.has(chatId)) {
                    const cached = messagesCache.get(chatId);
                    cached.push(newMessage);
                    messagesCache.set(chatId, cached);
                }

                // Убираем заглушку если есть
                const container = document.getElementById('messages');
                const stub = container?.querySelector('.msg-stub');
                if (stub) stub.remove();

                renderMessage(newMessage);

                // Обновляем превью диалога
                const dialogItem = document.querySelector(`.dialog-item[data-chat-id="${chatId}"]`);
                if (dialogItem) {
                    const preview = dialogItem.querySelector('.dialog-preview');
                    if (preview) {
                        const isOwn = payload.new.user_id === currentUser.id;
                        let text = (isOwn ? 'Вы: ' : '') + payload.new.text;
                        if (text.length > 52) text = text.slice(0, 50) + '...';
                        preview.textContent = text;
                    }
                    if (payload.new.user_id !== currentUser.id && currentChat?.id !== chatId) {
                        let badge = dialogItem.querySelector('.unread-badge-count');
                        if (badge) {
                            badge.textContent = parseInt(badge.textContent) + 1;
                        } else {
                            const nb = document.createElement('span');
                            nb.className = 'unread-badge-count'; nb.textContent = '1';
                            dialogItem.querySelector('.dialog-name')?.appendChild(nb);
                        }
                        dialogItem.classList.add('unread-dialog');
                    }
                    const parent = dialogItem.parentNode;
                    if (parent) { parent.removeChild(dialogItem); parent.insertBefore(dialogItem, parent.firstChild); }
                }

                if (currentChat?.id === chatId && payload.new.user_id !== currentUser.id) {
                    await markChatMessagesAsRead(chatId);
                }
            }
        )
        .subscribe();
}

// ─── Рендер сообщения ────────────────────────────────────
function renderMessage(msg) {
    const container = document.getElementById('messages');
    if (!container) return;

    const stub = container.querySelector('.msg-stub');
    if (stub) stub.remove();

    const isOwn = currentUser && msg.user_id === currentUser.id;
    const isBot = msg.user_id === BOT_USER_ID;
    let name = msg.profiles?.full_name || (isOwn ? currentProfile?.full_name : null) || (isBot ? 'Lumina Bot' : 'Пользователь');

    const timeStr = new Date(msg.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });

    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'own' : 'other'} ${isBot ? 'bot-message' : ''}`;
    div.dataset.id = msg.id;
    div.dataset.text = msg.text;

    div.innerHTML = `
        <div class="msg-avatar ${isBot ? 'bot-avatar' : ''}" style="${isOwn && !isBot ? 'background:#0072ff' : ''}">
            ${isBot ? '<img src="lumina.svg" alt="Bot"><div class="verified-badge-small"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>' : `<div class="avatar-letter">${escapeHtml(name.charAt(0))}</div>`}
        </div>
        <div class="msg-bubble">
            ${!isOwn ? `<div class="msg-sender">${escapeHtml(name)}${isBot ? ' <span class="bot-badge-small">Бот</span>' : ''}</div>` : ''}
            <div class="text">${escapeHtml(msg.text)}</div>
            <div class="msg-time">${timeStr}</div>
        </div>`;

    div.oncontextmenu = (e) => { showMessageMenu(e, msg.id, msg.text, isOwn); return false; };

    container.appendChild(div);
    setTimeout(() => { container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' }); }, 30);
}

// ─── Отправка ────────────────────────────────────────────
async function sendMsg() {
    const input = document.getElementById('message-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text || !currentUser || !currentChat) {
        if (!currentChat) showToast('Выберите чат', true);
        return;
    }
    if (currentChat.other_user?.id === BOT_USER_ID) {
        showToast('Нельзя отправлять сообщения боту', true); return;
    }
    input.value = '';

    const { data, error } = await _supabase.from('messages')
        .insert([{ text, user_id: currentUser.id, chat_id: currentChat.id, is_read: false, created_at: new Date().toISOString() }])
        .select().single();

    if (error) {
        showToast('Ошибка отправки', true);
        input.value = text;
    } else {
        // Рендерим сразу если realtime не успел
        if (!document.querySelector(`.message[data-id="${data.id}"]`)) {
            renderMessage({ ...data, profiles: currentProfile });
        }
        // Обновляем updated_at чата
        await _supabase.from('chats').update({ updated_at: new Date().toISOString(), last_message: text.slice(0, 50) }).eq('id', currentChat.id);

        // Обновляем превью в диалоге
        const dialogItem = document.querySelector(`.dialog-item[data-chat-id="${currentChat.id}"]`);
        if (dialogItem) {
            const preview = dialogItem.querySelector('.dialog-preview');
            if (preview) preview.textContent = 'Вы: ' + (text.length > 50 ? text.slice(0, 47) + '...' : text);
            const parent = dialogItem.parentNode;
            if (parent) { parent.removeChild(dialogItem); parent.insertBefore(dialogItem, parent.firstChild); }
        }
        input.focus();
    }
}

const sendButton = document.getElementById('btn-send-msg');
if (sendButton) sendButton.onclick = sendMsg;

const messageInputField = document.getElementById('message-input');
if (messageInputField) {
    messageInputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
    });
}

// ─── Эмодзи ──────────────────────────────────────────────
const emojiBtn = document.getElementById('btn-emoji');
const emojiPicker = document.getElementById('emoji-picker');
if (emojiBtn && emojiPicker) {
    emojiBtn.onclick = (e) => {
        e.stopPropagation();
        emojiPicker.style.display = emojiPicker.style.display === 'flex' ? 'none' : 'flex';
        if (emojiPicker.style.display === 'flex') emojiPicker.style.flexWrap = 'wrap';
    };
    document.querySelectorAll('.emoji-item').forEach(emoji => {
        emoji.onclick = () => {
            const input = document.getElementById('message-input');
            if (input) { input.value += emoji.textContent; input.focus(); }
            emojiPicker.style.display = 'none';
        };
    });
    document.addEventListener('click', (e) => {
        if (emojiPicker.style.display !== 'none' && !emojiPicker.contains(e.target) && e.target !== emojiBtn) {
            emojiPicker.style.display = 'none';
        }
    });
}

// ─── Контекстное меню ────────────────────────────────────
const messageMenu = document.getElementById('message-menu');

function showMessageMenu(e, messageId, messageText, isOwn) {
    e.preventDefault(); e.stopPropagation();
    if (!messageMenu) return;

    let x = e.clientX, y = e.clientY;
    messageMenu.style.display = 'block';

    // Корректируем позицию чтобы не выходило за экран
    const rect = messageMenu.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
    messageMenu.style.left = `${Math.max(8, x)}px`;
    messageMenu.style.top = `${Math.max(8, y)}px`;

    messageMenu.querySelectorAll('.menu-item').forEach(item => {
        item.onclick = () => handleMessageAction(item.dataset.action, messageId, messageText, isOwn);
    });
    setTimeout(() => document.addEventListener('click', hideMessageMenu), 0);
}

function hideMessageMenu() {
    if (messageMenu) messageMenu.style.display = 'none';
    document.removeEventListener('click', hideMessageMenu);
}

async function handleMessageAction(action, messageId, messageText, isOwn) {
    hideMessageMenu();
    switch (action) {
        case 'reply':
            const inp = document.getElementById('message-input');
            if (inp) { inp.value = `> ${messageText}\n\n`; inp.focus(); }
            break;
        case 'copy':
            try { await navigator.clipboard.writeText(messageText); showToast('Текст скопирован'); } catch { showToast('Ошибка копирования', true); }
            break;
        case 'edit':
            if (!isOwn) { showToast('Только свои сообщения', true); return; }
            const newText = prompt('Изменить сообщение:', messageText);
            if (newText?.trim()) {
                const { error } = await _supabase.from('messages').update({ text: newText.trim(), is_edited: true }).eq('id', messageId);
                if (error) { showToast('Ошибка редактирования', true); } else {
                    const msgDiv = document.querySelector(`.message[data-id="${messageId}"] .text`);
                    if (msgDiv) msgDiv.textContent = newText.trim();
                    showToast('Изменено');
                }
            }
            break;
        case 'pin': showToast('Функция в разработке'); break;
        case 'forward': showToast('Функция в разработке'); break;
        case 'delete':
            if (!isOwn) { showToast('Только свои сообщения', true); return; }
            if (!confirm('Удалить сообщение?')) return;
            const { error: delErr } = await _supabase.from('messages').delete().eq('id', messageId);
            if (delErr) { showToast('Ошибка удаления', true); } else {
                document.querySelector(`.message[data-id="${messageId}"]`)?.remove();
                showToast('Удалено');
            }
            break;
    }
}

// ─── DVH фикс (Safari/мобилка) ───────────────────────────
function updateDvh() {
    document.documentElement.style.setProperty('--dvh', `${window.innerHeight}px`);
}
window.addEventListener('resize', updateDvh, { passive: true });
updateDvh();

// ─── Запуск ──────────────────────────────────────────────
(async () => {
    const { data: { session } } = await _supabase.auth.getSession();

    if (session) {
        currentUser = session.user;
        await afterLogin();
    } else {
        showScreen('reg');
    }
})();
