// ui.js - полный исправленный файл

let currentProfileModalOpen = false;
let emojiPickerVisible = false;

function updateProfileFooter() {
    if (!currentProfile) return;
    
    const footerAvatar = document.getElementById('footer-avatar');
    const footerName = document.getElementById('footer-name');
    const footerUsername = document.getElementById('footer-username');
    const profileAvatarLetter = document.getElementById('profile-avatar-letter');
    const profileFullname = document.getElementById('profile-fullname');
    const profileUsername = document.getElementById('profile-username');
    const profileBio = document.getElementById('profile-bio');
    
    if (footerAvatar) {
        footerAvatar.textContent = (currentProfile.full_name || currentProfile.username || '?').charAt(0).toUpperCase();
    }
    if (footerName) footerName.textContent = currentProfile.full_name || currentProfile.username || 'Пользователь';
    if (footerUsername) footerUsername.textContent = `@${currentProfile.username || 'username'}`;
    if (profileAvatarLetter) profileAvatarLetter.textContent = (currentProfile.full_name || currentProfile.username || '?').charAt(0).toUpperCase();
    if (profileFullname) profileFullname.value = currentProfile.full_name || '';
    if (profileUsername) profileUsername.value = `@${currentProfile.username || ''}`;
    if (profileBio) profileBio.value = currentProfile.bio || '';
}

function initProfileFooter() {
    const footerInfo = document.querySelector('.profile-footer-info');
    const footerSettings = document.getElementById('footer-settings');
    const footerLogout = document.getElementById('footer-logout');
    
    if (footerInfo) {
        footerInfo.onclick = () => {
            const profileScreen = document.getElementById('profile-screen');
            if (profileScreen) profileScreen.style.display = 'flex';
        };
    }
    
    if (footerSettings) {
        footerSettings.onclick = () => {
            const profileScreen = document.getElementById('profile-screen');
            if (profileScreen) profileScreen.style.display = 'flex';
        };
    }
    
    if (footerLogout) {
        footerLogout.onclick = async () => {
            if (confirm('Вы уверены, что хотите выйти?')) {
                await logout();
            }
        };
    }
    
    updateProfileFooter();
}

function initProfileScreen() {
    const profileScreen = document.getElementById('profile-screen');
    const btnBack = document.getElementById('btn-profile-back');
    const btnSave = document.getElementById('btn-save-profile');
    const btnLogout = document.getElementById('btn-logout-profile');
    
    if (btnBack) {
        btnBack.onclick = () => {
            if (profileScreen) profileScreen.style.display = 'none';
        };
    }
    
    if (btnSave) {
        btnSave.onclick = async () => {
            const fullname = document.getElementById('profile-fullname')?.value.trim();
            const bio = document.getElementById('profile-bio')?.value.trim();
            
            if (!currentUser) return;
            
            try {
                const updates = {};
                if (fullname) updates.full_name = fullname;
                if (bio !== undefined) updates.bio = bio;
                updates.updated_at = new Date().toISOString();
                
                if (Object.keys(updates).length > 0) {
                    const { error } = await supabaseClient
                        .from('profiles')
                        .update(updates)
                        .eq('id', currentUser.id);
                    
                    if (error) throw error;
                    
                    if (currentProfile) {
                        if (fullname) currentProfile.full_name = fullname;
                        if (bio !== undefined) currentProfile.bio = bio;
                    }
                    
                    updateProfileFooter();
                    showToast('Профиль обновлен ✓');
                }
                
                if (profileScreen) profileScreen.style.display = 'none';
            } catch (err) {
                showToast('Ошибка сохранения: ' + err.message, true);
            }
        };
    }
    
    if (btnLogout) {
        btnLogout.onclick = async () => {
            if (confirm('Вы уверены, что хотите выйти?')) {
                if (profileScreen) profileScreen.style.display = 'none';
                await logout();
            }
        };
    }
    
    // Закрытие по клику на оверлей
    if (profileScreen) {
        profileScreen.onclick = (e) => {
            if (e.target === profileScreen) {
                profileScreen.style.display = 'none';
            }
        };
    }
}

function initEmojiPicker() {
    const emojiBtn = document.getElementById('btn-emoji');
    const emojiPicker = document.getElementById('emoji-picker');
    const messageInput = document.getElementById('message-input');
    
    if (!emojiBtn || !emojiPicker) return;
    
    emojiBtn.onclick = (e) => {
        e.stopPropagation();
        emojiPickerVisible = !emojiPickerVisible;
        emojiPicker.style.display = emojiPickerVisible ? 'block' : 'none';
    };
    
    document.querySelectorAll('.emoji-item').forEach(emoji => {
        emoji.onclick = (e) => {
            e.stopPropagation();
            if (messageInput) {
                messageInput.value += emoji.textContent;
                messageInput.focus();
            }
            emojiPicker.style.display = 'none';
            emojiPickerVisible = false;
        };
    });
    
    document.addEventListener('click', (e) => {
        if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
            emojiPicker.style.display = 'none';
            emojiPickerVisible = false;
        }
    });
}

function initSearchDialogs() {
    const searchInput = document.getElementById('search-dialogs');
    if (!searchInput) return;
    
    let searchTimeout = null;
    
    searchInput.addEventListener('input', (e) => {
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const term = e.target.value.trim();
            loadDialogs(term);
        }, 300);
    });
}

function initSendButton() {
    const sendBtn = document.getElementById('btn-send-msg');
    const messageInput = document.getElementById('message-input');
    
    if (sendBtn) {
        sendBtn.onclick = () => sendMsg();
    }
    
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMsg();
            }
        });
    }
}

function initUserActivityTracking() {
    let activityTimeout = null;
    const ACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 минут
    
    function resetActivityTimer() {
        if (activityTimeout) clearTimeout(activityTimeout);
        activityTimeout = setTimeout(async () => {
            if (isUserOnline) {
                isUserOnline = false;
                await setUserOnlineStatus(false);
            }
        }, ACTIVITY_TIMEOUT);
        
        if (!isUserOnline && currentUser) {
            isUserOnline = true;
            setUserOnlineStatus(true);
        }
    }
    
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(event => {
        document.addEventListener(event, resetActivityTimer);
    });
    
    resetActivityTimer();
}

function initMessageMenu() {
    const menu = document.getElementById('message-menu');
    if (!menu) return;
    
    menu.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    menu.style.opacity = '0';
    menu.style.transform = 'scale(0.9)';
    
    function hideMenu() { 
        menu.style.opacity = '0';
        menu.style.transform = 'scale(0.9)';
        setTimeout(() => {
            if (menu.style.opacity === '0') {
                menu.style.display = 'none';
            }
        }, 200);
        document.removeEventListener('click', hideMenu);
        document.removeEventListener('touchstart', hideMenu);
    }
    
    window.showMessageMenu = function(e, msgId, msgText, isOwn) {
        e.preventDefault();
        e.stopPropagation();
        
        let x = e.clientX;
        let y = e.clientY;
        
        // Проверяем наличие isMobileDevice - если функция не определена, определяем по ширине экрана
        const isMobile = (typeof isMobileDevice === 'function' && isMobileDevice()) || window.innerWidth <= 768;
        
        if (isMobile && e.touches && e.touches[0]) {
            const touch = e.touches[0];
            x = touch.clientX;
            y = touch.clientY;
        }
        
        menu.style.display = 'block';
        menu.style.opacity = '0';
        menu.style.transform = 'scale(0.9)';
        
        const menuRect = menu.getBoundingClientRect();
        const menuWidth = menuRect.width;
        const menuHeight = menuRect.height;
        
        let left = x;
        let top = y;
        
        if (left + menuWidth > window.innerWidth - 10) {
            left = window.innerWidth - menuWidth - 10;
        }
        if (left < 10) {
            left = 10;
        }
        
        if (top + menuHeight > window.innerHeight - 10) {
            top = y - menuHeight - 10;
        } else {
            top = y + 10;
        }
        
        if (top < 10) {
            top = 10;
        }
        
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.style.transform = 'scale(1)';
        menu.style.opacity = '1';
        
        menu.querySelectorAll('.menu-item').forEach(item => {
            const newItem = item.cloneNode(true);
            item.parentNode.replaceChild(newItem, item);
            
            newItem.onclick = async (event) => {
                event.stopPropagation();
                await handleAction(newItem.dataset.action, msgId, msgText, isOwn);
                hideMenu();
            };
        });
        
        setTimeout(() => {
            document.addEventListener('click', hideMenu);
            document.addEventListener('touchstart', hideMenu);
        }, 100);
    };
    
    async function handleAction(action, msgId, msgText, isOwn) {
        switch (action) {
            case 'reply': 
                const inp = document.getElementById('message-input'); 
                if (inp && currentChat?.id !== SAVED_CHAT_ID) { 
                    inp.value = `> ${msgText}\n\n`; 
                    inp.focus(); 
                    showToast('Цитата добавлена');
                } 
                break;
            case 'copy': 
                await navigator.clipboard.writeText(msgText); 
                showToast('Текст скопирован ✓'); 
                break;
            case 'edit':
                if (isOwn && currentChat?.id !== SAVED_CHAT_ID) {
                    const newText = prompt('✏️ Редактировать сообщение:', msgText);
                    if (newText && newText.trim() && newText.trim() !== msgText) {
                        try {
                            await supabaseClient.from('messages').update({ 
                                text: newText.trim(), 
                                is_edited: true 
                            }).eq('id', msgId);
                            
                            const msgDiv = document.querySelector(`.message[data-id="${msgId}"]`);
                            if (msgDiv) {
                                const textDiv = msgDiv.querySelector('.text');
                                if (textDiv) {
                                    textDiv.textContent = newText.trim();
                                    const timeSpan = msgDiv.querySelector('.msg-time');
                                    if (timeSpan && !timeSpan.innerHTML.includes('✎')) {
                                        timeSpan.innerHTML = timeSpan.innerHTML + ' ✎';
                                    }
                                }
                            }
                            showToast('Сообщение изменено ✓');
                        } catch (err) {
                            showToast('Ошибка редактирования', true);
                        }
                    }
                } else {
                    showToast('Можно редактировать только свои сообщения', true);
                }
                break;
            case 'delete':
                if (isOwn && confirm('🗑️ Удалить сообщение?\nЭто действие нельзя отменить.')) {
                    try {
                        await supabaseClient.from('messages').delete().eq('id', msgId);
                        showToast('Сообщение удалено');
                    } catch (err) {
                        showToast('Ошибка удаления', true);
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

function updateChatStatusFromProfile(profile) {
    const chatStatus = document.querySelector('.chat-status');
    if (!chatStatus) return;
    
    const status = getUserStatusFromProfile(profile);
    chatStatus.textContent = status.text;
    chatStatus.className = `chat-status ${status.class}`;
    
    // Обновляем онлайн-точку в диалогах
    if (currentChat?.other_user?.id === profile.id) {
        const dialogItem = document.querySelector(`.dialog-item[data-chat-id="${currentChat.id}"]`);
        if (dialogItem) {
            const onlineDot = dialogItem.querySelector('.online-dot');
            if (onlineDot) {
                if (status.isOnline) {
                    onlineDot.classList.remove('hidden');
                } else {
                    onlineDot.classList.add('hidden');
                }
            }
        }
    }
}

// Экспорт
window.updateProfileFooter = updateProfileFooter;
window.initProfileFooter = initProfileFooter;
window.initProfileScreen = initProfileScreen;
window.initEmojiPicker = initEmojiPicker;
window.initSearchDialogs = initSearchDialogs;
window.initSendButton = initSendButton;
window.initUserActivityTracking = initUserActivityTracking;
window.initMessageMenu = initMessageMenu;
window.updateChatStatusFromProfile = updateChatStatusFromProfile;
