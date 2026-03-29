import { _supabase, BOT_USER_ID, BOT_PROFILE, SAVED_MESSAGES_ID, SAVED_PROFILE } from './config.js';
import { api } from './api.js';
import { ui } from './ui.js';

let currentUser = null;
let currentUserProfile = null;
let currentChat = null;
let allUsers = [];

// ─── ИНИЦИАЛИЗАЦИЯ ──────────────────────────────────────
async function initApp() {
    const { data: { user } } = await _supabase.auth.getUser();
    if (user) {
        currentUser = user;
        await loadAllUsers();

        currentUserProfile = allUsers.find(u => u.id === user.id) || null;
        if (currentUserProfile) {
            document.getElementById('current-user-badge').textContent = currentUserProfile.full_name;
        }

        ui.showScreen('chat');
        initRealtime();
        loadDialogs();

        setInterval(() => api.updateLastSeen(user.id), 30000);
        api.updateLastSeen(user.id);
    } else {
        ui.showScreen('login');
    }
}

async function loadAllUsers() {
    const { data: profiles } = await api.fetchProfiles();
    allUsers = profiles || [];
}

// ─── REALTIME ────────────────────────────────────────────
function initRealtime() {
    _supabase.channel('messages-global')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            const m = payload.new;
            const isInCurrentChat =
                (m.sender_id === currentChat && m.receiver_id === currentUser.id) ||
                (m.receiver_id === currentChat && m.sender_id === currentUser.id) ||
                (currentChat === SAVED_MESSAGES_ID && m.sender_id === currentUser.id && m.receiver_id === currentUser.id);

            if (isInCurrentChat) {
                ui.appendMessage(m, currentUser.id);
            }
            loadDialogs();
        })
        .subscribe();
}

// ─── ДИАЛОГИ ────────────────────────────────────────────
async function loadDialogs() {
    const { data: msgs, error } = await _supabase.from('messages').select('*')
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .order('created_at', { ascending: false });

    if (error) return;

    const list = document.getElementById('dialogs-list');
    list.innerHTML = '';

    // Собираем последние сообщения по собеседнику
    const lastMsgs = new Map();
    msgs?.forEach(m => {
        const otherId = m.sender_id === currentUser.id ? m.receiver_id : m.sender_id;
        if (!lastMsgs.has(otherId)) lastMsgs.set(otherId, m);
    });

    // Если диалогов нет — показываем подсказку
    if (lastMsgs.size === 0) {
        list.innerHTML = '<div class="dialogs-loading">Нет диалогов</div>';
        return;
    }

    lastMsgs.forEach((m, uid) => {
        let prof;
        if (uid === BOT_USER_ID) prof = BOT_PROFILE;
        else if (uid === SAVED_MESSAGES_ID || uid === currentUser.id) prof = SAVED_PROFILE;
        else prof = allUsers.find(u => u.id === uid) || { full_name: 'Неизвестный', username: '?' };

        const isActive = currentChat === uid;
        const preview = m.text.length > 30 ? m.text.slice(0, 30) + '…' : m.text;
        const letter = prof.full_name ? prof.full_name[0].toUpperCase() : '?';

        const div = document.createElement('div');
        div.className = `dialog-item${isActive ? ' active' : ''}`;
        div.dataset.uid = uid;
        div.innerHTML = `
            <div class="dialog-avatar">${letter}</div>
            <div class="dialog-info">
                <div class="dialog-name">${escapeHtml(prof.full_name)}</div>
                <div class="dialog-preview">${escapeHtml(preview)}</div>
            </div>`;
        div.addEventListener('click', () => selectChat(uid, prof.full_name));
        list.appendChild(div);
    });
}

// ─── ВЫБОР ЧАТА ─────────────────────────────────────────
async function selectChat(id, name) {
    currentChat = id;
    document.getElementById('chat-title').textContent = name;
    document.getElementById('chat-status').textContent = '';

    const inputZone = document.getElementById('input-zone');
    if (inputZone) inputZone.style.display = 'flex';

    ui.clearMessages();
    ui.setDialogActive(id);

    // Для "Избранного" receiver = sender = currentUser.id
    const otherId = (id === SAVED_MESSAGES_ID) ? currentUser.id : id;
    const { data: msgs, error } = await api.fetchMessages(currentUser.id, otherId);

    const container = document.getElementById('messages');
    container.innerHTML = '';

    if (error || !msgs || msgs.length === 0) {
        container.innerHTML = '<div class="msg-stub"><p>Нет сообщений. Напишите первым!</p></div>';
        return;
    }
    msgs.forEach(m => ui.appendMessage(m, currentUser.id));
}

// ─── ОТПРАВКА СООБЩЕНИЯ ──────────────────────────────────
async function sendMessage() {
    const inp = document.getElementById('message-input');
    const text = inp.value.trim();
    if (!text || !currentChat || !currentUser) return;

    inp.value = '';

    const receiverId = (currentChat === SAVED_MESSAGES_ID) ? currentUser.id : currentChat;
    const { error } = await api.sendMessage(currentUser.id, receiverId, text);
    if (error) ui.showToast('Ошибка отправки сообщения', 'error');
}

// ─── УТИЛИТЫ ────────────────────────────────────────────
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ─── ОБРАБОТЧИКИ КНОПОК ──────────────────────────────────

// Отправка
document.getElementById('btn-send')?.addEventListener('click', sendMessage);

document.getElementById('message-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Вход
document.getElementById('btn-login')?.addEventListener('click', async () => {
    const u = document.getElementById('login-username').value.trim();
    const p = document.getElementById('login-password').value;
    if (!u || !p) { ui.showToast('Введите логин и пароль', 'error'); return; }

    const { error } = await api.signIn(u, p);
    if (!error) {
        initApp();
    } else {
        ui.showToast('Неверный логин или пароль', 'error');
    }
});

// Регистрация
document.getElementById('btn-register')?.addEventListener('click', async () => {
    const name = document.getElementById('reg-fullname').value.trim();
    const u = document.getElementById('reg-username').value.trim();
    const p = document.getElementById('reg-password').value;

    if (!name || !u || !p) { ui.showToast('Заполните все поля', 'error'); return; }
    if (u.length < 3) { ui.showToast('Username минимум 3 символа', 'error'); return; }
    if (p.length < 6) { ui.showToast('Пароль минимум 6 символов', 'error'); return; }
    if (!/^[a-z0-9_]+$/i.test(u)) { ui.showToast('Username: только латиница, цифры, _', 'error'); return; }

    const { error } = await api.signUp(u, p, name);
    if (!error) {
        ui.showToast('Аккаунт создан! Входим…', 'success');
        await api.signIn(u, p);
        initApp();
    } else {
        ui.showToast(error.message || 'Ошибка регистрации', 'error');
    }
});

// Навигация между экранами авторизации
document.getElementById('btn-go-to-register')?.addEventListener('click', () => ui.showScreen('register'));
document.getElementById('btn-go-to-login')?.addEventListener('click', () => ui.showScreen('login'));

// Профиль — открыть
document.getElementById('btn-open-profile')?.addEventListener('click', () => {
    if (!currentUserProfile) return;
    document.getElementById('profile-fullname').value = currentUserProfile.full_name || '';
    document.getElementById('profile-bio').value = currentUserProfile.bio || '';
    const letter = (currentUserProfile.full_name || '?')[0].toUpperCase();
    document.getElementById('profile-avatar-letter').textContent = letter;
    ui.showScreen('profile-modal');
});

// Профиль — закрыть
document.getElementById('btn-close-profile')?.addEventListener('click', () => {
    ui.hideProfileModal();
});

// Профиль — сохранить
document.getElementById('btn-save-profile')?.addEventListener('click', async () => {
    const name = document.getElementById('profile-fullname').value.trim();
    const bio = document.getElementById('profile-bio').value.trim();
    if (!name) { ui.showToast('Имя не может быть пустым', 'error'); return; }

    const { error } = await api.updateProfile(currentUser.id, { full_name: name, bio });
    if (!error) {
        currentUserProfile = { ...currentUserProfile, full_name: name, bio };
        document.getElementById('current-user-badge').textContent = name;
        ui.showToast('Профиль сохранён', 'success');
        ui.hideProfileModal();
    } else {
        ui.showToast('Ошибка сохранения', 'error');
    }
});

// Выход
document.getElementById('btn-logout-profile')?.addEventListener('click', async () => {
    await api.signOut();
    currentUser = null;
    currentUserProfile = null;
    currentChat = null;
    allUsers = [];
    ui.hideProfileModal();
    ui.showScreen('login');
});

// ─── СТАРТ ───────────────────────────────────────────────
initApp();
