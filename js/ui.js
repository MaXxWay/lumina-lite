// UI компоненты и рендеринг
function updateProfileFooter() {
    if (!currentProfile) return;
    
    const footerAvatar = document.getElementById('footer-avatar');
    const footerName = document.getElementById('footer-name');
    const footerUsername = document.getElementById('footer-username');
    
    if (footerAvatar) {
        footerAvatar.textContent = (currentProfile.full_name || '?')[0].toUpperCase();
    }
    if (footerName) {
        footerName.textContent = currentProfile.full_name || currentProfile.username || 'Пользователь';
    }
    if (footerUsername) {
        footerUsername.textContent = `@${currentProfile.username || 'username'}`;
    }
}

function initProfileFooter() {
    const footer = document.getElementById('profile-footer');
    if (!footer) return;
    
    const footerInfo = footer.querySelector('.profile-footer-info');
    if (footerInfo) {
        footerInfo.onclick = () => {
            if (!currentProfile) return;
            const letter = (currentProfile.full_name || '?')[0].toUpperCase();
            const avatarLetter = document.getElementById('profile-avatar-letter');
            const profileFullname = document.getElementById('profile-fullname');
            const profileUsername = document.getElementById('profile-username');
            const profileBio = document.getElementById('profile-bio');
            
            if (avatarLetter) avatarLetter.textContent = letter;
            if (profileFullname) profileFullname.value = currentProfile.full_name || '';
            if (profileUsername) profileUsername.value = currentProfile.username || '';
            if (profileBio) profileBio.value = currentProfile.bio || '';
            
            showScreen('profile');
        };
    }
    
    const settingsBtn = document.getElementById('footer-settings');
    if (settingsBtn) {
        settingsBtn.onclick = () => {
            if (!currentProfile) return;
            const letter = (currentProfile.full_name || '?')[0].toUpperCase();
            const avatarLetter = document.getElementById('profile-avatar-letter');
            const profileFullname = document.getElementById('profile-fullname');
            const profileUsername = document.getElementById('profile-username');
            const profileBio = document.getElementById('profile-bio');
            
            if (avatarLetter) avatarLetter.textContent = letter;
            if (profileFullname) profileFullname.value = currentProfile.full_name || '';
            if (profileUsername) profileUsername.value = currentProfile.username || '';
            if (profileBio) profileBio.value = currentProfile.bio || '';
            
            showScreen('profile');
        };
    }
    
    const logoutFooterBtn = document.getElementById('footer-logout');
    if (logoutFooterBtn) {
        logoutFooterBtn.onclick = async () => {
            stopOnlineHeartbeat();
            if (realtimeChannel) await supabase.removeChannel(realtimeChannel);
            await supabase.auth.signOut();
            currentUser = null;
            currentProfile = null;
            currentChat = null;
            showScreen('reg');
        };
    }
}

function updateChatStatusFromProfile(profile) {
    const chatStatus = document.querySelector('.chat-status');
    if (!chatStatus) return;
    
    const isBot = currentChat?.other_user?.id === BOT_USER_ID;
    const isSaved = currentChat?.id === SAVED_CHAT_ID;
    
    if (isBot) {
        chatStatus.textContent = 'бот';
        chatStatus.className = 'chat-status status-bot';
        return;
    }
    
    if (isSaved) {
        chatStatus.textContent = 'личное';
        chatStatus.className = 'chat-status status-offline';
        return;
    }
    
    const status = getUserStatusFromProfile(profile);
    chatStatus.textContent = status.text;
    chatStatus.className = `chat-status ${status.class}`;
}

function initEmojiPicker() {
    const emojiBtn = document.getElementById('btn-emoji');
    const emojiPicker = document.getElementById('emoji-picker');
    if (emojiBtn && emojiPicker) {
        emojiBtn.onclick = (e) => {
            e.stopPropagation();
            const isVisible = emojiPicker.style.display === 'flex';
            emojiPicker.style.display = isVisible ? 'none' : 'flex';
        };
        
        document.querySelectorAll('.emoji-item').forEach(emoji => {
            emoji.onclick = () => {
                const input = document.getElementById('message-input');
                if (input) {
                    input.value += emoji.textContent;
                    input.focus();
                }
                emojiPicker.style.display = 'none';
            };
        });
        
        document.addEventListener('click', (e) => {
            if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
                emojiPicker.style.display = 'none';
            }
        });
    }
}

function initMessageMenu() {
    const messageMenu = document.getElementById('message-menu');
    if (!messageMenu) return;
    
    function hideMessageMenu() {
        messageMenu.style.display = 'none';
        document.removeEventListener('click', hideMessageMenu);
    }
    
    window.showMessageMenu = function(e, messageId, messageText, isOwn) {
        e.preventDefault();
        e.stopPropagation();
        
        messageMenu.style.display = 'block';
        messageMenu.style.left = `${e.clientX}px`;
        messageMenu.style.top = `${e.clientY}px`;
        
        const menuItems = messageMenu.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            const action = item.dataset.action;
            item.onclick = () => handleMessageAction(action, messageId, messageText, isOwn);
        });
        
        setTimeout(() => {
            document.addEventListener('click', hideMessageMenu);
        }, 0);
    };
    
    async function handleMessageAction(action, messageId, messageText, isOwn) {
        hideMessageMenu();
        
        switch (action) {
            case 'reply':
                const input = document.getElementById('message-input');
                if (input && currentChat?.id !== SAVED_CHAT_ID) {
                    input.value = `> ${messageText}\n\n`;
                    input.focus();
                }
                break;
            case 'copy':
                await navigator.clipboard.writeText(messageText);
                showToast('Текст скопирован');
                break;
            case 'edit':
                if (isOwn && currentChat?.id !== SAVED_CHAT_ID) {
                    const newText = prompt('Изменить сообщение:', messageText);
                    if (newText && newText.trim()) {
                        const { error } = await supabase
                            .from('messages')
                            .update({ text: newText.trim(), is_edited: true })
                            .eq('id', messageId);
                        if (error) {
                            showToast('Ошибка редактирования', true);
                        } else {
                            showToast('Сообщение изменено');
                        }
                    }
                } else {
                    showToast('Можно редактировать только свои сообщения', true);
                }
                break;
            case 'pin':
                showToast('Функция закрепления в разработке');
                break;
            case 'forward':
                showToast('Функция пересылки в разработке');
                break;
            case 'delete':
                if (isOwn) {
                    const confirm = window.confirm('Удалить сообщение?');
                    if (confirm) {
                        const { error } = await supabase
                            .from('messages')
                            .delete()
                            .eq('id', messageId);
                        if (error) {
                            showToast('Ошибка удаления', true);
                        } else {
                            showToast('Сообщение удалено');
                        }
                    }
                } else {
                    showToast('Можно удалять только свои сообщения', true);
                }
                break;
        }
    }
}

function initProfileScreen() {
    const profileBackBtn = document.getElementById('btn-profile-back');
    if (profileBackBtn) profileBackBtn.onclick = () => showScreen('chat');
    
    const profileLogoutBtn = document.getElementById('btn-logout-profile');
    if (profileLogoutBtn) {
        profileLogoutBtn.onclick = async () => {
            stopOnlineHeartbeat();
            if (realtimeChannel) await supabase.removeChannel(realtimeChannel);
            if (statusSubscription) await supabase.removeChannel(statusSubscription);
            if (typingChannel) await supabase.removeChannel(typingChannel);
            await supabase.auth.signOut();
            currentUser = null;
            currentProfile = null;
            currentChat = null;
            showScreen('reg');
        };
    }
    
    const saveProfileBtn = document.getElementById('btn-save-profile');
    if (saveProfileBtn) {
        saveProfileBtn.onclick = async () => {
            const full_name = document.getElementById('profile-fullname').value.trim();
            const bio = document.getElementById('profile-bio').value.trim();
            if (!full_name) return showToast('Имя не может быть пустым', true);
            
            const { error } = await supabase.from('profiles')
                .update({ full_name, bio })
                .eq('id', currentUser.id);
            
            if (error) return showToast('Ошибка сохранения', true);
            
            currentProfile.full_name = full_name;
            currentProfile.bio = bio;
            document.getElementById('current-user-badge').textContent = full_name;
            document.getElementById('profile-avatar-letter').textContent = full_name[0].toUpperCase();
            updateProfileFooter();
            showToast('Профиль сохранён ✓');
            setTimeout(() => showScreen('chat'), 800);
        };
    }
}

function initSearchDialogs() {
    const searchInputElem = document.getElementById('search-dialogs');
    if (searchInputElem) {
        let searchTimeout;
        searchInputElem.oninput = (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                loadDialogs(e.target.value);
            }, 300);
        };
    }
}

function initSendButton() {
    const sendButton = document.getElementById('btn-send-msg');
    if (sendButton) sendButton.onclick = sendMsg;
    
    const messageInputField = document.getElementById('message-input');
    if (messageInputField) {
        messageInputField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMsg();
            }
        });
    }
}

function initUserActivityTracking() {
    let userActivityTimeout = null;
    let lastActivityTime = Date.now();
    
    function resetUserActivity() {
        if (!currentUser) return;
        
        lastActivityTime = Date.now();
        
        if (userActivityTimeout) clearTimeout(userActivityTimeout);
        
        if (!isUserOnline) {
            setUserOnlineStatus(true);
        }
        
        userActivityTimeout = setTimeout(async () => {
            const inactiveTime = Date.now() - lastActivityTime;
            if (inactiveTime >= 15000 && isUserOnline) {
                console.log('⏰ Пользователь неактивен 15 секунд, статус: не в сети');
                await setUserOnlineStatus(false);
            }
        }, 1);
    }
    
    window.addEventListener('mousemove', resetUserActivity);
    window.addEventListener('keydown', resetUserActivity);
    window.addEventListener('click', resetUserActivity);
    window.addEventListener('scroll', resetUserActivity);
    
    window.addEventListener('beforeunload', () => {
        if (currentUser) {
            navigator.sendBeacon(
                `${SUPABASE_URL}/rest/v1/rpc/force_set_offline`,
                JSON.stringify({ user_id: currentUser.id })
            );
        }
    });
    
    document.addEventListener('visibilitychange', async () => {
        if (!currentUser) return;
        
        if (document.hidden) {
            console.log('💤 Вкладка скрыта, статус: не в сети');
            await setUserOnlineStatus(false);
            if (userActivityTimeout) clearTimeout(userActivityTimeout);
        } else {
            console.log('🟢 Вкладка активна, статус: онлайн');
            await setUserOnlineStatus(true);
            resetUserActivity();
            
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
        if (currentUser) {
            navigator.sendBeacon(
                `${SUPABASE_URL}/rest/v1/rpc/force_set_offline`,
                JSON.stringify({ user_id: currentUser.id })
            );
        }
    });
}
