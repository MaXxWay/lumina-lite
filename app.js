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

const regPassword = document.getElementById('reg-password');
if (regPassword) {
    regPassword.onkeydown = (e) => {
        if (e.key === 'Enter') document.getElementById('btn-do-reg').click();
    };
}

// ─── Вход ────────────────────────────────────────────────
document.getElementById('btn-do-login').onclick = async () => {
    const user = document.getElementById('login-username').value.trim();
    const pass = document.getElementById('login-password').value.trim();
    const { data, error } = await _supabase.auth.signInWithPassword({ email: getEmail(user), password: pass });
    if (error) return showToast('Ошибка входа: ' + error.message, true);

    currentUser = data.user;
    
    // Загружаем профиль
    const { data: p } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    currentProfile = p;
    
    if (p) {
        const badge = document.getElementById('current-user-badge');
        if (badge) badge.textContent = p.full_name;
    }
    
    showScreen('chat');
    initChat();
};

const loginPassword = document.getElementById('login-password');
if (loginPassword) {
    loginPassword.onkeydown = (e) => {
        if (e.key === 'Enter') document.getElementById('btn-do-login').click();
    };
}

// ─── Выход ───────────────────────────────────────────────
const logoutBtn = document.getElementById('btn-logout');
if (logoutBtn) {
    logoutBtn.onclick = async () => {
        if (realtimeChannel) await _supabase.removeChannel(realtimeChannel);
        await _supabase.auth.signOut();
        currentUser = null;
        currentProfile = null;
        showScreen('reg');
    };
}

// ─── Профиль — открыть ──────────────────────────────────
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

// ─── Профиль — назад ────────────────────────────────────
const profileBackBtn = document.getElementById('btn-profile-back');
if (profileBackBtn) profileBackBtn.onclick = () => showScreen('chat');

// ─── Профиль — выйти ────────────────────────────────────
const profileLogoutBtn = document.getElementById('btn-logout-profile');
if (profileLogoutBtn) {
    profileLogoutBtn.onclick = async () => {
        if (realtimeChannel) await _supabase.removeChannel(realtimeChannel);
        await _supabase.auth.signOut();
        currentUser = null;
        currentProfile = null;
        showScreen('reg');
    };
}

// ─── Профиль — сохранить ────────────────────────────────
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
    if (!container) return;

    // Убираем заглушку "Начните переписку"
    const stub = container.querySelector('.msg-stub');
    if (stub) stub.remove();

    const isOwn = currentUser && msg.user_id === currentUser.id;
    // Получаем имя автора из profiles или из currentProfile
    let name = 'Пользователь';
    if (msg.profiles && msg.profiles.full_name) {
        name = msg.profiles.full_name;
    } else if (isOwn && currentProfile && currentProfile.full_name) {
        name = currentProfile.full_name;
    } else if (msg.user_id === currentUser?.id && currentProfile?.full_name) {
        name = currentProfile.full_name;
    }
    
    const avatar = name[0].toUpperCase();
    const timeStr = new Date(msg.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });

    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'own' : 'other'}`;
    div.dataset.id = msg.id;
    div.innerHTML = `
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
    if (!container) return;
    
    container.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:20px;font-size:13px;">Загрузка...</div>';

    try {
        // Исправленный запрос - убираем сложный синтаксис foreign key
        const { data: msgs, error } = await _supabase
            .from('messages')
            .select(`
                *,
                profiles:user_id (
                    full_name,
                    username
                )
            `)
            .order('created_at', { ascending: true })
            .limit(100);

        if (error) {
            console.error('Ошибка загрузки сообщений:', error);
            container.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:20px;font-size:13px;">Ошибка загрузки сообщений</div>';
            return;
        }

        container.innerHTML = '';

        if (msgs && msgs.length > 0) {
            msgs.forEach(msg => {
                // Преобразуем данные для корректного рендера
                if (msg.profiles && Array.isArray(msg.profiles)) {
                    msg.profiles = msg.profiles[0];
                }
                render(msg);
            });
        } else {
            container.innerHTML = '<div class="msg-stub" style="text-align:center;color:var(--text-dim);padding:20px;font-size:13px;">Начните переписку</div>';
        }
    } catch (err) {
        console.error('Ошибка в initChat:', err);
        container.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:20px;font-size:13px;">Ошибка загрузки</div>';
    }

    // Realtime подписка
    if (realtimeChannel) {
        await _supabase.removeChannel(realtimeChannel);
    }

    realtimeChannel = _supabase
        .channel('messages-channel')
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'messages' }, 
            async (payload) => {
                // Проверяем, нет ли уже такого сообщения
                if (document.querySelector(`[data-id="${payload.new.id}"]`)) return;
                
                // Загружаем полные данные сообщения с профилем
                const { data: msg, error } = await _supabase
                    .from('messages')
                    .select(`
                        *,
                        profiles:user_id (
                            full_name,
                            username
                        )
                    `)
                    .eq('id', payload.new.id)
                    .single();
                
                if (msg && !error) {
                    if (msg.profiles && Array.isArray(msg.profiles)) {
                        msg.profiles = msg.profiles[0];
                    }
                    render(msg);
                } else if (payload.new) {
                    // Если не удалось загрузить профиль, показываем без него
                    render(payload.new);
                }
            }
        )
        .subscribe();
}

// ─── Отправка сообщения ─────────────────────────────────
async function sendMsg() {
    const input = document.getElementById('message-input');
    if (!input) return;
    
    const text = input.value.trim();
    if (!text || !currentUser) return;
    
    input.value = ''; // Очищаем поле сразу для плавности

    const { data, error } = await _supabase
        .from('messages')
        .insert([{ text, user_id: currentUser.id }])
        .select()
        .single();

    if (error) {
        console.error('Ошибка отправки:', error);
        showToast('Ошибка отправки: ' + error.message, true);
        input.value = text;
    } else {
        // Добавляем данные текущего профиля для мгновенного рендера
        const msgWithProfile = { 
            ...data, 
            profiles: currentProfile 
        };
        render(msgWithProfile);
    }
}

// Привязываем кнопку отправки
const sendBtn = document.getElementById('btn-send-msg');
if (sendBtn) {
    sendBtn.onclick = sendMsg;
}

// Привязываем Enter в поле ввода
const messageInput = document.getElementById('message-input');
if (messageInput) {
    messageInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMsg();
        }
    };
}

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
        currentUser = session.user;
        const { data: p } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).single();
        currentProfile = p;
        if (p) {
            const badge = document.getElementById('current-user-badge');
            if (badge) badge.textContent = p.full_name;
        }
        showScreen('chat');
        initChat();
    } else {
        showScreen('reg');
    }
})();
