const { createClient } = supabase;

// !!! ЗАМЕНИ ЭТИ ДАННЫЕ НА СВОИ ИЗ НАСТРОЕК SUPABASE !!!
const SUPABASE_URL = 'https://ofxvazqurjgnxxuozjlr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9meHZhenF1cmpnbnh4dW96amxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTg4ODEsImV4cCI6MjA5MDE5NDg4MX0.Zf2pwQNmxe9wBt7tlZed-ntnLPzm7JGOuqkLuBkv0GE';

const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const authContainer = document.getElementById('auth-container');
const chatContainer = document.getElementById('chat-container');
const messageForm = document.getElementById('message-form');
const messagesDiv = document.getElementById('messages');

// Вход и Автоматическая Регистрация
async function handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const loginButton = document.querySelector('.glass-button.primary');

    if (!email || !password) {
        alert("Пожалуйста, заполните Email и Пароль.");
        return;
    }

    loginButton.innerText = "Подключаемся...";
    loginButton.disabled = true;

    // Пытаемся войти
    const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
        // Если пользователя нет — регистрируем
        const { error: signUpError } = await _supabase.auth.signUp({ email, password });
        if (signUpError) {
            alert("Ошибка: " + signUpError.message);
            loginButton.innerText = "Войти или Создать";
            loginButton.disabled = false;
        }
        else {
            alert('Lumina Lite приветствует нового пользователя! Пожалуйста, нажмите "Войти" еще раз для подтверждения.');
            loginButton.innerText = "Подтвердить Вход";
            loginButton.disabled = false;
        }
    } else {
        // Успешный вход
        showChat();
    }
}

function showChat() {
    authContainer.style.display = 'none';
    chatContainer.style.display = 'flex'; // Используем flex для Liquid Glass
    addStatusMessage('Подключено к Lumina.Lite');
    loadMessages();
    subscribeToMessages();
}

// Загрузка истории
async function loadMessages() {
    const { data } = await _supabase.from('messages').select('*').order('created_at', { ascending: true });
    if (data) data.forEach(msg => appendMessage(msg));
}

// Слушаем новые сообщения (Realtime)
function subscribeToMessages() {
    _supabase.channel('public:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        appendMessage(payload.new);
    })
    .subscribe();
}

function appendMessage(msg) {
    const div = document.createElement('div');
    div.className = 'message';
    div.innerText = msg.text;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addStatusMessage(text) {
    const div = document.createElement('div');
    div.className = 'message status-msg';
    div.style.alignSelf = 'center';
    div.style.background = 'transparent';
    div.style.color = 'rgba(255,255,255,0.4)';
    div.style.fontSize = '0.8rem';
    div.style.border = 'none';
    div.innerText = text;
    messagesDiv.appendChild(div);
}

// Отправка
messageForm.onsubmit = async (e) => {
    e.preventDefault();
    const input = document.getElementById('message-input');
    if (!input.value) return;

    // Supabase автоматически добавит ID вошедшего пользователя (через Default Value в базе)
    await _supabase.from('messages').insert([{ text: input.value }]);
    input.value = '';
};
