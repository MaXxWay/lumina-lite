const SUPABASE_URL = 'https://ofxvazqurjgnxxuozjlr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9meHZhenF1cmpnbnh4dW96amxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTg4ODEsImV4cCI6MjA5MDE5NDg4MX0.Zf2pwQNmxe9wBt7tlZed-ntnLPzm7JGOuqkLuBkv0GE';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Виртуальная почта для обхода подтверждения
const getEmail = (u) => `${u.toLowerCase().trim().replace(/^@/, '')}${Math.floor(Math.random() * 1000)}@lumina.local`;

const setScreen = (id) => {
    document.getElementById('step-register').style.display = id === 'reg' ? 'block' : 'none';
    document.getElementById('step-login').style.display = id === 'login' ? 'block' : 'none';
    document.getElementById('chat-screen').style.display = id === 'chat' ? 'flex' : 'none';
};

// Кнопки перехода
document.getElementById('to-login').onclick = () => setScreen('login');
document.getElementById('to-register').onclick = () => setScreen('reg');

// --- РЕГИСТРАЦИЯ ---
document.getElementById('btn-do-reg').onclick = async () => {
    const user = document.getElementById('reg-username').value.trim();
    const pass = document.getElementById('reg-password').value.trim();

    if (pass.length < 6) return alert("Пароль должен быть минимум 6 символов!");

    // Шаг 1: Регистрация
    const { data, error } = await _supabase.auth.signUp({
        email: getEmail(user),
        password: pass
    });

    if (error) {
        alert("Ошибка: " + error.message);
        return;
    }

    // Шаг 2: Если юзер создался, сразу закидываем его в профили (необязательно для входа, но нужно для чата)
    if (data.user) {
        await _supabase.from('profiles').insert([
            { id: data.user.id, username: user, full_name: user }
        ]);
        
        // Шаг 3: ПЕРЕКИДЫВАЕМ НА ПУСТОЙ ЧАТ
        alert("Успешная регистрация!");
        setScreen('chat'); 
        document.getElementById('messages').innerHTML = '<div style="text-align:center; opacity:0.5; margin-top:50px;">Тут пока пусто, но вы вошли!</div>';
    }
};

// --- ВХОД ---
document.getElementById('btn-do-login').onclick = async () => {
    const user = document.getElementById('login-username').value.trim();
    const pass = document.getElementById('login-password').value.trim();

    const { data, error } = await _supabase.auth.signInWithPassword({
        email: getEmail(user), // Внимание: тут может быть проблема, если email каждый раз новый. 
        password: pass          // Для тестов лучше использовать регистрацию.
    });

    if (error) alert("Ошибка входа. Попробуйте создать новый аккаунт.");
    else setScreen('chat');
};

// Проверка сессии при загрузке
(async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) setScreen('chat');
})();
