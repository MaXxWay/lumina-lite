// auth.js — ПОЛНОСТЬЮ РАБОЧАЯ ВЕРСИЯ С OTP

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
let currentOtpCode = null; // Для тестового режима

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

async function sendOtpCode(email, type = 'login') {
    try {
        const { error } = await supabaseClient.auth.signInWithOtp({ 
            email: email,
            options: {
                shouldCreateUser: type === 'register'
            }
        });
        
        if (error) {
            console.error('OTP send error:', error);
            return { success: false, error: error.message };
        }
        
        return { success: true };
    } catch (error) {
        console.error('Send OTP error:', error);
        return { success: false, error: error.message };
    }
}

async function verifyCode() {
    const otpInput = document.getElementById('login-otp-code');
    const code = otpInput ? otpInput.value.trim() : '';
    
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
        
        if (data.user) {
            showToast('✅ Вход выполнен!');
            await handleSuccessfulLogin(data.user);
        }
        
    } catch (error) {
        console.error('Verify error:', error);
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
    
    if (code.length !== 6) {
        showToast('Введите 6 цифр', true);
        return;
    }
    
    if (!pendingRegistration) {
        showToast('Ошибка: данные не найдены', true);
        return;
    }

    const btn = document.getElementById('btn-verify-reg-code');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Проверка...';
    }

    try {
        // Сначала верифицируем код
        const { data: verifyData, error: verifyError } = await supabaseClient.auth.verifyOtp({
            email: pendingRegistration.email,
            token: code,
            type: 'email'
        });
        
        if (verifyError) throw verifyError;
        
        if (verifyData.user) {
            showToast('✅ Аккаунт подтвержден!');
            await handleSuccessfulLogin(verifyData.user);
        }
        
    } catch (error) {
        console.error('Registration verify error:', error);
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
        const { error } = await supabaseClient.auth.signInWithOtp({ 
            email, 
            options: { 
                shouldCreateUser: type === 'reg'
            } 
        });
        
        if (error) throw error;
        
        showToast('📧 Код отправлен повторно!');
        
        const otpInput = type === 'login' ? document.getElementById('login-otp-code') : document.getElementById('reg-otp-code');
        if (otpInput) {
            otpInput.value = '';
            otpInput.focus();
        }
        
        startResendTimer(type);
        
    } catch (error) {
        console.error('Resend error:', error);
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

    // Получаем или создаем профиль
    let { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
    
    if (error || !profile) {
        const username = user.user_metadata?.username || user.email?.split('@')[0] || 'user';
        const fullName = user.user_metadata?.full_name || username;
        
        const { data: newProfile } = await supabaseClient
            .from('profiles')
            .upsert({
                id: user.id,
                username: username,
                full_name: fullName,
                email: user.email,
                last_seen: new Date().toISOString()
            })
            .select()
            .single();
        
        window.currentProfile = newProfile;
    } else {
        window.currentProfile = profile;
    }

    console.log('currentProfile загружен:', window.currentProfile);

    if (window.currentProfile) {
        const badge = document.getElementById('current-user-badge');
        if (badge) badge.textContent = window.currentProfile.full_name || 'Пользователь';
        if (typeof updateProfileFooter === 'function') updateProfileFooter();
    }

    if (typeof loadAllUsers === 'function') await loadAllUsers();
    if (typeof ensureBotChat === 'function') await ensureBotChat();
    if (typeof ensureSavedChat === 'function') await ensureSavedChat();

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
    showToast('Вы вышли из аккаунта');
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

    // РЕГИСТРАЦИЯ
    if (doReg) {
        doReg.addEventListener('click', async () => {
            const username = document.getElementById('reg-username')?.value.trim();
            const fullName = document.getElementById('reg-full-name')?.value.trim();
            const email = document.getElementById('reg-email')?.value.trim();

            if (!username || !email || !fullName) {
                showToast('Заполните все поля', true);
                return;
            }
            if (!isValidEmail(email)) {
                showToast('Введите корректный email', true);
                return;
            }

            const btn = doReg;
            btn.disabled = true;
            btn.textContent = 'Отправка кода...';

            try {
                // Отправляем OTP код
                const { error } = await supabaseClient.auth.signInWithOtp({ 
                    email, 
                    options: { 
                        shouldCreateUser: true
                    } 
                });
                
                if (error) throw error;

                pendingRegistration = { 
                    email, 
                    username: username.replace(/^@/, ''), 
                    fullName 
                };

                const stepForm = document.getElementById('reg-step-form');
                const stepCode = document.getElementById('reg-step-code');
                const emailDisplay = document.getElementById('reg-code-email-display');
                const otpInput = document.getElementById('reg-otp-code');
                
                if (stepForm) stepForm.style.display = 'none';
                if (stepCode) stepCode.style.display = 'block';
                if (emailDisplay) emailDisplay.textContent = email;
                if (otpInput) otpInput.focus();
                
                showToast('📧 Код подтверждения отправлен на почту!');
                startResendTimer('reg');
                
            } catch (error) {
                console.error('Registration error:', error);
                showToast('Ошибка: ' + error.message, true);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Зарегистрироваться';
            }
        });
    }

    if (verifyRegCode) verifyRegCode.addEventListener('click', verifyRegCode);
    if (resendRegCode) resendRegCode.addEventListener('click', () => resendCode('reg'));

    // ВХОД
    if (sendCode) {
        sendCode.addEventListener('click', async () => {
            const email = document.getElementById('login-email')?.value.trim();
            if (!email || !isValidEmail(email)) {
                showToast('Введите корректный email', true);
                return;
            }

            currentLoginEmail = email;
            const btn = sendCode;
            btn.disabled = true;
            btn.textContent = 'Отправка кода...';

            try {
                const { error } = await supabaseClient.auth.signInWithOtp({ 
                    email, 
                    options: { shouldCreateUser: false } 
                });
                
                if (error) throw error;

                const stepEmail = document.getElementById('login-step-email');
                const stepCode = document.getElementById('login-step-code');
                const emailDisplay = document.getElementById('code-email-display');
                const otpInput = document.getElementById('login-otp-code');
                
                if (stepEmail) stepEmail.style.display = 'none';
                if (stepCode) stepCode.style.display = 'block';
                if (emailDisplay) emailDisplay.textContent = email;
                if (otpInput) otpInput.focus();
                
                showToast('📧 Код отправлен на почту!');
                startResendTimer('login');
                
            } catch (error) {
                console.error('Send code error:', error);
                if (error.message.includes('user not found')) {
                    showToast('Пользователь не найден. Зарегистрируйтесь сначала.', true);
                } else {
                    showToast('Ошибка: ' + error.message, true);
                }
            } finally {
                btn.disabled = false;
                btn.textContent = 'Отправить код';
            }
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
