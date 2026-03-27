// ВНИМАНИЕ: Вставь свои данные здесь снова!
const SUPABASE_URL = 'https://ofxvazqurjgnxxuozjlr.supabase.co';
const SUPABASE_ANON_KEY = 'ВСТАВЬ_СВОЙ_ANON_KEY_СЮДА';

const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Элементы интерфейса
const stepEmail = document.getElementById('step-email');
const stepPassword = document.getElementById('step-password');
const chatContainer = document.getElementById('chat-container');
const displayEmail = document.getElementById('display-email');
const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('message-form');

// Кнопки
const btnNext = document.getElementById('btn-next');
const btnLogin = document.getElementById('btn-login');
const btnBack = document.getElementById('btn-back');

let currentEmail = '';

// ЛОГИКА АВТОРИЗАЦИИ (Telegram Style)

// Этап 1: Ввод почты и нажатие "Далее"
btnNext.onclick = () => {
    currentEmail = document.getElementById('email').value.trim();
    if (!currentEmail || !currentEmail.includes('@')) {
        return alert('Введите корректный Email');
    }
    
    displayEmail.textContent = currentEmail;
    
    // Переключаем окна
    stepEmail.classList.remove('active');
    setTimeout(() => stepPassword.classList.add('active'), 200);
    document.getElementById('password').focus();
};

// Этап 2: Попытка входа / Регистрации
btnLogin.onclick = async () => {
    const password = document.getElementById('password').value;
    if (!password) return alert('Введите пароль');
    
    btnLogin.textContent = 'Вход...';
    btnLogin.disabled = true;

    // Сначала пробуем войти
    const { data, error } = await _supabase.auth.signInWithPassword({ email: currentEmail, password });
    
    if (error) {
        // Если ошибка входа, пробуем зарегистрировать
        const { error: regError } = await _supabase.auth.signUp({ email: currentEmail, password });
        
        if (regError) {
            alert(regError.message);
            btnLogin.textContent = 'Войти';
            btnLogin.disabled = false;
            return;
        }
        
        // Регистрация успешна, но в Supabase без подтверждения почты войти сразу нельзя
        // (если ты не выключил это в настройках Supabase Auth)
        alert("Новый пользователь создан! Теперь нажмите 'Войти' с этим паролем.");
        btnLogin.textContent = 'Войти';
        btnLogin.disabled = false;
        return;
        
    } else {
        // УСПЕШНЫЙ ВХОД
        stepPassword.classList.remove('active');
        setTimeout(() => {
            chatContainer.style.display = 'flex';
            initChat();
        }, 300);
    }
};

// Кнопка назад
btnBack.onclick = () => {
    stepPassword.classList.remove('active');
    setTimeout(() => stepEmail.classList.add('active'), 200);
};

// ЛОГИКА ЧАТА

async function initChat() {
    // 1. Загружаем старые сообщения
    const { data } = await _supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true });
    
    if (data) data.forEach(appendMessage);
    
    // 2. Подписываемся на новые в реальном времени
    _supabase
        .channel('public:messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            appendMessage(payload.new);
        })
        .subscribe();
}

// Отправка сообщения
messageForm.onsubmit = async (e) => {
    e.preventDefault();
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text) return;
    
    // Мы не вставляем author вручную, это делает SQL триггер в Supabase
    const { error } = await _supabase.from('messages').insert([{ text }]);
    
    if (error) alert('Ошибка отправки: ' + error.message);
    input.value = '';
};

// Отображение сообщения в списке
function appendMessage(msg) {
    const div = document.createElement('div');
    div.className = 'message';
    
    const name = msg.user_email ? msg.user_email.split('@')[0] : 'User';
    
    div.innerHTML = `<span class="msg-author">${name}</span>${msg.text}`;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
