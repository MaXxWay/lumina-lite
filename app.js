const SUPABASE_URL = 'https://ofxvazqurjgnxxuozjlr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9meHZhenF1cmpnbnh4dW96amxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTg4ODEsImV4cCI6MjA5MDE5NDg4MX0.Zf2pwQNmxe9wBt7tlZed-ntnLPzm7JGOuqkLuBkv0GE';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let currentProfile = null;
let realtimeChannel = null;

const getEmail = (u) => `${u.toLowerCase().trim().replace(/^@/, '')}@lumina.local`;

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
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(() => { t.className = 'toast'; }, 3000);
}

// ─── Навигация авторизации ───────────────────────────────
document.getElementById('to-login').onclick    = () => showScreen('login');
document.getElementById('to-register').onclick = () => showScreen('reg');

// ─── Регистрация ─────────────────────────────────────────
document.getElementById('btn-do-reg').onclick = async () => {
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

document.getElementById('reg-password').onkeydown = (e) => {
    if (e.key === 'Enter') document.getElementById('btn-do-reg').click();
};

// ─── Вход ────────────────────────────────────────────────
document.getElementById('btn-do-login').onclick = async () => {
    const user = document.getElementById('login-username').value.trim();
    const pass = document.getElementById('login-password').value.trim();
    const { data, error } = await _supabase.auth.signInWithPassword({ email: getEmail(user), password: pass });
    if (error) return showToast('Ошибка входа: ' + error.message, true);

    // Сразу заходим без перезагрузки
    currentUser = data.user;
    const { data: p } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    currentProfile = p;
    if (p) document.getElementById('current-user-badge').textContent = p.full_name;
    showScreen('chat');
    initChat();
};

document.getElementById('login-password').onkeydown = (e) => {
    if (e.key === 'Enter') document.getElementById('btn-do-login').click();
};

// ─── Выход ───────────────────────────────────────────────
document.getElementById('btn-logout').onclick = async () => {
    if (realtimeChannel) _supabase.removeChannel(realtimeChannel);
    await _supabase.auth.signOut();
    currentUser = null;
    currentProfile = null;
    showScreen('reg');
};

// ─── Профиль — открыть ──────────────────────────────────
document.getElementById('btn-profile').onclick = () => {
    if (!currentProfile) return;
    const letter = (currentProfile.full_name || '?')[0].toUpperCase();
    document.getElementById('profile-avatar-letter').textContent = letter;
    document.getElementById('profile-fullname').value = currentProfile.full_name || '';
    document.getElementById('profile-username').value = currentProfile.username || '';
    document.getElementById('profile-bio').value       = currentProfile.bio || '';
    showScreen('profile');
};

// ─── Профиль — назад ────────────────────────────────────
document.getElementById('btn-profile-back').onclick = () => showScreen('chat');

// ─── Профиль — выйти (кнопка на экране профиля) ─────────
document.getElementById('btn-logout-profile').onclick = () => {
    document.getElementById('btn-logout').click();
};

// ─── Профиль — сохранить ────────────────────────────────
document.getElementById('btn-save-profile').onclick = async () => {
    const full_name = document.getElementById('profile-fullname').value.trim();
    const bio       = document.getElementById('profile-bio').value.trim();
    if (!full_name) return showToast('Имя не может быть пустым', true);

    const { error } = await _supabase.from('profiles')
        .update({ full_name, bio })
        .eq('id', currentUser.id);

    if (error) return showToast('Ошибка сохранения', true);

    currentProfile.full_name = full_name;
    currentProfile.bio = bio;
    document.getElementById('current-user-badge').textContent = full_name;
    document.getElementById('profile-avatar-letter').textContent = full_name[0].toUpperCase();
    showToast('Профиль сохранён ✓');
    setTimeout(() => showScreen('chat'), 800);
};

// ─── Рендер сообщения ────────────────────────────────────
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function render(msg) {
    const container = document.getElementById('messages');

    // Убираем заглушку "Начните переписку"
    const stub = container.querySelector('.msg-stub');
    if (stub) stub.remove();

    const isOwn  = currentUser && msg.user_id === currentUser.id;
    const name   = msg.profiles?.full_name || 'User';
    const avatar = name[0].toUpperCase();
    const timeStr = new Date(msg.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });

    const div = document.createElement('div');
    div.className   = `message ${isOwn ? 'own' : 'other'}`;
    div.dataset.id  = msg.id;
    div.innerHTML   = `
        <div class="msg-avatar" style="background:${isOwn ? '#0072ff' : '#1e293b'}">${avatar}</div>
        <div class="msg-bubble">
            ${!isOwn ? `<div class="msg-sender">${escapeHtml(name)}</div>` : ''}
            <div class="text">${escapeHtml(msg.text)}</div>
            <div class="msg-time">${timeStr}</div>
        </div>`;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ─── Инициализация чата ──────────────────────────────────
async function initChat() {
    const container = document.getElementById('messages');
    container.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:20px;font-size:13px;">Загрузка...</div>';

    const { data: msgs } = await _supabase
        .from('messages')
        .select('*, profiles!messages_user_id_fkey(*)')
        .order('created_at', { ascending: true })
        .limit(100);

    container.innerHTML = '';

    if (msgs && msgs.length > 0) {
        msgs.forEach(render);
    } else {
        container.innerHTML = '<div class="msg-stub" style="text-align:center;color:var(--text-dim);padding:20px;font-size:13px;">Начните переписку</div>';
    }

    // Realtime подписка
    if (realtimeChannel) _supabase.removeChannel(realtimeChannel);

    realtimeChannel = _supabase
        .channel('messages-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
            if (document.querySelector(`[data-id="${payload.new.id}"]`)) return;
            const { data: n } = await _supabase
                .from('messages')
                .select('*, profiles!messages_user_id_fkey(*)')
                .eq('id', payload.new.id)
                .single();
            if (n) render(n);
        })
        .subscribe();
}

// ─── Отправка ────────────────────────────────────────────
const sendMsg = async () => {
    const input = document.getElementById('message-input');
    const text  = input.value.trim();
    if (!text || !currentUser) return;
    
    input.value = ''; // Очищаем поле сразу для плавности

    // Упрощаем запрос, чтобы он не падал из-за отсутствия связей в БД
    const { data, error } = await _supabase
        .from('messages')
        .insert([{ text, user_id: currentUser.id }])
        .select() 
        .single();

    if (error) {
        console.error('Ошибка Supabase:', error); // Посмотри в консоль F12, если не сработает
        showToast('Ошибка отправки', true);
        input.value = text;
    } else {
        // Добавляем данные текущего профиля вручную для мгновенного рендера
        const msgWithProfile = { ...data, profiles: currentProfile };
        if (!document.querySelector(`[data-id="${data.id}"]`)) {
            render(msgWithProfile);
        }
    }
};
// ─── DVH фикс (Safari) ──────────────────────────────────
function updateDvh() {
    document.documentElement.style.setProperty('--dvh', `${window.innerHeight}px`);
}
window.addEventListener('resize', updateDvh);
updateDvh();

// ─── Запуск: проверяем сессию ────────────────────────────
(async () => {
    const { data: { session } } = await _supabase.auth.getSession();

    if (session) {
        // Уже залогинен — сразу в чат, минуя экраны входа
        currentUser = session.user;
        const { data: p } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).single();
        currentProfile = p;
        if (p) document.getElementById('current-user-badge').textContent = p.full_name;
        showScreen('chat');
        initChat();
    } else {
        showScreen('reg');
    }
})();
