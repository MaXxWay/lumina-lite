const authCard = document.getElementById('auth-card');

/**
 * Шаблон для экрана регистрации
 */
const registrationHTML = `
    <div class="fade-in">
        <div class="header">
            <h1>Lumina<sup>Lite</sup></h1>
            <p>Создайте аккаунт, чтобы начать общение</p>
        </div>
        <form id="regForm">
            <div class="input-group">
                <label>Имя пользователя</label>
                <input type="text" id="username" placeholder="user123" required>
            </div>
            <div class="input-group">
                <label>Email</label>
                <input type="email" id="email" placeholder="example@mail.com" required>
            </div>
            <div class="input-group">
                <label>Пароль</label>
                <input type="password" id="password" placeholder="не менее 6 символов" minlength="6" required>
            </div>
            <button type="submit" class="btn-submit">
                <span class="btn-text">Зарегистрироваться</span>
                <span class="btn-shine"></span>
            </button>
        </form>
        <div class="footer">
            Уже есть аккаунт? <span class="auth-toggle-link" onclick="showLogin()">Войти</span>
        </div>
    </div>
`;

/**
 * Шаблон для экрана входа
 */
const loginHTML = `
    <div class="fade-in">
        <div class="header">
            <h1>Lumina<sup>Lite</sup></h1>
            <p>С возвращением в систему</p>
        </div>
        <form id="loginForm">
            <div class="input-group">
                <label>Логин или Email</label>
                <input type="text" id="login-id" placeholder="user123" required>
            </div>
            <div class="input-group">
                <label>Пароль</label>
                <input type="password" id="login-pass" placeholder="••••••••" required>
            </div>
            <button type="submit" class="btn-submit">
                <span class="btn-text">Войти</span>
                <span class="btn-shine"></span>
            </button>
        </form>
        <div class="footer">
            Нет аккаунта? <span class="auth-toggle-link" onclick="showRegistration()">Создать</span>
        </div>
    </div>
`;

// Функция отображения регистрации
function showRegistration() {
    authCard.innerHTML = registrationHTML;
    attachFormEvents('regForm');
}

// Функция отображения входа
function showLogin() {
    authCard.innerHTML = loginHTML;
    attachFormEvents('loginForm');
}

// Универсальный обработчик для отправки форм
function attachFormEvents(formId) {
    const form = document.getElementById(formId);
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const action = formId === 'regForm' ? 'Регистрация' : 'Вход';
        
        // Здесь в будущем будет запрос к серверу
        console.log(`Запрос: ${action} Lumina Lite`);
        alert(`Попытка выполнения: ${action}. Бэкенд пока не подключен.`);
    });
}

// Запуск при открытии страницы
document.addEventListener('DOMContentLoaded', () => {
    showRegistration();
});