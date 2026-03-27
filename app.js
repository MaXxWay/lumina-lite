const SUPABASE_URL = 'https://ofxvazqurjgnxxuozjlr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9meHZhenF1cmpnbnh4dW96amxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTg4ODEsImV4cCI6MjA5MDE5NDg4MX0.Zf2pwQNmxe9wBt7tlZed-ntnLPzm7JGOuqkLuBkv0GE';

const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Элементы
const elements = {
    stepReg:     document.getElementById('step-register'),
    stepLogin:   document.getElementById('step-login'),
    chatScreen:  document.getElementById('chat-screen'),
    messagesDiv: document.getElementById('messages'),
    toastEl:     document.getElementById('toast'),
    badge:       document.getElementById('current-user-badge')
};

let currentUser = null;

const getEmail = (u) => `${u.toLowerCase().trim().replace(/^@/, '')}@lumina.local`;

function showToast(msg, type = '') {
    if (!elements.toastEl) return;
    elements.toastEl.textContent = msg;
    elements.toastEl.className = `toast ${type} show`;
    setTimeout(() => elements.toastEl.classList.remove('show'), 3000);
}

function showScreen(screen) {
    Object.values(elements).forEach(el => {
        if (el && el.classList.contains('auth-container') || el === elements.chatScreen) {
            el.style.display = 'none';
            el.classList.remove('active', 'visible');
        }
    });
    if (!screen) return;
    screen.style.display = (screen === elements.chatScreen) ? 'flex' : 'block';
    screen.classList.add(screen === elements.chatScreen ? 'visible' : 'active');
}

// Безопасное назначение кликов
const bindClick = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.onclick = fn;
};

bindClick('to-login', () => showScreen(elements.stepLogin));
bindClick('to-register', () => showScreen(elements.stepReg));

// РЕГИСТРАЦИЯ
bindClick('btn-do-reg', async () => {
    const btn  = document.getElementById('btn-do-reg');
    const user = document.getElementById('reg-username')?.value.trim().replace(/^@/, '');
    const name = document.getElementById('reg-full-name')?.value.trim();
    const pass = document.getElementById('reg-password')?.value.trim();

    if (!user || !pass) return showToast('Заполните логин и пароль', 'error');
    if (pass.length < 6) return showToast('Пароль минимум 6 символов', 'error');

    btn.disabled = true;
    const { data, error } = await _supabase.auth.signUp({ email: getEmail(user), password: pass });
    btn.disabled = false;

    if (error) return showToast(error.message, 'error');

    // Если email-подтверждение включено — сессии нет, пользователь есть
    if (!data.session) {
        showToast('Отключите "Confirm email" в Supabase Auth → Providers → Email', 'error');
        return;
    }

    currentUser = data.user;
    await _supabase.from('profiles').upsert({
        id: currentUser.id,
        username: user,
        full_name: name || user
    });
    showToast('Профиль создан!', 'success');
    await enterChat(currentUser);
});

// ВХОД
bindClick('btn-do-login', async () => {
    const btn  = document.getElementById('btn-do-login');
    const user = document.getElementById('login-username')?.value.trim().replace(/^@/, '');
    const pass = document.getElementById('login-password')?.value.trim();

    if (!user || !pass) return showToast('Введите логин и пароль', 'error');

    btn.disabled = true;
    const { data, error } = await _supabase.auth.signInWithPassword({ email: getEmail(user), password: pass });
    btn.disabled = false;

    if (error) return showToast('Неверный логин или пароль', 'error');

    currentUser = data.user;
    await enterChat(currentUser);
});

bindClick('btn-logout', async () => {
    await _supabase.auth.signOut();
    currentUser = null;
    elements.messagesDiv.innerHTML = '';
    showScreen(elements.stepReg);
    showToast('Вы вышли');
});

// ЧАТ
async function initChat() {
    if (!elements.messagesDiv) return;
    elements.messagesDiv.innerHTML = '';
    const { data: msgs } = await _supabase.from('messages').select('*, profiles(*)').order('created_at', { ascending: true });
    if (msgs) msgs.forEach(renderMessage);

    _supabase.channel('room1').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (p) => {
        const { data: n } = await _supabase.from('messages').select('*, profiles(*)').eq('id', p.new.id).single();
        if (n) renderMessage(n);
    }).subscribe();
}

function renderMessage(msg) {
    const isOwn = currentUser && msg.user_id === currentUser.id;
    const name = msg.profiles?.full_name || 'Аноним';
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'own' : 'other'}`;
    div.innerHTML = `
        <div class="msg-avatar" style="background:#1a6dff">${name[0].toUpperCase()}</div>
        <div class="msg-bubble">
            ${!isOwn ? `<div style="font-size:10px; color:#00d4ff; font-weight:700;">${name}</div>` : ''}
            <div class="text">${msg.text}</div>
        </div>`;
    elements.messagesDiv.appendChild(div);
    elements.messagesDiv.scrollTop = elements.messagesDiv.scrollHeight;
}

bindClick('btn-send-msg', async () => {
    const input = document.getElementById('message-input');
    const text = input?.value.trim();
    if (!text || !currentUser) return;
    input.value = '';
    await _supabase.from('messages').insert([{ text, user_id: currentUser.id }]);
});

// Инициализация
(async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        const { data: p } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).single();
        if (p) {
            if (elements.badge) elements.badge.textContent = `${p.full_name} (@${p.username})`;
            showScreen(elements.chatScreen);
            initChat();
        }
    }
})();
