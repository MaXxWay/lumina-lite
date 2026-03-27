const SUPABASE_URL = 'https://ofxvazqurjgnxxuozjlr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9meHZhenF1cmpnbnh4dW96amxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTg4ODEsImV4cCI6MjA5MDE5NDg4MX0.Zf2pwQNmxe9wBt7tlZed-ntnLPzm7JGOuqkLuBkv0GE';

const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Ссылки на элементы
const stepReg     = document.getElementById('step-register');
const stepLogin   = document.getElementById('step-login');
const chatScreen  = document.getElementById('chat-screen');
const messagesDiv = document.getElementById('messages');
const toastEl     = document.getElementById('toast');

let currentUser   = null;
let currentProfile = null;
let toastTimer    = null;

// --- Вспомогательные функции ---

function showToast(msg, type = '') {
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.className = `toast ${type} show`;
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

function showScreen(screen) {
    [stepReg, stepLogin, chatScreen].forEach(s => {
        if (!s) return;
        s.style.display = 'none';
        s.classList.remove('active', 'visible');
    });
    if (screen === chatScreen) {
        screen.style.display = 'flex';
        screen.classList.add('visible');
    } else if (screen) {
        screen.style.display = 'block';
        screen.classList.add('active');
    }
}

// Генерация тех. почты
const getVirtualEmail = (username) => `${username.toLowerCase().trim().replace(/^@/, '')}@lumina.local`;

// --- Логика входа и регистрации ---

document.getElementById('to-login').onclick = () => showScreen(stepLogin);
document.getElementById('to-register').onclick = () => showScreen(stepReg);

// РЕГИСТРАЦИЯ
document.getElementById('btn-do-reg').onclick = async () => {
    const userField = document.getElementById('reg-username');
    const nameField = document.getElementById('reg-full-name');
    const passField = document.getElementById('reg-password');

    const username = userField.value.trim().replace(/^@/, '');
    const fullName = nameField.value.trim();
    const password = passField.value.trim();

    if (!username || !password || !fullName) return showToast('Заполните все поля!', 'error');

    const { data, error } = await _supabase.auth.signUp({
        email: getVirtualEmail(username),
        password: password
    });

    if (error) return showToast(error.message, 'error');

    if (data.user) {
        await _supabase.from('profiles').upsert({
            id: data.user.id,
            username: username,
            full_name: fullName
        });
        showToast('Профиль создан! Теперь войдите.', 'success');
        showScreen(stepLogin);
    }
};

// ВХОД
document.getElementById('btn-do-login').onclick = async () => {
    const userField = document.getElementById('login-username'); // Убедись, что в HTML id="login-username"
    const passField = document.getElementById('login-password');

    const username = userField.value.trim().replace(/^@/, '');
    const password = passField.value.trim();

    if (!username || !password) return showToast('Введите логин и пароль', 'error');

    const { data, error } = await _supabase.auth.signInWithPassword({
        email: getVirtualEmail(username),
        password: password
    });

    if (error) return showToast('Ошибка: неверный логин или пароль', 'error');

    currentUser = data.user;
    const { data: p } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    currentProfile = p;
    
    enterChat();
};

function enterChat() {
    if (currentProfile) {
        document.getElementById('current-user-badge').textContent = `${currentProfile.full_name} (@${currentProfile.username})`;
    }
    showScreen(chatScreen);
    initChat();
}

document.getElementById('btn-logout').onclick = async () => {
    await _supabase.auth.signOut();
    location.reload();
};

// --- Работа с чатом ---

async function initChat() {
    messagesDiv.innerHTML = '';
    const { data: msgs } = await _supabase
        .from('messages')
        .select('*, profiles(*)')
        .order('created_at', { ascending: true });

    if (msgs) msgs.forEach(renderMessage);

    _supabase.channel('room1')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
            const { data: newMsg } = await _supabase
                .from('messages')
                .select('*, profiles(*)')
                .eq('id', payload.new.id)
                .single();
            if (newMsg) renderMessage(newMsg);
        })
        .subscribe();
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
        </div>
    `;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text || !currentUser) return;
    input.value = '';
    await _supabase.from('messages').insert([{ text, user_id: currentUser.id }]);
}

document.getElementById('btn-send-msg').onclick = sendMessage;
document.getElementById('message-input').onkeydown = (e) => { if(e.key === 'Enter') sendMessage(); };

// Авто-вход
(async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        const { data: p } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).single();
        if (p) {
            currentProfile = p;
            enterChat();
        }
    }
})();
