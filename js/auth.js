// Управление авторизацией
const screens = {
    reg:     document.getElementById('step-register'),
    login:   document.getElementById('step-login'),
    chat:    document.getElementById('chat-screen'),
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
    stopOnlineHeartbeat();
    if (realtimeChannel) await supabase.removeChannel(realtimeChannel);
    if (window.statusSubscription) await supabase.removeChannel(window.statusSubscription);
    if (window.typingChannel) await supabase.removeChannel(window.typingChannel);
    if (window.deletionChannel) await supabase.removeChannel(window.deletionChannel);
    
    messagesCache.clear();
    dialogCache.clear();
    observedMessages.clear();
    
    if (window.readStatusObservers) {
        window.readStatusObservers.observer?.disconnect();
        window.readStatusObservers.mutationObserver?.disconnect();
    }
    
    await supabase.auth.signOut();
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
            
            const { data, error } = await supabase.auth.signUp({ email: getEmail(user), password: pass });
            if (error) return showToast(error.message, true);
            
            if (data.user) {
                await supabase.from('profiles').upsert({
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
            const { data, error } = await supabase.auth.signInWithPassword({ email: getEmail(user), password: pass });
            if (error) return showToast('Ошибка входа: ' + error.message, true);
            
            await handleSuccessfulLogin(data.user);
        };
    }
}

async function handleSuccessfulLogin(user) {
    currentUser = user;
    
    const { data: p } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();
    
    if (!p) {
        const username = user.email.split('@')[0].replace(/@lumina\.local$/, '');
        const { data: newProfile } = await supabase
            .from('profiles')
            .insert({
                id: currentUser.id,
                username: username,
                full_name: username,
                last_seen: new Date().toISOString()
            })
            .select()
            .maybeSingle();
        currentProfile = newProfile;
    } else {
        currentProfile = p;
    }
    
    if (currentProfile) {
        const badge = document.getElementById('current-user-badge');
        if (badge) badge.textContent = currentProfile.full_name;
        updateProfileFooter();
        initProfileFooter();
    }
    
    await loadAllUsers();
    await ensureBotChat();
    await ensureSavedChat();
    
    showScreen('chat');
    await loadDialogs();
    
    document.getElementById('chat-title').textContent = 'Lumina Lite';
    document.querySelector('.chat-status').textContent = 'выберите диалог';
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
    
    document.addEventListener('click', () => updateLastSeen());
    document.addEventListener('keypress', () => updateLastSeen());
    setInterval(() => updateLastSeen(), 30000);
    updateLastSeen();
    
    startOnlineHeartbeat();
    if (window.deletionChannel) {
        await supabase.removeChannel(window.deletionChannel);
    }
    window.deletionChannel = subscribeToUserDeletion();
    await cleanupDeadChats();
}
