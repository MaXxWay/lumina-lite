const screens = {
    reg: document.getElementById('step-register'),
    login: document.getElementById('step-login'),
    chat: document.getElementById('chat-screen'),
    profile: document.getElementById('profile-screen')
};

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
}

async function logout() {
    if (onlineInterval) clearInterval(onlineInterval);
    if (realtimeChannel) await supabaseClient.removeChannel(realtimeChannel);
    if (statusSubscription) await supabaseClient.removeChannel(statusSubscription);
    if (typingChannel) await supabaseClient.removeChannel(typingChannel);
    if (window.deletionChannel) await supabaseClient.removeChannel(window.deletionChannel);
    
    messagesCache.clear();
    dialogCache.clear();
    observedMessages.clear();
    if (window.readStatusObservers) {
        window.readStatusObservers.observer?.disconnect();
        window.readStatusObservers.mutationObserver?.disconnect();
    }
    await supabaseClient.auth.signOut();
    currentUser = null;
    currentProfile = null;
    currentChat = null;
    showScreen('reg');
}

function initAuth() {
    const toLogin = document.getElementById('to-login');
    const toRegister = document.getElementById('to-register');
    if (toLogin) toLogin.onclick = () => showScreen('login');
    if (toRegister) toRegister.onclick = () => showScreen('reg');
    
    const regBtn = document.getElementById('btn-do-reg');
    if (regBtn) {
        regBtn.onclick = async () => {
            const user = document.getElementById('reg-username').value.trim();
            const pass = document.getElementById('reg-password').value.trim();
            const name = document.getElementById('reg-full-name').value.trim();
            if (!user || !pass) return showToast('Заполните все поля', true);
            
            const { data, error } = await supabaseClient.auth.signUp({ email: getEmail(user), password: pass });
            if (error) return showToast(error.message, true);
            
            if (data.user) {
                await supabaseClient.from('profiles').upsert({
                    id: data.user.id,
                    username: user.replace(/^@/, ''),
                    full_name: name || user,
                    last_seen: new Date().toISOString()
                });
                showToast('Аккаунт создан! Войдите.');
                setTimeout(() => showScreen('login'), 1000);
            }
        };
    }
    
    const loginBtn = document.getElementById('btn-do-login');
    if (loginBtn) {
        loginBtn.onclick = async () => {
            const user = document.getElementById('login-username').value.trim();
            const pass = document.getElementById('login-password').value.trim();
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email: getEmail(user), password: pass });
            if (error) return showToast('Ошибка входа: ' + error.message, true);
            await handleSuccessfulLogin(data.user);
        };
    }
}

async function handleSuccessfulLogin(user) {
    currentUser = user;
    
    const { data: p } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
    if (!p) {
        const username = user.email.split('@')[0].replace(/@lumina\.local$/, '');
        const { data: newProfile } = await supabaseClient.from('profiles').insert({
            id: currentUser.id,
            username: username,
            full_name: username,
            last_seen: new Date().toISOString()
        }).select().maybeSingle();
        currentProfile = newProfile;
    } else {
        currentProfile = p;
    }
    
    if (currentProfile) {
        const badge = document.getElementById('current-user-badge');
        if (badge) badge.textContent = currentProfile.full_name;
        if (typeof updateProfileFooter === 'function') updateProfileFooter();
        if (typeof initProfileFooter === 'function') initProfileFooter();
    }
    
    if (typeof loadAllUsers === 'function') await loadAllUsers();
    if (typeof ensureBotChat === 'function') await ensureBotChat();
    if (typeof ensureSavedChat === 'function') await ensureSavedChat();
    
    if (typeof showScreen === 'function') showScreen('chat');
    if (typeof loadDialogs === 'function') await loadDialogs();
    
    const chatTitle = document.getElementById('chat-title');
    if (chatTitle) chatTitle.textContent = 'Lumina Lite';
    
    const chatStatus = document.querySelector('.chat-status');
    if (chatStatus) chatStatus.textContent = 'выберите диалог';
    
    const inputZone = document.querySelector('.input-zone');
    if (inputZone) inputZone.style.display = 'none';
    
    const messagesContainer = document.getElementById('messages');
    if (messagesContainer) {
        messagesContainer.innerHTML = `
            <div class="msg-stub">
                <svg width="48" height="48" style="margin-bottom: 16px; opacity: 0.3;"><use href="#icon-chat"/></svg>
                <p>Выберите диалог, чтобы начать общение</p>
            </div>
        `;
    }
    
    currentChat = null;
    
    document.addEventListener('click', () => { if (typeof updateLastSeen === 'function') updateLastSeen(); });
    document.addEventListener('keypress', () => { if (typeof updateLastSeen === 'function') updateLastSeen(); });
    setInterval(() => { if (typeof updateLastSeen === 'function') updateLastSeen(); }, 30000);
    if (typeof updateLastSeen === 'function') updateLastSeen();
    
    if (typeof startOnlineHeartbeat === 'function') startOnlineHeartbeat();
    if (window.deletionChannel && supabaseClient) {
        await supabaseClient.removeChannel(window.deletionChannel);
    }
    if (typeof subscribeToUserDeletion === 'function') {
        window.deletionChannel = subscribeToUserDeletion();
    }
    if (typeof cleanupDeadChats === 'function') await cleanupDeadChats();
}

// Экспорт
window.initAuth = initAuth;
window.showScreen = showScreen;
window.logout = logout;
window.handleSuccessfulLogin = handleSuccessfulLogin;
