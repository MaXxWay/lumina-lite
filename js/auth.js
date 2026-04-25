// auth.js — исправленная версия

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
let isVerifying = false;

function hideLoader() {
    const loader = document.getElementById('app-loader');
    if (loader) {
        loader.classList.add('hidden');
        setTimeout(() => {
            if (loader.parentNode) loader.remove();
        }, 600);
    }
}

function showScreen(key) {
    console.log('showScreen called with:', key);
    
    // Сначала скрываем все
    const allScreens = ['reg', 'login', 'chat', 'profile'];
    allScreens.forEach(screenKey => {
        const el = screens[screenKey];
        if (el) {
            el.style.display = 'none';
            el.classList.remove('active', 'visible');
        }
    });
    
    const el = screens[key];
    if (!el) {
        console.error('Screen not found:', key);
        return;
    }
    
    if (key === 'chat' || key === 'profile') {
        el.style.display = 'flex';
        el.classList.add('visible');
    } else {
        el.style.display = 'block';
        el.classList.add('active');
    }
    
    console.log('Screen displayed:', key, el.style.display);
    
    if (key === 'login') resetLoginForm();
    if (key === 'reg') resetRegForm();
    
    hideLoader();
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
    isVerifying = false;
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
    isVerifying = false;
}

function setupOtpInputs() {
    const loginOtp = document.getElementById('login-otp-code');
    const regOtp = document.getElementById('reg-otp-code');
    
    const handleOtpInput = (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 6) value = value.slice(0, 6);
        e.target.value = value;
        
        if (value.length === 6 && !isVerifying) {
            if (e.target.id === 'login-otp-code') {
                verifyCode();
            } else {
                verifyRegCode();
            }
        }
    };
    
    if (loginOtp) loginOtp.addEventListener('input', handleOtpInput);
    if (regOtp) regOtp.addEventListener('input', handleOtpInput);
}

async function verifyCode() {
    if (isVerifying) {
        console.log('Верификация уже выполняется, пропускаем');
        return;
    }
    
    const otpInput = document.getElementById('login-otp-code');
    let code = otpInput ? otpInput.value.trim() : '';
    code = code.replace(/\D/g, '');
    
    if (code.length !== 6) {
        showToast('Введите 6 цифр кода из письма', true);
        return;
    }
    
    if (!currentLoginEmail) {
        showToast('Ошибка: email не найден', true);
        return;
    }

    isVerifying = true;
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
        
        if (data.user || data.session) {
            showToast('✅ Вход выполнен!');
            await handleSuccessfulLogin(data.user || data.session.user);
        } else {
            throw new Error('Не удалось получить данные пользователя');
        }
        
    } catch (error) {
        console.error('Verify error:', error);
        if (!window.currentUser) {
            showToast('Неверный код. Попробуйте еще раз', true);
        }
        if (otpInput) {
            otpInput.value = '';
            otpInput.focus();
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Подтвердить код';
        }
        isVerifying = false;
    }
}

async function verifyRegCode() {
    if (isVerifying) {
        console.log('Верификация уже выполняется, пропускаем');
        return;
    }
    
    const otpInput = document.getElementById('reg-otp-code');
    let code = otpInput ? otpInput.value.trim() : '';
    code = code.replace(/\D/g, '');
    
    if (code.length !== 6) {
        showToast('Введите 6 цифр кода из письма', true);
        return;
    }
    
    if (!pendingRegistration) {
        showToast('Ошибка: данные не найдены', true);
        return;
    }

    isVerifying = true;
    const btn = document.getElementById('btn-verify-reg-code');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Проверка...';
    }

    try {
        const { data, error } = await supabaseClient.auth.verifyOtp({
            email: pendingRegistration.email,
            token: code,
            type: 'email'
        });
        
        if (error) throw error;
        
        if (data.user || data.session) {
            const user = data.user || data.session.user;
            
            const { error: profileError } = await supabaseClient
                .from('profiles')
                .upsert({
                    id: user.id,
                    username: pendingRegistration.username,
                    full_name: pendingRegistration.fullName,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id' });
            
            if (profileError) console.error('Ошибка создания профиля:', profileError);
            
            showToast('✅ Аккаунт создан!');
            await handleSuccessfulLogin(user);
        } else {
            throw new Error('Не удалось получить данные пользователя');
        }
        
    } catch (error) {
        console.error('Registration verify error:', error);
        if (!window.currentUser) {
            showToast('Неверный код. Попробуйте еще раз', true);
        }
        if (otpInput) {
            otpInput.value = '';
            otpInput.focus();
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Подтвердить код';
        }
        isVerifying = false;
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
        
        showToast('📧 Новый код отправлен! Проверьте почту');
        
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
    isVerifying = false;
    
    window.currentUser = user;
    console.log('currentUser установлен:', window.currentUser.id);

    let { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
    
    if (error) {
        console.error('Ошибка загрузки профиля:', error);
    }
    
    if (!profile) {
        const username = user.user_metadata?.username || user.email?.split('@')[0] || 'user';
        const fullName = user.user_metadata?.full_name || username;
        
        const { data: newProfile, error: createError } = await supabaseClient
            .from('profiles')
            .insert({
                id: user.id,
                username: username,
                full_name: fullName,
                last_seen: new Date().toISOString()
            })
            .select()
            .single();
        
        if (createError) {
            console.error('Ошибка создания профиля:', createError);
            window.currentProfile = {
                id: user.id,
                username: username,
                full_name: fullName
            };
        } else {
            window.currentProfile = newProfile;
        }
    } else {
        window.currentProfile = profile;
    }

    console.log('currentProfile загружен:', window.currentProfile);

    const badge = document.getElementById('current-user-badge');
    if (badge && window.currentProfile) {
        badge.textContent = window.currentProfile.full_name || 'Пользователь';
    }
    if (typeof updateProfileFooter === 'function') updateProfileFooter();

    try {
        if (typeof initGroups === 'function') await initGroups();
    } catch(e) { console.error('initGroups error:', e); }

    try {
        if (typeof loadAllUsers === 'function') await loadAllUsers();
        if (typeof ensureBotChat === 'function') await ensureBotChat();
        if (typeof ensureSavedChat === 'function') await ensureSavedChat();
    } catch(e) { console.error('init chats error:', e); }

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

    try {
        if (typeof loadDialogs === 'function') await loadDialogs();
    } catch(e) { console.error('loadDialogs error:', e); }
    
    if (typeof updateLastSeen === 'function') updateLastSeen();
    if (typeof startOnlineHeartbeat === 'function') startOnlineHeartbeat();
    if (typeof subscribeToUserDeletion === 'function') window.deletionChannel = subscribeToUserDeletion();
    if (typeof cleanupDeadChats === 'function') await cleanupDeadChats();
    
    if (typeof initMobileOptimizations === 'function') initMobileOptimizations();
    if (typeof initMobileGroupContextMenu === 'function') initMobileGroupContextMenu();
    if (typeof subscribeToNewChats === 'function') subscribeToNewChats();
    
    hideLoader();
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
    window.groupsInitialized = false;
    
    if (typeof messagesCache !== 'undefined') {
        messagesCache.clear();
        observedMessages.clear();
    }
    
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
    
    setupOtpInputs();
    
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
                
                showToast('📧 Код отправлен! Проверьте почту');
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
                
                showToast('📧 Код отправлен! Проверьте почту');
                startResendTimer('login');
                
            } catch (error) {
                console.error('Send code error:', error);
                if (error.message.includes('user not found')) {
                    showToast('Пользователь не найден. Зарегистрируйтесь.', true);
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
