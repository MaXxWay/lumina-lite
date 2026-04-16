// auth.js — регистрация и вход (тестовый режим)

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

// Тестовые пользователи
const testUsers = new Map();

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
    if (stepEmail) stepEmail.style.display = 'block';
    if (stepCode) stepCode.style.display = 'none';
    const loginEmail = document.getElementById('login-email');
    if (loginEmail) loginEmail.value = '';
    const otpInput = document.getElementById('login-otp-code');
    if (otpInput) otpInput.value = '';
    currentLoginEmail = '';
    if (otpTimer) { clearInterval(otpTimer); otpTimer = null; }
}

function resetRegForm() {
    const stepForm = document.getElementById('reg-step-form');
    const stepCode = document.getElementById('reg-step-code');
    if (stepForm) stepForm.style.display = 'block';
    if (stepCode) stepCode.style.display = 'none';
    const regUsername = document.getElementById('reg-username');
    const regFullName = document.getElementById('reg-full-name');
    const regEmail = document.getElementById('reg-email');
    if (regUsername) regUsername.value = '';
    if (regFullName) regFullName.value = '';
    if (regEmail) regEmail.value = '';
    const otpInput = document.getElementById('reg-otp-code');
    if (otpInput) otpInput.value = '';
    pendingRegistration = null;
    if (otpTimer) { clearInterval(otpTimer); otpTimer = null; }
}

// Тестовый вход
async function testLogin(email) {
    if (!email || !email.includes('@')) {
        showToast('Введите корректный email', true);
        return false;
    }
    
    currentLoginEmail = email;
    
    // Проверяем, существует ли пользователь в Supabase
    try {
        const { data: existingProfile } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('email', email)
            .maybeSingle();
        
        if (existingProfile) {
            // Пользователь существует, нужно получить его из auth
            // В тестовом режиме используем специальный метод
            const testPassword = 'test123456';
            
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: testPassword
            });
            
            if (error) {
                // Если не удалось войти, создаем нового пользователя
                return await createTestUser(email);
            }
            
            if (data.user) {
                await handleSuccessfulLogin(data.user);
                return true;
            }
        } else {
            return await createTestUser(email);
        }
    } catch (error) {
        console.error('Test login error:', error);
        return await createTestUser(email);
    }
    
    return false;
}

async function createTestUser(email) {
    const username = email.split('@')[0];
    const fullName = username;
    const testPassword = 'test123456';
    
    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: testPassword,
            options: {
                data: {
                    username: username,
                    full_name: fullName
                }
            }
        });
        
        if (error) {
            if (error.message.includes('User already registered')) {
                showToast('Пользователь уже существует, попробуйте войти снова', true);
            } else {
                showToast('Ошибка: ' + error.message, true);
            }
            return false;
        }
        
        if (data.user) {
            showToast('✅ Аккаунт создан!');
            await handleSuccessfulLogin(data.user);
            return true;
        }
    } catch (error) {
        console.error('Create user error:', error);
        showToast('Ошибка создания пользователя', true);
    }
    
    return false;
}

async function verifyCode() {
    const otpInput = document.getElementById('login-otp-code');
    const code = otpInput ? otpInput.value.trim() : '';
    
    // В тестовом режиме используем код 123456
    if (code === '123456') {
        await testLogin(currentLoginEmail);
        return;
    }
    
    if (code.length !== 6) {
        showToast('Введите 6 цифр', true);
        return;
    }
    
    if (!currentLoginEmail) {
        showToast('Ошибка: email не найден', true);
        return;
    }

    const btn = document.getElementById('btn-verify-code');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Проверка...';
    }

    try {
        const { data, error } = await supabaseClient.auth.verifyOtp({
            email: currentLoginEmail,
            token: code,
            type: 'email'
        });
        
        if (error) throw error;
        if (data.user) await handleSuccessfulLogin(data.user);
        
    } catch (error) {
        showToast('Неверный код: ' + error.message, true);
        if (otpInput) {
            otpInput.value = '';
            otpInput.focus();
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Подтвердить код';
        }
    }
}

async function verifyRegCode() {
    const otpInput = document.getElementById('reg-otp-code');
    const code = otpInput ? otpInput.value.trim() : '';
    
    if (!pendingRegistration) {
        showToast('Ошибка: данные не найдены', true);
        return;
    }
    
    // В тестовом режиме просто создаем пользователя
    if (code === '123456') {
        const btn = document.getElementById('btn-verify-reg-code');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Создание...';
        }
        
        try {
            const testPassword = 'test123456';
            const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
                email: pendingRegistration.email,
                password: testPassword,
                options: {
                    data: {
                        username: pendingRegistration.username,
                        full_name: pendingRegistration.fullName
                    }
                }
            });
            
            if (signUpError) throw signUpError;
            
            if (signUpData.user) {
                showToast('✅ Аккаунт создан!');
                await handleSuccessfulLogin(signUpData.user);
            }
        } catch (error) {
            showToast('Ошибка: ' + error.message, true);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Подтвердить код';
            }
        }
        return;
    }
    
    if (code.length !== 6) {
        showToast('Введите 6 цифр', true);
        return;
    }

    const btn = document.getElementById('btn-verify-reg-code');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Проверка...';
    }

    try {
        const password = Math.random().toString(36).slice(-10) + 'A1!';
        const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
            email: pendingRegistration.email,
            password: password,
            options: {
                data: {
                    username: pendingRegistration.username,
                    full_name: pendingRegistration.fullName
                }
            }
        });
        
        if (signUpError) throw signUpError;
        
        if (signUpData.user) {
            showToast('✅ Аккаунт создан!');
            await handleSuccessfulLogin(signUpData.user);
        }
    } catch (error) {
        showToast('Ошибка: ' + error.message, true);
        if (otpInput) {
            otpInput.value = '';
            otpInput.focus();
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Подтвердить код';
        }
    }
}

async function resendCode(type) {
    const email = type === 'login' ? currentLoginEmail : pendingRegistration?.email;
    const btn = type === 'login' ? document.getElementById('btn-resend-code') : document.getElementById('btn-resend-reg-code');
    if (!email || !btn) return;
    
    btn.disabled = true;
    btn.textContent = 'Отправка...';

    try {
        // В тестовом режиме просто показываем сообщение
        showToast('⚡ ТЕСТОВЫЙ РЕЖИМ: используйте код 123456', false);
        
        const otpInput = type === 'login' ? document.getElementById('login-otp-code') : document.getElementById('reg-otp-code');
        if (otpInput) {
            otpInput.value = '';
            otpInput.focus();
        }
        
        startResendTimer(type);
    } catch (error) {
        showToast('Ошибка: ' + error.message, true);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Отправить повторно';
    }
}

function startResendTimer(type) {
    const btn = type === 'login' ? document.getElementById('btn-resend-code') : document.getElementById('btn-resend-reg-code');
    if (!btn) return;
    otpSecondsLeft = 60;
    btn.disabled = true;
    if (otpTimer) clearInterval(otpTimer);
    otpTimer = setInterval(() => {
        otpSecondsLeft--;
        if (otpSecondsLeft <= 0) {
            clearInterval(otpTimer);
            otpTimer = null;
            btn.disabled = false;
            btn.textContent = 'Отправить повторно';
        } else {
            btn.textContent = `Повторно (${otpSecondsLeft}с)`;
        }
    }, 1000);
}

async function handleSuccessfulLogin(user) {
    if (otpTimer) { clearInterval(otpTimer); otpTimer = null; }
    pendingRegistration = null;
    
    window.currentUser = user;
    console.log('currentUser установлен:', window.currentUser.id);

    // Получаем профиль из БД
    const { data: p } = await supabaseClient.from('profiles').select('*').eq('id', user.id).maybeSingle();
    
    if (p) {
        window.currentProfile = p;
    } else {
        // Создаём профиль вручную
        const username = user.user_metadata?.username || user.email?.split('@')[0] || 'user';
        const fullName = user.user_metadata?.full_name || username;
        
        const { data: newProfile } = await supabaseClient.from('profiles').insert({
            id: user.id, 
            username: username,
            full_name: fullName,
            email: user.email, 
            last_seen: new Date().toISOString()
        }).select().maybeSingle();
        window.currentProfile = newProfile;
    }

    console.log('currentProfile загружен:', window.currentProfile);

    if (window.currentProfile) {
        const badge = document.getElementById('current-user-badge');
        if (badge) badge.textContent = window.currentProfile.full_name || 'Пользователь';
        
        if (typeof updateProfileFooter === 'function') {
            updateProfileFooter();
        }
    }

    if (typeof loadAllUsers === 'function') await loadAllUsers();
    
    if (typeof ensureBotChat === 'function') {
        try { await ensureBotChat(); } catch (e) { console.error('ensureBotChat error:', e); }
    }
    
    if (typeof ensureSavedChat === 'function') {
        try { await ensureSavedChat(); } catch (e) { console.error('ensureSavedChat error:', e); }
    }

    showScreen('chat');
    const chatTitle = document.getElementById('chat-title');
    const chatAvatar = document.getElementById('chat-user-avatar');
    const chatStatus = document.querySelector('.chat-status');
    const inputZone = document.querySelector('.input-zone');
    const messagesContainer = document.getElementById('messages');
    
    if (chatTitle) chatTitle.textContent = 'Lumina Lite';
    if (chatAvatar) chatAvatar.style.display = 'none';
    if (chatStatus) chatStatus.textContent = 'выберите диалог';
    if (inputZone) inputZone.style.display = 'none';
    if (messagesContainer) {
        messagesContainer.innerHTML = `<div class="msg-stub"><svg width="48" height="48"><use href="#icon-chat"/></svg><p>Выберите диалог</p></div>`;
    }
    window.currentChat = null;

    setTimeout(hideLoader, 300);
    if (typeof loadDialogs === 'function') await loadDialogs();
    if (typeof updateLastSeen === 'function') updateLastSeen();
    if (typeof startOnlineHeartbeat === 'function') startOnlineHeartbeat();
    if (typeof subscribeToUserDeletion === 'function') window.deletionChannel = subscribeToUserDeletion();
    if (typeof cleanupDeadChats === 'function') await cleanupDeadChats();
    
    setTimeout(() => {
        if (typeof updateProfileFooter === 'function') {
            updateProfileFooter();
        }
    }, 500);
}

async function logout() {
    if (window.onlineInterval) clearInterval(window.onlineInterval);
    if (window.realtimeChannel) await supabaseClient.removeChannel(window.realtimeChannel);
    if (window.statusSubscription) await supabaseClient.removeChannel(window.statusSubscription);
    if (window.typingChannel) await supabaseClient.removeChannel(window.typingChannel);
    if (window.deletionChannel) await supabaseClient.removeChannel(window.deletionChannel);
    if (window.dialogsSubscription) await supabaseClient.removeChannel(window.dialogsSubscription);
    await supabaseClient.auth.signOut();
    window.currentUser = null;
    window.currentProfile = null;
    window.currentChat = null;
    showScreen('login');
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function initAuth() {
    const toLogin = document.getElementById('to-login');
    const toRegister = document.getElementById('to-register');
    const changeEmailLogin = document.getElementById('btn-change-email-login');
    const changeEmailReg = document.getElementById('btn-change-email-reg');
    const profileBack = document.getElementById('btn-profile-back');
    const cancelEdit = document.getElementById('btn-cancel-edit-profile');
    const doReg = document.getElementById('btn-do-reg');
    const verifyRegCode = document.getElementById('btn-verify-reg-code');
    const resendRegCode = document.getElementById('btn-resend-reg-code');
    const sendCode = document.getElementById('btn-send-code');
    const resendCode = document.getElementById('btn-resend-code');
    const verifyCodeBtn = document.getElementById('btn-verify-code');
    
    if (toLogin) toLogin.addEventListener('click', () => showScreen('login'));
    if (toRegister) toRegister.addEventListener('click', () => showScreen('reg'));
    if (changeEmailLogin) changeEmailLogin.addEventListener('click', resetLoginForm);
    if (changeEmailReg) changeEmailReg.addEventListener('click', resetRegForm);
    if (profileBack) profileBack.addEventListener('click', () => showScreen('chat'));
    if (cancelEdit) cancelEdit.addEventListener('click', () => {
        const viewMode = document.getElementById('profile-view-mode');
        const editMode = document.getElementById('profile-edit-mode');
        if (viewMode) viewMode.style.display = 'block';
        if (editMode) editMode.style.display = 'none';
    });

    if (doReg) {
        doReg.addEventListener('click', async () => {
            const username = document.getElementById('reg-username')?.value.trim();
            const fullName = document.getElementById('reg-full-name')?.value.trim();
            const email = document.getElementById('reg-email')?.value.trim();

            if (!username || !email || !fullName) return showToast('Заполните все поля', true);
            if (!isValidEmail(email)) return showToast('Введите корректный email', true);

            // В тестовом режиме просто создаем аккаунт
            const testPassword = 'test123456';
            
            const btn = document.getElementById('btn-do-reg');
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Создание...';
            }

            try {
                const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
                    email: email,
                    password: testPassword,
                    options: {
                        data: {
                            username: username.replace(/^@/, ''),
                            full_name: fullName
                        }
                    }
                });
                
                if (signUpError) throw signUpError;
                
                if (signUpData.user) {
                    showToast('✅ Аккаунт создан!');
                    await handleSuccessfulLogin(signUpData.user);
                }
            } catch (error) {
                console.error('Signup error:', error);
                if (error.message.includes('User already registered')) {
                    showToast('Пользователь с таким email уже существует. Войдите.', true);
                    showScreen('login');
                } else {
                    showToast('Ошибка: ' + error.message, true);
                }
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Зарегистрироваться';
                }
            }
        });
    }

    if (verifyRegCode) verifyRegCode.addEventListener('click', verifyRegCode);
    if (resendRegCode) resendRegCode.addEventListener('click', () => resendCode('reg'));

    if (sendCode) {
        sendCode.addEventListener('click', async () => {
            const email = document.getElementById('login-email')?.value.trim();
            if (!email || !isValidEmail(email)) return showToast('Введите корректный email', true);
            
            // Показываем форму для ввода кода
            currentLoginEmail = email;
            
            const stepEmail = document.getElementById('login-step-email');
            const stepCode = document.getElementById('login-step-code');
            const emailDisplay = document.getElementById('code-email-display');
            
            if (stepEmail) stepEmail.style.display = 'none';
            if (stepCode) stepCode.style.display = 'block';
            if (emailDisplay) emailDisplay.textContent = email;
            
            showToast('⚡ ТЕСТОВЫЙ РЕЖИМ: используйте код 123456', false);
            startResendTimer('login');
        });
    }

    if (resendCode) resendCode.addEventListener('click', () => resendCode('login'));
    if (verifyCodeBtn) verifyCodeBtn.addEventListener('click', verifyCode);
}

window.initAuth = initAuth;
window.showScreen = showScreen;
window.logout = logout;
window.handleSuccessfulLogin = handleSuccessfulLogin;
window.hideLoader = hideLoader;
window.testLogin = testLogin;
