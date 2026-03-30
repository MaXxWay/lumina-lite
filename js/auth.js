async function handleSuccessfulLogin(user) {
    currentUser = user;
    
    // Проверяем, что все необходимые функции загружены
    if (typeof loadDialogs !== 'function') {
        console.error('loadDialogs не загружена, ждем...');
        // Ждем 1 секунду и пробуем снова
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (typeof loadDialogs !== 'function') {
            showToast('Ошибка загрузки модулей, обновите страницу', true);
            return;
        }
    }
    
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
    if (window.deletionChannel && typeof supabaseClient !== 'undefined') {
        await supabaseClient.removeChannel(window.deletionChannel);
    }
    if (typeof subscribeToUserDeletion === 'function') {
        window.deletionChannel = subscribeToUserDeletion();
    }
    if (typeof cleanupDeadChats === 'function') await cleanupDeadChats();
}
