// auth.js — регистрация и вход по OTP-коду

const screens = {
    reg: document.getElementById('step-register'),
    login: document.getElementById('step-login'),
    chat: document.getElementById('chat-screen'),
    profile: document.getElementById('profile-screen')
};

let pendingRegistration = null;
let currentLoginEmail = '';
let otpTimer = null;
let otpSecondsLeft = 0;

function hideLoader() {
    const loader = document.getElementById('app-loader');
    if (loader) {
        loader.classList.add('hidden');
        setTimeout(() => loader.remove(), 600);
    }
}

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
    
    if (key === 'login') resetLoginForm();
    if (key === 'reg') resetRegForm();
}

function resetLoginForm() {
    const stepEmail = document.getElementById('login-step-email');
    const stepCode = document.getElementById('login-step-code');
    const emailInput = document.getElementById('login-email');
    if (stepEmail) stepEmail.style.display = 'block';
    if (stepCode) stepCode.style.display = 'none';
    if (emailInput) emailInput.value = '';
    clearOtpInputs();
    currentLoginEmail = '';
    if (otpTimer) { clearInterval(otpTimer); otpTimer = null; }
}

function resetRegForm() {
    const stepForm = document.getElementById('reg-step-form');
    const stepCode = document.getElementById('reg-step-code');
    if (stepForm) stepForm.style.display = 'block';
    if (stepCode) stepCode.style.display = 'none';
    document.getElementById('reg-username').value = '';
    document.getElementById('reg-full-name').value = '';
    document.getElementById('reg-email').value = '';
    clearOtpInputs();
    pendingRegistration = null;
    if (otpTimer) { clearInterval(otpTimer); otpTimer = null; }
}

function clearOtpInputs() {
    for (let i = 1; i <= 6; i++) {
        const input = document.getElementById(`otp-${i}`);
        if (input) {
            input.value = '';
        }
    }
}

function getOtpCode() {
    let code = '';
    for (let i = 1; i <= 6; i++) {
        const input = document.getElementById(`otp-${i}`);
        if (input) code += input.value;
    }
    return code;
}

function setupOtpInputs() {
    const inputs = [];
    for (let i = 1; i <= 6; i++) {
        const el = document.getElementById(`otp-${i}`);
        if (el) el.disabled = false;
        inputs.push(el);
    }
    
    inputs.forEach((input, index) => {
        if (!input) return;
        
        // При фокусе выделяем текст
        input.addEventListener('focus', (e) => {
            e.target.select();
        });
        
        // Обработчик ввода
        input.addEventListener('input', (e) => {
            // Оставляем только цифры
            const cleanValue = e.target.value.replace(/\D/g, '');
            e.target.value = cleanValue;
            
            // Если ввели цифру — переходим на следующее поле
            if (cleanValue && index < 5) {
                inputs[index + 1].focus();
            }
            
            // Проверяем, все ли поля заполнены
            const code = getOtpCode();
            if (code.length === 6) {
                setTimeout(() => {
                    if (pendingRegistration) {
                        verifyRegCode();
                    } else {
                        verifyCode();
                    }
                }, 100);
            }
        });
        
        // Обработчик клавиш
        input.addEventListener('keydown', (e) => {
            // Backspace на пустом поле — переход назад и очистка
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                inputs[index - 1].focus();
                inputs[index - 1].value = '';
                e.preventDefault();
            }
            
            // Стрелка влево
            if (e.key === 'ArrowLeft' && index > 0) {
                inputs[index - 1].focus();
                e.preventDefault();
            }
            
            // Стрелка вправо
            if (e.key === 'ArrowRight' && index < 5) {
                inputs[index + 1].focus();
                e.preventDefault();
            }
        });
        
        // Обработчик вставки из буфера
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const paste = (e.clipboardData || window.clipboardData).getData('text');
            const digits = paste.replace(/\D/g, '').slice(0, 6).split('');
            
            // Заполняем поля
            digits.forEach((digit, i) => {
                if (inputs[i]) inputs[i].value = digit;
            });
            
            // Фокус на последнее заполненное
            const lastIndex = Math.min(digits.length, 5);
            if (inputs[lastIndex]) inputs[lastIndex].focus();
            
            // Проверяем заполненность
            if (digits.length === 6) {
                setTimeout(() => {
                    if (pendingRegistration) {
                        verifyRegCode();
                    } else {
                        verifyCode();
                    }
                }, 100);
            }
        });
    });
}

// Экспортируем getOtpCode глобально
window.getOtpCode = getOtpCode;

async function logout() {
    if (window.onlineInterval) clearInterval(window.onlineInterval);
    if (window.realtimeChannel) await supabaseClient.removeChannel(window.realtimeChannel);
    if (window.statusSubscription) await supabaseClient.removeChannel(window.statusSubscription);
    if (window.typingChannel) await supabaseClient.removeChannel(window.typingChannel);
    if (window.deletionChannel) await supabaseClient.removeChannel(window.deletionChannel);
    window.messagesCache?.clear();
    window.dialogCache?.clear();
    window.observedMessages?.clear();
    if (window.readStatusObservers) {
        window.readStatusObservers.observer?.disconnect();
        window.readStatusObservers.mutationObserver?.disconnect();
    }
    await supabaseClient.auth.signOut();
    window.currentUser = null;
    window.currentProfile = null;
    window.currentChat = null;
    showScreen('login');
}

function initAuth() {
    setupOtpInputs();
    
    document.getElementById('to-login')?.addEventListener('click', () => showScreen('login'));
    document.getElementById('to-register')?.addEventListener('click', () => showScreen('reg'));
    document.getElementById('btn-change-email-login')?.addEventListener('click', resetLoginForm);
    document.getElementById('btn-change-email-reg')?.addEventListener('click', resetRegForm);
    document.getElementById('btn-profile-back')?.addEventListener('click', () => showScreen('chat'));
    document.getElementById('btn-cancel-edit-profile')?.addEventListener('click', () => {
        document.getElementById('profile-view-mode').style.display = 'block';
        document.getElementById('profile-edit-mode').style.display = 'none';
    });

    // Регистрация
    const regBtn = document.getElementById('btn-do-reg');
    if (regBtn) {
        regBtn.onclick = async () => {
            const username = document.getElementById('reg-username').value.trim();
            const fullName = document.getElementById('reg-full-name').value.trim();
            const email = document.getElementById('reg-email').value.trim();

            if (!username || !email || !fullName) return showToast('Заполните все поля', true);
            if (!isValidEmail(email)) return showToast('Введите корректный email', true);

            regBtn.disabled = true;
            regBtn.textContent = 'Отправка...';

            try {
                const { error } = await supabaseClient.auth.signInWithOtp({
                    email: email,
                    options: { shouldCreateUser: false }
                });

                if (error && !error.message.includes('user not found')) throw error;

                pendingRegistration = { email, username: username.replace(/^@/, ''), fullName };

                document.getElementById('reg-step-form').style.display = 'none';
                document.getElementById('reg-step-code').style.display = 'block';
                document.getElementById('reg-code-email-display').textContent = email;
                
                clearOtpInputs();
                document.getElementById('otp-1')?.focus();
                
                showToast('📧 Код отправлен!');
                startResendTimer('reg');
            } catch (error) {
                showToast('Ошибка: ' + error.message, true);
            } finally {
                regBtn.disabled = false;
                regBtn.textContent = 'Зарегистрироваться';
            }
        };
    }

    document.getElementById('btn-verify-reg-code')?.addEventListener('click', verifyRegCode);

    // Вход
    const sendCodeBtn = document.getElementById('btn-send-code');
    if (sendCodeBtn) {
        sendCodeBtn.onclick = async () => {
            const email = document.getElementById('login-email').value.trim();
            if (!email || !isValidEmail(email)) return showToast('Введите корректный email', true);

            currentLoginEmail = email;
            sendCodeBtn.disabled = true;
            sendCodeBtn.textContent = 'Отправка...';

            try {
                const { error } = await supabaseClient.auth.signInWithOtp({
                    email: email,
                    options: { shouldCreateUser: false }
                });
                if (error) throw error;

                document.getElementById('login-step-email').style.display = 'none';
                document.getElementById('login-step-code').style.display = 'block';
                document.getElementById('code-email-display').textContent = email;
                
                clearOtpInputs();
                document.getElementById('otp-1')?.focus();
                
                showToast('📧 Код отправлен!');
                startResendTimer('login');
            } catch (error) {
                if (error.message.includes('user not found')) {
                    showToast('Пользователь не найден', true);
                } else {
                    showToast('Ошибка: ' + error.message, true);
                }
            } finally {
                sendCodeBtn.disabled = false;
                sendCodeBtn.textContent = 'Отправить код';
            }
        };
    }

    document.getElementById('btn-resend-code')?.addEventListener('click', () => resendCode('login'));
    document.getElementById('btn-resend-reg-code')?.addEventListener('click', () => resendCode('reg'));
    document.getElementById('btn-verify-code')?.addEventListener('click', verifyCode);
}

async function verifyRegCode() {
    const code = window.getOtpCode();
    const verifyBtn = document.getElementById('btn-verify-reg-code');
    
    if (code.length !== 6) return showToast('Введите 6 цифр', true);
    if (!pendingRegistration) return showToast('Ошибка', true);

    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Проверка...';

    try {
        const password = Math.random().toString(36).slice(-10) + 'A1!';
        const { data, error } = await supabaseClient.auth.signUp({
            email: pendingRegistration.email,
            password: password,
            options: {
                data: {
                    username: pendingRegistration.username,
                    full_name: pendingRegistration.fullName
                }
            }
        });

        if (error) throw error;

        if (data.user) {
            await supabaseClient.from('profiles').insert({
                id: data.user.id,
                username: pendingRegistration.username,
                full_name: pendingRegistration.fullName,
                email: pendingRegistration.email,
                last_seen: new Date().toISOString()
            });
            showToast('✅ Аккаунт создан!');
            await handleSuccessfulLogin(data.user);
        }
    } catch (error) {
        showToast('Неверный код', true);
        clearOtpInputs();
        document.getElementById('otp-1')?.focus();
    } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Подтвердить код';
    }
}

async function verifyCode() {
    const code = window.getOtpCode();
    const verifyBtn = document.getElementById('btn-verify-code');
    
    if (code.length !== 6) return showToast('Введите 6 цифр', true);
    if (!currentLoginEmail) return showToast('Ошибка', true);

    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Проверка...';

    try {
        const { data, error } = await supabaseClient.auth.verifyOtp({
            email: currentLoginEmail,
            token: code,
            type: 'email'
        });
        if (error) throw error;
        if (data.user) await handleSuccessfulLogin(data.user);
    } catch (error) {
        showToast('Неверный код', true);
        clearOtpInputs();
        document.getElementById('otp-1')?.focus();
    } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Подтвердить код';
    }
}

async function resendCode(type) {
    const email = type === 'login' ? currentLoginEmail : pendingRegistration?.email;
    const resendBtn = type === 'login' ? document.getElementById('btn-resend-code') : document.getElementById('btn-resend-reg-code');
    if (!email) return;
    
    resendBtn.disabled = true;
    resendBtn.textContent = 'Отправка...';

    try {
        const { error } = await supabaseClient.auth.signInWithOtp({ 
            email, 
            options: { shouldCreateUser: false } 
        });
        if (error) throw error;
        showToast('📧 Код отправлен!');
        clearOtpInputs();
        document.getElementById('otp-1')?.focus();
        startResendTimer(type);
    } catch (error) {
        showToast('Ошибка: ' + error.message, true);
    } finally {
        resendBtn.disabled = false;
        resendBtn.textContent = 'Отправить повторно';
    }
}

function startResendTimer(type) {
    const resendBtn = type === 'login' ? document.getElementById('btn-resend-code') : document.getElementById('btn-resend-reg-code');
    if (!resendBtn) return;
    otpSecondsLeft = 60;
    resendBtn.disabled = true;
    if (otpTimer) clearInterval(otpTimer);
    otpTimer = setInterval(() => {
        otpSecondsLeft--;
        if (otpSecondsLeft <= 0) {
            clearInterval(otpTimer);
            otpTimer = null;
            resendBtn.disabled = false;
            resendBtn.textContent = 'Отправить повторно';
        } else {
            resendBtn.textContent = `Повторно (${otpSecondsLeft}с)`;
        }
    }, 1000);
}

async function handleSuccessfulLogin(user) {
    if (otpTimer) { clearInterval(otpTimer); otpTimer = null; }
    pendingRegistration = null;
    window.currentUser = user;

    const { data: p } = await supabaseClient.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (!p) {
        const username = user.email?.split('@')[0] || 'user';
        const { data: newProfile } = await supabaseClient.from('profiles').insert({
            id: user.id, 
            username: user.user_metadata?.username || username,
            full_name: user.user_metadata?.full_name || username,
            email: user.email, 
            last_seen: new Date().toISOString()
        }).select().maybeSingle();
        window.currentProfile = newProfile;
    } else {
        window.currentProfile = p;
    }

    if (window.currentProfile) {
        document.getElementById('current-user-badge').textContent = window.currentProfile.full_name;
        if (typeof updateProfileFooter === 'function') updateProfileFooter();
        if (typeof initProfileFooter === 'function') initProfileFooter();
    }

    if (typeof loadAllUsers === 'function') await loadAllUsers();
    if (typeof ensureBotChat === 'function') await ensureBotChat();
    if (typeof ensureSavedChat === 'function') await ensureSavedChat();

    showScreen('chat');
    document.getElementById('chat-title').textContent = 'Lumina Lite';
    document.getElementById('chat-user-avatar').style.display = 'none';
    document.querySelector('.chat-status').textContent = 'выберите диалог';
    document.querySelector('.input-zone').style.display = 'none';
    document.getElementById('messages').innerHTML = `<div class="msg-stub"><svg width="48" height="48"><use href="#icon-chat"/></svg><p>Выберите диалог</p></div>`;
    window.currentChat = null;

    setTimeout(hideLoader, 300);
    if (typeof loadDialogs === 'function') await loadDialogs();
    if (typeof updateLastSeen === 'function') updateLastSeen();
    if (typeof startOnlineHeartbeat === 'function') startOnlineHeartbeat();
    if (typeof subscribeToUserDeletion === 'function') window.deletionChannel = subscribeToUserDeletion();
    if (typeof cleanupDeadChats === 'function') await cleanupDeadChats();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

window.initAuth = initAuth;
window.showScreen = showScreen;
window.logout = logout;
window.handleSuccessfulLogin = handleSuccessfulLogin;
window.hideLoader = hideLoader;
