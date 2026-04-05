// ui.js - UI компоненты и улучшенное контекстное меню

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
    if (logout) logout.onclick = async () => {
        const confirmed = await modal.confirm('Вы действительно хотите выйти из аккаунта?', 'Выход из системы');
        if (confirmed) {
            stopOnlineHeartbeat();
            if (realtimeChannel) await supabaseClient.removeChannel(realtimeChannel);
            await supabaseClient.auth.signOut();
            currentUser = null;
            currentProfile = null;
            currentChat = null;
            showScreen('reg');
            showToast('Вы вышли из аккаунта');
        }
    };
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

// Улучшенное контекстное меню
function initMessageMenu() {
    const menu = document.getElementById('message-menu');
    if (!menu) return;
    
    let currentMessageId = null;
    let currentMessageText = null;
    let currentIsOwn = false;
    
    function hideMenu() { 
        menu.style.display = 'none'; 
        menu.classList.remove('menu-visible');
        document.removeEventListener('click', hideMenu);
        document.removeEventListener('touchstart', hideMenu);
        currentMessageId = null;
        currentMessageText = null;
        currentIsOwn = false;
    }
    
    window.showMessageMenu = function(e, msgId, msgText, isOwn) {
        e.preventDefault();
        e.stopPropagation();
        
        currentMessageId = msgId;
        currentMessageText = msgText;
        currentIsOwn = isOwn;
        
        let x = e.clientX;
        let y = e.clientY;
        
        if (isMobileDevice() && e.touches && e.touches[0]) {
            const touch = e.touches[0];
            x = touch.clientX;
            y = touch.clientY;
            
            if (window.navigator.vibrate) {
                window.navigator.vibrate(50);
            }
        }
        
        menu.style.display = 'block';
        
        setTimeout(() => {
            const menuRect = menu.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            let left = x;
            let top = y;
            
            if (x + menuRect.width > viewportWidth - 10) {
                left = x - menuRect.width;
            }
            if (left < 10) {
                left = 10;
            }
            if (y + menuRect.height > viewportHeight - 10) {
                top = y - menuRect.height;
            }
            if (top < 10) {
                top = 10;
            }
            
            menu.style.left = `${left}px`;
            menu.style.top = `${top}px`;
            menu.style.transform = 'none';
            menu.classList.add('menu-visible');
        }, 0);
        
        const menuItems = menu.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            const newItem = item.cloneNode(true);
            item.parentNode.replaceChild(newItem, item);
            newItem.onclick = (e) => {
                e.stopPropagation();
                handleAction(newItem.dataset.action, currentMessageId, currentMessageText, currentIsOwn);
                hideMenu();
            };
        });
        
        setTimeout(() => {
            document.addEventListener('click', hideMenu);
            document.addEventListener('touchstart', hideMenu);
        }, 10);
    };
    
    async function handleAction(action, msgId, msgText, isOwn) {
        switch (action) {
            case 'reply': 
                const inp = document.getElementById('message-input'); 
                if (inp && currentChat?.id !== SAVED_CHAT_ID) { 
                    inp.value = `> ${msgText}\n\n`; 
                    inp.focus(); 
                    showToast('Текст для ответа вставлен');
                } else {
                    showToast('Нельзя ответить на это сообщение', true);
                }
                break;
                
            case 'copy': 
                try {
                    await navigator.clipboard.writeText(msgText);
                    showToast('✓ Текст скопирован в буфер обмена');
                } catch (err) {
                    const textarea = document.createElement('textarea');
                    textarea.value = msgText;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    showToast('✓ Текст скопирован');
                }
                break;
                
            case 'edit':
                if (isOwn && currentChat?.id !== SAVED_CHAT_ID) {
                    const newText = await modal.prompt(
                        'Изменить сообщение:',
                        'Редактирование',
                        msgText,
                        'Введите новый текст'
                    );
                    
                    if (newText && newText.trim() && newText.trim() !== msgText) {
                        try {
                            const { error } = await supabaseClient
                                .from('messages')
                                .update({ text: newText.trim(), is_edited: true })
                                .eq('id', msgId);
                            
                            if (error) throw error;
                            
                            const msgDiv = document.querySelector(`.message[data-id="${msgId}"]`);
                            if (msgDiv) {
                                const textDiv = msgDiv.querySelector('.text');
                                if (textDiv) {
                                    textDiv.textContent = newText.trim();
                                    showToast('✓ Сообщение изменено');
                                }
                            }
                            
                            if (messagesCache.has(currentChat?.id)) {
                                const cached = messagesCache.get(currentChat.id);
                                const idx = cached.findIndex(m => m.id === msgId);
                                if (idx !== -1) {
                                    cached[idx].text = newText.trim();
                                    messagesCache.set(currentChat.id, cached);
                                }
                            }
                        } catch (error) {
                            showToast('Ошибка при редактировании', true);
                        }
                    } else if (newText && newText.trim() === msgText) {
                        showToast('Текст не изменен');
                    }
                } else {
                    showToast('Можно редактировать только свои сообщения', true);
                }
                break;
                
            case 'delete':
                if (isOwn) {
                    const confirmed = await modal.confirm(
                        'Вы уверены, что хотите удалить это сообщение? Это действие нельзя отменить.',
                        'Удаление сообщения'
                    );
                    
                    if (confirmed) {
                        try {
                            const { error } = await supabaseClient
                                .from('messages')
                                .delete()
                                .eq('id', msgId);
                            
                            if (error) throw error;
                            
                            showToast('✓ Сообщение удалено');
                            
                            const msgDiv = document.querySelector(`.message[data-id="${msgId}"]`);
                            if (msgDiv) msgDiv.remove();
                            
                            if (messagesCache.has(currentChat?.id)) {
                                const cached = messagesCache.get(currentChat.id);
                                messagesCache.set(
                                    currentChat.id,
                                    cached.filter(m => m.id !== msgId)
                                );
                            }
                            
                            const container = document.getElementById('messages');
                            if (container && container.querySelectorAll('.message').length === 0) {
                                container.innerHTML = '<div class="msg-stub">Начните переписку</div>';
                            }
                        } catch (error) {
                            showToast('Ошибка при удалении', true);
                        }
                    }
                } else {
                    showToast('Можно удалять только свои сообщения', true);
                }
                break;
                
            default: 
                showToast('Функция в разработке');
        }
    }
}

// Мобильное долгое нажатие
function initMobileLongPress() {
    if (!isMobileDevice()) return;
    
    const messagesContainer = document.getElementById('messages');
    if (!messagesContainer) return;
    
    let pressTimer = null;
    let pressTarget = null;
    let startY = 0;
    let startX = 0;
    
    messagesContainer.addEventListener('touchstart', (e) => {
        const messageDiv = e.target.closest('.message');
        if (!messageDiv) return;
        
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        pressTarget = messageDiv;
        
        pressTimer = setTimeout(() => {
            if (pressTarget && pressTarget.isConnected) {
                const msgId = pressTarget.dataset.id;
                const msgText = pressTarget.dataset.text;
                const isOwn = pressTarget.classList.contains('own');
                
                if (msgId && typeof showMessageMenu === 'function') {
                    const fakeEvent = {
                        clientX: startX,
                        clientY: startY,
                        touches: [{ clientX: startX, clientY: startY }],
                        preventDefault: () => {}
                    };
                    
                    showMessageMenu(fakeEvent, msgId, msgText, isOwn);
                    
                    pressTarget.style.transform = 'scale(0.98)';
                    pressTarget.style.transition = 'transform 0.1s ease';
                    setTimeout(() => {
                        if (pressTarget && pressTarget.isConnected) {
                            pressTarget.style.transform = '';
                        }
                    }, 150);
                }
            }
            pressTimer = null;
        }, 500);
    });
    
    messagesContainer.addEventListener('touchmove', (e) => {
        if (!pressTarget) return;
        
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const deltaX = Math.abs(currentX - startX);
        const deltaY = Math.abs(currentY - startY);
        
        if (deltaX > 10 || deltaY > 10) {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
            pressTarget = null;
        }
    });
    
    messagesContainer.addEventListener('touchend', () => {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }
        if (pressTarget) {
            setTimeout(() => {
                if (pressTarget && pressTarget.isConnected) {
                    pressTarget.style.transform = '';
                }
            }, 100);
        }
        pressTarget = null;
    });
    
    messagesContainer.addEventListener('touchcancel', () => {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }
        pressTarget = null;
    });
}

function initImprovedMessageMenu() {
    initMessageMenu();
    initMobileLongPress();
}

function initProfileScreen() {
    const back = document.getElementById('btn-profile-back');
    if (back) back.onclick = () => showScreen('chat');
    const logout = document.getElementById('btn-logout-profile');
    if (logout) logout.onclick = async () => {
        const confirmed = await modal.confirm('Вы действительно хотите выйти из аккаунта?', 'Выход из системы');
        if (confirmed) {
            stopOnlineHeartbeat();
            if (realtimeChannel) await supabaseClient.removeChannel(realtimeChannel);
            await supabaseClient.auth.signOut();
            currentUser = null;
            currentProfile = null;
            currentChat = null;
            showScreen('reg');
            showToast('Вы вышли из аккаунта');
        }
    };
    const save = document.getElementById('btn-save-profile');
    if (save) save.onclick = async () => {
        const full = document.getElementById('profile-fullname').value.trim();
        const bio = document.getElementById('profile-bio').value.trim();
        if (!full) return showToast('Имя не может быть пустым', true);
        
        try {
            const { error } = await supabaseClient
                .from('profiles')
                .update({ full_name: full, bio })
                .eq('id', currentUser.id);
            
            if (error) throw error;
            
            currentProfile.full_name = full;
            currentProfile.bio = bio;
            
            const badge = document.getElementById('current-user-badge');
            if (badge) badge.textContent = full;
            
            const avatarLetter = document.getElementById('profile-avatar-letter');
            if (avatarLetter) avatarLetter.textContent = full[0].toUpperCase();
            
            updateProfileFooter();
            showToast('✓ Профиль сохранён');
            setTimeout(() => showScreen('chat'), 800);
        } catch (error) {
            showToast('Ошибка сохранения профиля', true);
        }
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
    window.addEventListener('mousemove', reset); 
    window.addEventListener('keydown', reset); 
    window.addEventListener('click', reset); 
    window.addEventListener('scroll', reset);
    window.addEventListener('beforeunload', () => { 
        if (currentUser) navigator.sendBeacon(`${SUPABASE_URL}/rest/v1/rpc/force_set_offline`, JSON.stringify({ user_id: currentUser.id })); 
    });
    document.addEventListener('visibilitychange', async () => {
        if (!currentUser) return;
        if (document.hidden) { 
            await setUserOnlineStatus(false); 
            if (timeout) clearTimeout(timeout); 
        } else { 
            await setUserOnlineStatus(true); 
            reset(); 
            if (currentChat) { 
                await markChatMessagesAsRead(currentChat.id); 
                if (window.readStatusObservers) { 
                    window.readStatusObservers.observer?.disconnect(); 
                    window.readStatusObservers.mutationObserver?.disconnect(); 
                } 
                window.readStatusObservers = setupReadStatusObserver(); 
            } 
        }
    });
    window.addEventListener('pagehide', () => { 
        if (currentUser) navigator.sendBeacon(`${SUPABASE_URL}/rest/v1/rpc/force_set_offline`, JSON.stringify({ user_id: currentUser.id })); 
    });
}

// Экспорт
window.updateProfileFooter = updateProfileFooter;
window.initProfileFooter = initProfileFooter;
window.updateChatStatusFromProfile = updateChatStatusFromProfile;
window.initEmojiPicker = initEmojiPicker;
window.initImprovedMessageMenu = initImprovedMessageMenu;
window.initProfileScreen = initProfileScreen;
window.initSearchDialogs = initSearchDialogs;
window.initSendButton = initSendButton;
window.initUserActivityTracking = initUserActivityTracking;
