function updateProfileFooter() {
    if (!currentProfile) return;
    const avatar = document.getElementById('footer-avatar');
    const name = document.getElementById('footer-name');
    const uname = document.getElementById('footer-username');
    if (avatar) avatar.textContent = (currentProfile.full_name || '?')[0].toUpperCase();
    if (name) name.textContent = currentProfile.full_name || currentProfile.username || 'Пользователь';
    if (uname) uname.textContent = `@${currentProfile.username || 'username'}`;
}

function initProfileFooter() {
    const footer = document.getElementById('profile-footer');
    if (!footer) return;
    const info = footer.querySelector('.profile-footer-info');
    if (info) info.onclick = () => { if (currentProfile) openProfileModal(); };
    const settings = document.getElementById('footer-settings');
    if (settings) settings.onclick = () => { if (currentProfile) openProfileModal(); };
    const logout = document.getElementById('footer-logout');
    if (logout) logout.onclick = async () => { stopOnlineHeartbeat(); if (realtimeChannel) await supabaseClient.removeChannel(realtimeChannel); await supabaseClient.auth.signOut(); currentUser = null; currentProfile = null; currentChat = null; showScreen('reg'); };
}

function openProfileModal() {
    if (!currentProfile) return;
    const letter = (currentProfile.full_name || '?')[0].toUpperCase();
    const avatarLetter = document.getElementById('profile-avatar-letter');
    const fullname = document.getElementById('profile-fullname');
    const username = document.getElementById('profile-username');
    const bio = document.getElementById('profile-bio');
    if (avatarLetter) avatarLetter.textContent = letter;
    if (fullname) fullname.value = currentProfile.full_name || '';
    if (username) username.value = currentProfile.username || '';
    if (bio) bio.value = currentProfile.bio || '';
    showScreen('profile');
}

function updateChatStatusFromProfile(profile) {
    const cs = document.querySelector('.chat-status');
    if (!cs) return;
    if (currentChat?.other_user?.id === BOT_USER_ID) { cs.textContent = 'бот'; cs.className = 'chat-status status-bot'; return; }
    if (currentChat?.id === SAVED_CHAT_ID) { cs.textContent = 'личное'; cs.className = 'chat-status status-offline'; return; }
    const status = getUserStatusFromProfile(profile);
    cs.textContent = status.text;
    cs.className = `chat-status ${status.class}`;
}

function initEmojiPicker() {
    const btn = document.getElementById('btn-emoji');
    const picker = document.getElementById('emoji-picker');
    if (!btn || !picker) return;
    btn.onclick = (e) => { e.stopPropagation(); picker.style.display = picker.style.display === 'flex' ? 'none' : 'flex'; };
    document.querySelectorAll('.emoji-item').forEach(emoji => {
        emoji.onclick = () => { const input = document.getElementById('message-input'); if (input) { input.value += emoji.textContent; input.focus(); } picker.style.display = 'none'; };
    });
    document.addEventListener('click', (e) => { if (!picker.contains(e.target) && e.target !== btn) picker.style.display = 'none'; });
}

function initMessageMenu() {
    const menu = document.getElementById('message-menu');
    if (!menu) return;
    
    function hideMenu() { 
        menu.style.display = 'none'; 
        document.removeEventListener('click', hideMenu);
        document.removeEventListener('touchstart', hideMenu);
    }
    
    window.showMessageMenu = function(e, msgId, msgText, isOwn) {
        e.preventDefault();
        
        // Получаем координаты
        let x = e.clientX;
        let y = e.clientY;
        
        // Для мобильных устройств - позиционируем по центру касания
        if (isMobileDevice && typeof isMobileDevice === 'function' && isMobileDevice() && e.touches && e.touches[0]) {
            const touch = e.touches[0];
            x = touch.clientX;
            y = touch.clientY;
        }
        
        menu.style.display = 'block';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        
        // На мобилках добавляем немного отступа
        if (isMobileDevice && typeof isMobileDevice === 'function' && isMobileDevice()) {
            menu.style.transform = 'translate(-50%, -100%)';
            menu.style.marginTop = '-10px';
        } else {
            menu.style.transform = 'translate(-50%, -100%)';
        }
        
        // Проверяем, не выходит ли меню за экран
        setTimeout(() => {
            const rect = menu.getBoundingClientRect();
            if (rect.left < 0) {
                menu.style.left = '10px';
                menu.style.transform = 'translate(0, -100%)';
            }
            if (rect.right > window.innerWidth) {
                menu.style.left = 'auto';
                menu.style.right = '10px';
                menu.style.transform = 'translate(0, -100%)';
            }
            if (rect.top < 0) {
                menu.style.transform = 'translate(-50%, 0)';
                menu.style.marginTop = '10px';
            }
        }, 0);
        
        // Назначаем действия
        menu.querySelectorAll('.menu-item').forEach(item => {
            item.onclick = () => handleAction(item.dataset.action, msgId, msgText, isOwn);
        });
        
        // Закрываем при клике вне меню
        setTimeout(() => {
            document.addEventListener('click', hideMenu);
            document.addEventListener('touchstart', hideMenu);
        }, 0);
    };
    
    async function handleAction(action, msgId, msgText, isOwn) {
        const menu = document.getElementById('message-menu');
        if (menu) menu.style.display = 'none';
        
        switch (action) {
            case 'reply': 
                const inp = document.getElementById('message-input'); 
                if (inp && currentChat?.id !== SAVED_CHAT_ID) { 
                    inp.value = `> ${msgText}\n\n`; 
                    inp.focus(); 
                } 
                break;
            case 'copy': 
                await navigator.clipboard.writeText(msgText); 
                showToast('Текст скопирован'); 
                break;
            case 'edit':
                if (isOwn && currentChat?.id !== SAVED_CHAT_ID) {
                    const newText = prompt('Изменить сообщение:', msgText);
                    if (newText?.trim()) {
                        await supabaseClient.from('messages').update({ text: newText.trim(), is_edited: true }).eq('id', msgId);
                        // Обновляем отображение
                        const msgDiv = document.querySelector(`.message[data-id="${msgId}"]`);
                        if (msgDiv) {
                            const textDiv = msgDiv.querySelector('.text');
                            if (textDiv) textDiv.textContent = newText.trim();
                        }
                    }
                } else {
                    showToast('Можно редактировать только свои сообщения', true);
                }
                break;
            case 'delete':
                if (isOwn && confirm('Удалить сообщение?')) {
                    await supabaseClient.from('messages').delete().eq('id', msgId);
                } else {
                    showToast('Можно удалять только свои сообщения', true);
                }
                break;
            default: 
                showToast('Функция в разработке');
        }
    }
}

function initProfileScreen() {
    const back = document.getElementById('btn-profile-back');
    if (back) back.onclick = () => showScreen('chat');
    const logout = document.getElementById('btn-logout-profile');
    if (logout) logout.onclick = async () => { stopOnlineHeartbeat(); if (realtimeChannel) await supabaseClient.removeChannel(realtimeChannel); await supabaseClient.auth.signOut(); currentUser = null; currentProfile = null; currentChat = null; showScreen('reg'); };
    const save = document.getElementById('btn-save-profile');
    if (save) save.onclick = async () => {
        const full = document.getElementById('profile-fullname').value.trim();
        const bio = document.getElementById('profile-bio').value.trim();
        if (!full) return showToast('Имя не может быть пустым', true);
        await supabaseClient.from('profiles').update({ full_name: full, bio }).eq('id', currentUser.id);
        currentProfile.full_name = full;
        currentProfile.bio = bio;
        document.getElementById('current-user-badge').textContent = full;
        document.getElementById('profile-avatar-letter').textContent = full[0].toUpperCase();
        updateProfileFooter();
        showToast('Профиль сохранён ✓');
        setTimeout(() => showScreen('chat'), 800);
    };
}

function initSearchDialogs() {
    const input = document.getElementById('search-dialogs');
    if (!input) return;
    let timeout;
    input.oninput = (e) => { clearTimeout(timeout); timeout = setTimeout(() => loadDialogs(e.target.value), 300); };
}

function initSendButton() {
    const btn = document.getElementById('btn-send-msg');
    if (btn) btn.onclick = sendMsg;
    const input = document.getElementById('message-input');
    if (input) input.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } });
}

function initUserActivityTracking() {
    let timeout = null, last = Date.now();
    const reset = () => {
        if (!currentUser) return;
        last = Date.now();
        if (timeout) clearTimeout(timeout);
        if (!isUserOnline) setUserOnlineStatus(true);
        timeout = setTimeout(async () => { if (Date.now() - last >= 15000 && isUserOnline) await setUserOnlineStatus(false); }, 1000);
    };
    window.addEventListener('mousemove', reset); window.addEventListener('keydown', reset); window.addEventListener('click', reset); window.addEventListener('scroll', reset);
    window.addEventListener('beforeunload', () => { if (currentUser) navigator.sendBeacon(`${SUPABASE_URL}/rest/v1/rpc/force_set_offline`, JSON.stringify({ user_id: currentUser.id })); });
    document.addEventListener('visibilitychange', async () => {
        if (!currentUser) return;
        if (document.hidden) { await setUserOnlineStatus(false); if (timeout) clearTimeout(timeout); }
        else { await setUserOnlineStatus(true); reset(); if (currentChat) { await markChatMessagesAsRead(currentChat.id); if (window.readStatusObservers) { window.readStatusObservers.observer?.disconnect(); window.readStatusObservers.mutationObserver?.disconnect(); } window.readStatusObservers = setupReadStatusObserver(); } }
    });
    window.addEventListener('pagehide', () => { if (currentUser) navigator.sendBeacon(`${SUPABASE_URL}/rest/v1/rpc/force_set_offline`, JSON.stringify({ user_id: currentUser.id })); });
}

// Экспорт
window.updateProfileFooter = updateProfileFooter;
window.initProfileFooter = initProfileFooter;
window.updateChatStatusFromProfile = updateChatStatusFromProfile;
window.initEmojiPicker = initEmojiPicker;
window.initMessageMenu = initMessageMenu;
window.initProfileScreen = initProfileScreen;
window.initSearchDialogs = initSearchDialogs;
window.initSendButton = initSendButton;
window.initUserActivityTracking = initUserActivityTracking;
