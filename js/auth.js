// auth.js — регистрация и вход по OTP-коду (6 полей)

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
    
    setTimeout(() => setupOtpInputs(), 50);
}

function resetLoginForm() {
    document.getElementById('login-step-email').style.display = 'block';
    document.getElementById('login-step-code').style.display = 'none';
    document.getElementById('login-email').value = '';
    clearOtpInputs();
    currentLoginEmail = '';
    if (otpTimer) { clearInterval(otpTimer); otpTimer = null; }
}

function resetRegForm() {
    document.getElementById('reg-step-form').style.display = 'block';
    document.getElementById('reg-step-code').style.display = 'none';
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
        if (input) input.value = '';
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
        
        const newInput = input.cloneNode(true);
        input.parentNode.replaceChild(newInput, input);
        inputs[index] = newInput;
    });
    
    inputs.forEach((input, index) => {
        if (!input) return;
        
        input.addEventListener('focus', (e) => e.target.select());
        
        input.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            e.target.value = value;
            
            if (value && index < 5) inputs[index + 1].focus();
            
            if (getOtpCode().length === 6) {
                setTimeout(() => {
                    if (pendingRegistration) verifyRegCode();
                    else verifyCode();
                }, 100);
            }
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                inputs[index - 1].focus();
                inputs[index - 1].value = '';
                e.preventDefault();
            }
        });
        
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const paste = (e.clipboardData || window.clipboardData).getData('text');
            const digits = paste.replace(/\D/g, '').slice(0, 6).split('');
            digits.forEach((digit, i) => { if (inputs[i]) inputs[i].value = digit; });
            if (digits.length === 6) {
                setTimeout(() => {
                    if (pendingRegistration) verifyRegCode();
                    else verifyCode();
                }, 100);
            } else if (digits.length > 0) {
                inputs[Math.min(digits.length, 5)].focus();
            }
        });
    });
    
    setTimeout(() => inputs[0]?.focus(), 100);
}

async function verifyCode() {
    const code = getOtpCode();
    if (code.length !== 6) return showToast('Введите 6 цифр', true);
    if (!currentLoginEmail) return showToast('Ошибка', true);

    const btn = document.getElementById('btn-verify-code');
    btn.disabled = true;
    btn.textContent = 'Проверка...';

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
        btn.disabled = false;
        btn.textContent = 'Подтвердить код';
    }
}

async function verifyRegCode() {
    const code = getOtpCode();
    if (code.length !== 6) return showToast('Введите 6 цифр', true);
    if (!pendingRegistration) return showToast('Ошибка', true);

    const btn = document.getElementById('btn-verify-reg-code');
    btn.disabled = true;
    btn.textContent = 'Проверка...';

    try {
        const password = Math.random().toString(36).slice(-10) + 'A1!';
        const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
            email: pendingRegistration.email,
            password: password,
            options: { data: { username: pendingRegistration.username, full_name: pendingRegistration.fullName } }
        });
        
        if (signUpError) throw signUpError;
        
        if (signUpData.user) {
            await supabaseClient.from('profiles').insert({
                id: signUpData.user.id,
                username: pendingRegistration.username,
                full_name: pendingRegistration.fullName,
                email: pendingRegistration.email,
                last_seen: new Date().toISOString()
            });
            showToast('✅ Аккаунт создан!');
            await handleSuccessfulLogin(signUpData.user);
        }
    } catch (error) {
        showToast('Неверный код', true);
        clearOtpInputs();
        document.getElementById('otp-1')?.focus();
    } finally {
        btn.disabled = false;
        btn.textContent = 'Подтвердить код';
    }
}

async function resendCode(type) {
    const email = type === 'login' ? currentLoginEmail : pendingRegistration?.email;
    const btn = type === 'login' ? document.getElementById('btn-resend-code') : document.getElementById('btn-resend-reg-code');
    if (!email) return;
    
    btn.disabled = true;
    btn.textContent = 'Отправка...';

    try {
        const { error } = await supabaseClient.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
        if (error) throw error;
        showToast('📧 Код отправлен!');
        clearOtpInputs();
        document.getElementById('otp-1')?.focus();
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

async function logout() {
    if (window.onlineInterval) clearInterval(window.onlineInterval);
    if (window.realtimeChannel) await supabaseClient.removeChannel(window.realtimeChannel);
    if (window.statusSubscription) await supabaseClient.removeChannel(window.statusSubscription);
    if (window.typingChannel) await supabaseClient.removeChannel(window.typingChannel);
    if (window.deletionChannel) await supabaseClient.removeChannel(window.deletionChannel);
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

    document.getElementById('btn-do-reg')?.addEventListener('click', async () => {
        const username = document.getElementById('reg-username').value.trim();
        const fullName = document.getElementById('reg-full-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();

        if (!username || !email || !fullName) return showToast('Заполните все поля', true);
        if (!isValidEmail(email)) return showToast('Введите корректный email', true);

        const btn = document.getElementById('btn-do-reg');
        btn.disabled = true;
        btn.textContent = 'Отправка...';

        try {
            const { error } = await supabaseClient.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
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
            btn.disabled = false;
            btn.textContent = 'Зарегистрироваться';
        }
    });

    document.getElementById('btn-verify-reg-code')?.addEventListener('click', verifyRegCode);
    document.getElementById('btn-resend-reg-code')?.addEventListener('click', () => resendCode('reg'));

    document.getElementById('btn-send-code')?.addEventListener('click', async () => {
        const email = document.getElementById('login-email').value.trim();
        if (!email || !isValidEmail(email)) return showToast('Введите корректный email', true);

        currentLoginEmail = email;
        const btn = document.getElementById('btn-send-code');
        btn.disabled = true;
        btn.textContent = 'Отправка...';

        try {
            const { error } = await supabaseClient.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
            if (error) throw error;

            document.getElementById('login-step-email').style.display = 'none';
            document.getElementById('login-step-code').style.display = 'block';
            document.getElementById('code-email-display').textContent = email;
            
            clearOtpInputs();
            document.getElementById('otp-1')?.focus();
            
            showToast('📧 Код отправлен!');
            startResendTimer('login');
        } catch (error) {
            if (error.message.includes('user not found')) showToast('Пользователь не найден', true);
            else showToast('Ошибка: ' + error.message, true);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Отправить код';
        }
    });

    document.getElementById('btn-resend-code')?.addEventListener('click', () => resendCode('login'));
    document.getElementById('btn-verify-code')?.addEventListener('click', verifyCode);
}

window.initAuth = initAuth;
window.showScreen = showScreen;
window.logout = logout;
window.handleSuccessfulLogin = handleSuccessfulLogin;
window.hideLoader = hideLoader;
window.getOtpCode = getOtpCode;
