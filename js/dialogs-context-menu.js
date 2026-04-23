// dialogs-context-menu.js — контекстное меню для чатов (ИСПРАВЛЕННЫЙ)

function attachDialogContextMenu(element, chatId, chatData) {
    // Для десктопа — ПКМ
    element.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showDialogMenu(e, chatId, chatData);
        return false;
    };
    
    // Для мобильных — долгое нажатие
    let touchTimer = null;
    let isLongPress = false;
    
    const startTouch = (e) => {
        if (e.target.closest('.dialog-avatar') || e.target.closest('.dialog-name')) {
            return;
        }
        
        isLongPress = false;
        touchTimer = setTimeout(() => {
            isLongPress = true;
            if (window.navigator.vibrate) window.navigator.vibrate(40);
            const touch = e.touches[0];
            const fakeEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => {},
                stopPropagation: () => {}
            };
            showDialogMenu(fakeEvent, chatId, chatData);
            touchTimer = null;
        }, 500);
    };
    
    const endTouch = (e) => {
        if (touchTimer) {
            clearTimeout(touchTimer);
            touchTimer = null;
        }
        if (!isLongPress && !e.target.closest('.dialog-avatar') && !e.target.closest('.dialog-name')) {
            return;
        }
        isLongPress = false;
    };
    
    const cancelTouch = () => {
        if (touchTimer) {
            clearTimeout(touchTimer);
            touchTimer = null;
        }
        isLongPress = false;
    };
    
    element.addEventListener('touchstart', startTouch, { passive: false });
    element.addEventListener('touchend', endTouch);
    element.addEventListener('touchmove', cancelTouch);
    element.addEventListener('touchcancel', cancelTouch);
}

async function showDialogMenu(event, chatId, chatData) {
    const menu = document.getElementById('dialog-menu');
    if (!menu) return;
    
    const otherMenus = document.querySelectorAll('.message-menu, #dialog-menu, #member-context-menu');
    otherMenus.forEach(m => {
        if (m !== menu) {
            m.classList.remove('menu-visible');
            m.style.display = 'none';
        }
    });
    
    window.currentDialogMenuChat = { id: chatId, data: chatData };
    
    const x = event.clientX || (event.touches ? event.touches[0].clientX : 0);
    const y = event.clientY || (event.touches ? event.touches[0].clientY : 0);
    
    const msgMenu = document.getElementById('message-menu');
    if (msgMenu) msgMenu.style.display = 'none';
    
    const blockItem = menu.querySelector('[data-action="block"]');
    const readItem = menu.querySelector('[data-action="read"]');
    const pinItem = menu.querySelector('[data-action="pin"]');
    const muteItem = menu.querySelector('[data-action="mute"]');
    const deleteChatItem = menu.querySelector('[data-action="delete-chat"]');
    
    // Скрываем блокировку для групп, ботов и избранного
    if (chatData.isGroup || chatData.isBot || chatData.isSaved) {
        if (blockItem) blockItem.style.display = 'none';
    } else {
        if (blockItem) blockItem.style.display = 'flex';
    }
    
    // ЗАПРЕЩАЕМ УДАЛЕНИЕ ЧАТА С БОТОМ
    if (chatData.isBot || chatData.id === SAVED_CHAT_ID) {
        if (deleteChatItem) deleteChatItem.style.display = 'none';
    } else {
        if (deleteChatItem) deleteChatItem.style.display = 'flex';
    }
    
    // Обновляем иконку и текст для закрепления (меняем на иконку булавки)
    if (pinItem) {
        const pinSpan = pinItem.querySelector('span');
        const pinSvg = pinItem.querySelector('svg');
        if (chatData.isPinned) {
            pinSpan.textContent = 'Открепить';
        } else {
            pinSpan.textContent = 'Закрепить';
        }
        // Меняем иконку на булавку, если ещё не изменена
        if (pinSvg && pinSvg.getAttribute('href') !== '#icon-pin') {
            pinSvg.setAttribute('href', '#icon-pin');
        }
    }
    
    // Обновляем текст для отметки прочитанным
    if (readItem) {
        const readSpan = readItem.querySelector('span');
        if (chatData.unreadCount > 0) {
            readSpan.textContent = 'Отметить прочитанным';
        } else {
            readSpan.textContent = 'Отметить непрочитанным';
        }
    }
    
    // Обновляем текст для отключения уведомлений
    if (muteItem) {
        const muteSpan = muteItem.querySelector('span');
        if (chatData.isMuted) {
            muteSpan.textContent = 'Включить уведомления';
        } else {
            muteSpan.textContent = 'Отключить уведомления';
        }
    }
    
    const isMobile = typeof isMobileDevice === 'function' && isMobileDevice();
    
    if (isMobile) {
        menu.style.position = 'fixed';
        menu.style.bottom = '0';
        menu.style.left = '0';
        menu.style.right = '0';
        menu.style.top = 'auto';
        menu.style.transform = 'translateY(100%)';
        menu.style.borderRadius = '20px 20px 0 0';
        menu.style.maxWidth = 'none';
        menu.style.width = '100%';
        menu.style.display = 'block';
        
        let overlay = document.getElementById('mobile-menu-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'mobile-menu-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 9999;
                display: none;
                opacity: 0;
                transition: opacity 0.3s ease;
            `;
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'block';
        setTimeout(() => overlay.style.opacity = '1', 10);
        
        overlay.onclick = () => {
            closeMenu();
            overlay.style.opacity = '0';
            setTimeout(() => overlay.style.display = 'none', 300);
        };
        
        setTimeout(() => menu.classList.add('menu-visible'), 10);
    } else {
        menu.style.display = 'block';
        menu.style.maxWidth = '280px';
        menu.style.width = 'auto';
        
        let left = x;
        if (left + 280 > window.innerWidth - 10) left = window.innerWidth - 290;
        if (left < 10) left = 10;
        
        menu.style.left = `${left}px`;
        menu.style.top = `${y}px`;
        menu.style.transform = 'none';
        menu.style.bottom = 'auto';
        menu.style.right = 'auto';
        menu.classList.add('menu-visible');
    }
    
    const closeMenu = () => {
        if (isMobile) {
            menu.classList.remove('menu-visible');
            const overlay = document.getElementById('mobile-menu-overlay');
            if (overlay) {
                overlay.style.opacity = '0';
                setTimeout(() => overlay.style.display = 'none', 300);
            }
            setTimeout(() => menu.style.display = 'none', 280);
        } else {
            menu.style.display = 'none';
            menu.classList.remove('menu-visible');
        }
        document.removeEventListener('click', closeMenu);
        window.currentDialogMenuChat = null;
    };
    
    const handleAction = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = e.currentTarget.dataset.action;
        closeMenu();
        
        switch (action) {
            case 'pin':
                await togglePinChat(chatId);
                break;
            case 'read':
                await toggleReadChat(chatId, chatData);
                break;
            case 'mute':
                await toggleMuteChat(chatId);
                break;
            case 'clear':
                await clearChatHistory(chatId);
                break;
            case 'block':
                await blockUser(chatId, chatData);
                break;
            case 'delete-chat':
                await deleteChat(chatId);
                break;
        }
    };
    
    menu.querySelectorAll('.menu-item').forEach(item => {
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);
        newItem.addEventListener('click', handleAction);
        newItem.addEventListener('touchstart', handleAction, { passive: false });
    });
    
    if (!isMobile) {
        setTimeout(() => document.addEventListener('click', closeMenu), 10);
    }
}

async function togglePinChat(chatId) {
    try {
        const { data: existing } = await supabaseClient
            .from('chats')
            .select('is_pinned')
            .eq('id', chatId)
            .single();
        
        const newPinned = !existing?.is_pinned;
        
        await supabaseClient
            .from('chats')
            .update({ is_pinned: newPinned, updated_at: new Date().toISOString() })
            .eq('id', chatId);
        
        showToast(newPinned ? '📌 Чат закреплён' : '📌 Чат откреплён');
        if (typeof loadDialogs === 'function') await loadDialogs();
    } catch (err) {
        showToast('Ошибка: ' + err.message, true);
    }
}

async function toggleReadChat(chatId, chatData) {
    try {
        if (chatData.unreadCount > 0) {
            await supabaseClient
                .from('messages')
                .update({ is_read: true })
                .eq('chat_id', chatId)
                .neq('user_id', currentUser.id)
                .eq('is_read', false);
            
            showToast('✅ Чат отмечен прочитанным');
        } else {
            const { data: lastMsg } = await supabaseClient
                .from('messages')
                .select('id, user_id')
                .eq('chat_id', chatId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            
            if (lastMsg && lastMsg.user_id !== currentUser.id) {
                await supabaseClient
                    .from('messages')
                    .update({ is_read: false })
                    .eq('id', lastMsg.id);
                
                showToast('🔴 Чат отмечен непрочитанным');
            } else {
                showToast('Нельзя отметить непрочитанным свой чат', true);
            }
        }
        
        if (messagesCache.has(chatId)) {
            const cached = messagesCache.get(chatId);
            cached.forEach(msg => {
                if (msg.user_id !== currentUser.id) {
                    msg.is_read = chatData.unreadCount > 0;
                }
            });
            messagesCache.set(chatId, cached);
        }
        
        if (typeof loadDialogs === 'function') await loadDialogs();
        
        if (currentChat?.id === chatId) {
            const container = document.getElementById('messages');
            if (container) {
                container.querySelectorAll('.message:not(.own)').forEach(el => {
                    const rs = el.querySelector('.read-status');
                    if (rs && !el.classList.contains('bot-message')) {
                        if (typeof setMessageReadStatus === 'function') {
                            setMessageReadStatus(rs, chatData.unreadCount > 0);
                        }
                    }
                    if (chatData.unreadCount > 0) {
                        el.classList.remove('unread-message');
                    } else {
                        el.classList.add('unread-message');
                    }
                });
            }
        }
    } catch (err) {
        showToast('Ошибка: ' + err.message, true);
    }
}

async function toggleMuteChat(chatId) {
    try {
        const { data: existing } = await supabaseClient
            .from('chats')
            .select('is_muted')
            .eq('id', chatId)
            .single();
        
        const newMuted = !existing?.is_muted;
        
        await supabaseClient
            .from('chats')
            .update({ is_muted: newMuted, updated_at: new Date().toISOString() })
            .eq('id', chatId);
        
        showToast(newMuted ? '🔇 Уведомления отключены' : '🔔 Уведомления включены');
        if (typeof loadDialogs === 'function') await loadDialogs();
    } catch (err) {
        showToast('Ошибка: ' + err.message, true);
    }
}

async function clearChatHistory(chatId) {
    const confirmed = await modal.confirm('Очистить историю сообщений?', 'Подтверждение');
    if (!confirmed) return;
    
    try {
        await supabaseClient
            .from('messages')
            .delete()
            .eq('chat_id', chatId);
        
        await supabaseClient.from('messages').insert({
            chat_id: chatId,
            user_id: BOT_USER_ID,
            text: '📜 История сообщений очищена',
            is_system: true,
            created_at: new Date().toISOString()
        });
        
        if (messagesCache.has(chatId)) {
            messagesCache.delete(chatId);
        }
        
        if (currentChat?.id === chatId) {
            const container = document.getElementById('messages');
            if (container) {
                container.innerHTML = '<div class="msg-stub">История очищена</div>';
            }
            if (typeof loadMessages === 'function') await loadMessages(chatId);
        }
        
        showToast('История очищена');
        if (typeof loadDialogs === 'function') await loadDialogs();
    } catch (err) {
        showToast('Ошибка: ' + err.message, true);
    }
}

async function blockUser(chatId, chatData) {
    const userName = chatData.name || 'пользователя';
    const confirmed = await modal.confirm(`Заблокировать ${userName}?`, 'Подтверждение');
    if (!confirmed) return;
    
    try {
        const otherId = chatData.otherId;
        if (!otherId) {
            showToast('Нельзя заблокировать группу или бота', true);
            return;
        }
        
        const { data: existing } = await supabaseClient
            .from('blocked_users')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('blocked_user_id', otherId)
            .maybeSingle();
        
        if (existing) {
            showToast('Пользователь уже заблокирован', true);
            return;
        }
        
        await supabaseClient
            .from('blocked_users')
            .insert({
                user_id: currentUser.id,
                blocked_user_id: otherId,
                created_at: new Date().toISOString()
            });
        
        if (currentChat?.id === chatId) {
            if (typeof closeChat === 'function') closeChat();
        }
        
        await supabaseClient.from('chats').delete().eq('id', chatId);
        await supabaseClient.from('messages').delete().eq('chat_id', chatId);
        
        if (messagesCache.has(chatId)) {
            messagesCache.delete(chatId);
        }
        
        showToast(`🚫 ${userName} заблокирован`);
        if (typeof loadDialogs === 'function') await loadDialogs();
    } catch (err) {
        if (err.code === '23505') {
            showToast('Пользователь уже заблокирован', true);
        } else {
            showToast('Ошибка: ' + err.message, true);
        }
    }
}

async function deleteChat(chatId) {
    // Проверяем, что это не чат с ботом
    const chat = window.currentDialogMenuChat?.data;
    if (chat?.isBot || chatId === SAVED_CHAT_ID) {
        showToast('Нельзя удалить чат с ботом', true);
        return;
    }
    
    const confirmed = await modal.confirm('Удалить чат? Восстановить будет невозможно', 'Подтверждение');
    if (!confirmed) return;
    
    try {
        await supabaseClient.from('messages').delete().eq('chat_id', chatId);
        await supabaseClient.from('chats').delete().eq('id', chatId);
        
        if (currentChat?.id === chatId) {
            if (typeof closeChat === 'function') closeChat();
        }
        
        if (messagesCache.has(chatId)) {
            messagesCache.delete(chatId);
        }
        
        showToast('Чат удалён');
        if (typeof loadDialogs === 'function') await loadDialogs();
    } catch (err) {
        showToast('Ошибка: ' + err.message, true);
    }
}

window.attachDialogContextMenu = attachDialogContextMenu;
window.showDialogMenu = showDialogMenu;
window.togglePinChat = togglePinChat;
window.toggleReadChat = toggleReadChat;
window.toggleMuteChat = toggleMuteChat;
window.clearChatHistory = clearChatHistory;
window.blockUser = blockUser;
window.deleteChat = deleteChat;
