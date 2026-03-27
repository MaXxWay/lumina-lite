const SUPABASE_URL = 'https://ofxvazqurjgnxxuozjlr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9meHZhenF1cmpnbnh4dW96amxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTg4ODEsImV4cCI6MjA5MDE5NDg4MX0.Zf2pwQNmxe9wBt7tlZed-ntnLPzm7JGOuqkLuBkv0GE';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;

const getEmail = (u) => `${u.toLowerCase().trim().replace(/^@/, '')}@lumina.local`;

// Элементы
const screens = {
    reg: document.getElementById('step-register'),
    login: document.getElementById('step-login'),
    chat: document.getElementById('chat-screen')
};

// Функция переключения экранов с учетом Flex
function showScreen(screenKey) {
    // Скрываем все и убираем активные классы
    Object.values(screens).forEach(s => {
        if(s) {
            s.style.display = 'none';
            s.classList.remove('active', 'visible');
        }
    });

    const target = screens[screenKey];
    if (target) {
        if (screenKey === 'chat') {
            target.style.display = 'flex'; // Чат всегда flex
            target.classList.add('visible');
        } else {
            target.style.display = 'flex'; // Вход тоже flex для центрирования
            target.classList.add('active');
        }
    }
}

// Навигация
document.getElementById('to-login').onclick = () => showScreen('login');
const toRegView = document.getElementById('to-register-view');
if(toRegView) toRegView.onclick = () => showScreen('reg');

// Регистрация
document.getElementById('btn-do-reg').onclick = async () => {
    const user = document.getElementById('reg-username').value.trim();
    const pass = document.getElementById('reg-password').value.trim();
    const name = document.getElementById('reg-full-name').value.trim();

    const { data, error } = await _supabase.auth.signUp({ email: getEmail(user), password: pass });
    if (error) return alert(error.message);

    if (data.user) {
        await _supabase.from('profiles').upsert({ id: data.user.id, username: user, full_name: name || user });
        location.reload(); 
    }
};

// Вход
document.getElementById('btn-do-login').onclick = async () => {
    const user = document.getElementById('login-username').value.trim();
    const pass = document.getElementById('login-password').value.trim();
    const { error } = await _supabase.auth.signInWithPassword({ email: getEmail(user), password: pass });
    if (error) alert("Ошибка входа");
    else location.reload();
};

// Выход
document.getElementById('btn-logout').onclick = async () => {
    await _supabase.auth.signOut();
    location.reload();
};

// Чат
async function initChat() {
    const { data: msgs } = await _supabase.from('messages').select('*, profiles(*)').order('created_at', { ascending: true });
    if (msgs) msgs.forEach(render);

    _supabase.channel('public').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (p) => {
        const { data: n } = await _supabase.from('messages').select('*, profiles(*)').eq('id', p.new.id).single();
        if (n) render(n);
    }).subscribe();
}

function render(msg) {
    const isOwn = currentUser && msg.user_id === currentUser.id;
    const name = msg.profiles?.full_name || 'User';
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'own' : 'other'}`;
    
    div.innerHTML = `
        <div class="msg-avatar" style="background:${isOwn ? '#0072ff' : '#1e293b'}">${name[0].toUpperCase()}</div>
        <div class="msg-bubble">
            ${!isOwn ? `<div style="font-size:10px; color:#00c6ff; font-weight:800; margin-bottom:4px;">${name}</div>` : ''}
            <div class="text">${msg.text}</div>
        </div>`;
    
    const container = document.getElementById('messages');
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

const sendMsg = async () => {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    
    if (!text) return;
    if (!currentUser) {
        alert("Вы не авторизованы!");
        return;
    }

    // Очищаем поле сразу для скорости интерфейса
    input.value = '';

    const { data, error } = await _supabase
        .from('messages')
        .insert([{ 
            text: text, 
            user_id: currentUser.id 
        }]);

    if (error) {
        console.error("Ошибка отправки:", error);
        alert("Ошибка: " + error.message);
    } else {
        console.log("Сообщение отправлено!");
    }
};

document.getElementById('btn-send-msg').onclick = sendMsg;
document.getElementById('message-input').onkeydown = (e) => { if(e.key === 'Enter') sendMsg(); };

// Фикс для мобильного DVH (высота экрана без панелей Safari)
function updateDvh() {
    document.documentElement.style.setProperty('--dvh', `${window.innerHeight}px`);
}
window.addEventListener('resize', updateDvh);
updateDvh();

// Запуск
(async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        const { data: p } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).single();
        if (p) document.getElementById('current-user-badge').textContent = p.full_name;
        showScreen('chat');
        initChat();
    } else {
        showScreen('reg');
    }
})();
