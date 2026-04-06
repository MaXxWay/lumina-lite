function renderDialogsList(container, filteredData) {
    container.innerHTML = '';
    
    if (filteredData.length === 0) {
        container.innerHTML = '<div class="dialogs-loading">Нет диалогов. Введите @username для поиска</div>';
        return;
    }
    
    filteredData.forEach(chat => {
        const div = document.createElement('div');
        div.className = `dialog-item ${currentChat?.id === chat.id ? 'active' : ''} ${chat.unreadCount > 0 ? 'unread-dialog' : ''} ${chat.isSaved ? 'saved-dialog' : ''}`;
        div.dataset.chatId = chat.id;
        div.dataset.otherUserId = chat.otherId || '';
        
        const unreadBadge = chat.unreadCount > 0 ? 
            `<span class="unread-badge-count">${chat.unreadCount > 99 ? '99+' : chat.unreadCount}</span>` : '';
        
        const isOnline = chat.isOnline === true;
        
       let avatarHtml = '';
// Проверяем бота ИЛИ конкретный email для галочки
const isVerified = chat.isBot || chat.email === 'itzwayss@lumina.local';

if (chat.isBot) {
    avatarHtml = '<img src="lumina.svg" alt="Bot">';
} else if (chat.isSaved) {
    // ... ваш код для Избранного ...
} else {
    const letter = (chat.name || '?')[0].toUpperCase();
    // Добавляем проверку isVerified здесь
    avatarHtml = `
        ${letter}
        ${isVerified ? `<div class="verified-badge"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>` : ''}
    `;
}
            // Избранное - синяя аватарка с иконкой закладки
            avatarHtml = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
        } else {
            avatarHtml = `<div class="avatar-letter">${escapeHtml(chat.name.charAt(0))}</div>`;
        }
        
        div.innerHTML = `
            <div class="dialog-avatar ${chat.isBot ? 'bot-avatar' : ''} ${chat.isSaved ? 'saved-avatar' : ''}">
                ${avatarHtml}
                ${!chat.isBot && !chat.isSaved ? `<div class="online-dot ${isOnline ? '' : 'hidden'}"></div>` : ''}
            </div>
            <div class="dialog-info">
                <div class="dialog-name">
                    ${chat.isBot ? '<span class="bot-badge left-badge">Бот</span>' : ''}
                    ${escapeHtml(chat.name)}
                    ${chat.isBot ? '<span class="bot-verify-inline"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>' : ''}
                    ${unreadBadge}
                </div>
                <div class="dialog-preview">${escapeHtml(chat.lastMessage || '')}</div>
            </div>
        `;
        
        div.onclick = async () => {
            if (chat.isSaved) {
                await openSavedChat(chat.id);
            } else {
                await openChat(chat.id, chat.otherId, chat.otherUser);
            }
            if (chat.unreadCount > 0 && !chat.isSaved) {
                await markChatMessagesAsRead(chat.id);
            }
        };
        
        container.appendChild(div);
    });
}

function updateChatHeaderAvatar(userProfile, options = {}) {
    const avatarBtn = document.getElementById('chat-user-avatar');
    if (!avatarBtn) return;

    const isHidden = options.hidden === true || !userProfile;
    const isBot = userProfile?.id === BOT_USER_ID;
    const isSaved = userProfile?.id === SAVED_CHAT_ID;

    if (isHidden || isSaved) {
        avatarBtn.style.display = 'none';
        avatarBtn.onclick = null;
        avatarBtn.classList.remove('bot-avatar');
        avatarBtn.textContent = '?';
        return;
    }

    avatarBtn.style.display = 'inline-flex';
    avatarBtn.classList.toggle('bot-avatar', isBot);
    avatarBtn.title = 'Открыть профиль';
    avatarBtn.innerHTML = isBot ? '<img src="lumina.svg" alt="Bot">' : escapeHtml((userProfile.full_name || userProfile.username || '?').charAt(0).toUpperCase());
    avatarBtn.onclick = () => {
        if (typeof openProfileModal !== 'function') return;
        openProfileModal(userProfile, { readOnly: userProfile.id !== currentUser?.id });
    };
}

function setMessagesLoadingState(container, isLoading) {
    if (!container) return;
    container.classList.toggle('chat-loading', isLoading);
}

async function smoothLoadChatMessages(chatId, container) {
    setMessagesLoadingState(container, true);
    // Let CSS transition start before replacing message list.
    await new Promise(resolve => setTimeout(resolve, 90));
    await loadMessages(chatId);
    // Keep a tiny tail so fade-in feels continuous.
    await new Promise(resolve => setTimeout(resolve, 70));
    setMessagesLoadingState(container, false);
}

async function loadDialogs(searchTerm = '') {
    const container = document.getElementById('dialogs-list');
    if (!container) return;
    
    const isUserSearch = searchTerm && searchTerm.startsWith('@');
    
    if (isUserSearch && searchTerm.length > 1) {
        await loadUserSearchResults(searchTerm, container);
        return;
    }
    
    if (isUpdatingDialogs) return;
    isUpdatingDialogs = true;
    
    try {
        const { data: allChats, error: chatsError } = await supabaseClient
            .from('chats')
            .select('id, type, participants, updated_at, created_at, last_message');
        
        if (chatsError) throw chatsError;
        
        const chats = (allChats || []).filter(chat => 
            chat.participants && chat.participants.includes(currentUser.id)
        );
        
        chats.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        
        const validChats = [];
        for (const chat of chats) {
            const otherId = chat.participants?.find(id => id !== currentUser.id);
            
            if (otherId === BOT_USER_ID || chat.id === SAVED_CHAT_ID) {
                validChats.push(chat);
                continue;
            }
            
            if (otherId) {
                const userExists = await checkUserExists(otherId);
                if (userExists) {
                    validChats.push(chat);
                } else {
                    await supabaseClient.from('chats').delete().eq('id', chat.id);
                    await supabaseClient.from('messages').delete().eq('chat_id', chat.id);
                }
            }
        }
        
        if (validChats.length === 0) {
            container.innerHTML = '<div class="dialogs-loading">Нет диалогов</div>';
            isUpdatingDialogs = false;
            return;
        }
        
        let unreadCounts = new Map();
        const { data: unreadData } = await supabaseClient
            .from('messages')
            .select('chat_id')
            .eq('is_read', false)
            .neq('user_id', currentUser.id)
            .in('chat_id', validChats.map(c => c.id));
        
        if (unreadData) {
            unreadData.forEach(msg => {
                unreadCounts.set(msg.chat_id, (unreadCounts.get(msg.chat_id) || 0) + 1);
            });
        }
        
        const lastMessages = new Map();
        for (const chat of validChats) {
            const { data: lastMsg } = await supabaseClient
                .from('messages')
                .select('text, user_id')
                .eq('chat_id', chat.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            
            if (lastMsg) {
                const isOwn = lastMsg.user_id === currentUser.id;
                const prefix = isOwn ? 'Вы: ' : '';
                let text = lastMsg.text || '';
                if (text.length > window.MAX_MESSAGE_PREVIEW_LENGTH) {
                    text = text.slice(0, window.MAX_MESSAGE_PREVIEW_LENGTH - 3) + '...';
                }
                lastMessages.set(chat.id, prefix + text);
            }
        }
        
        const allParticipantIds = validChats.flatMap(c => c.participants || []);
        const uniqueIds = [...new Set(allParticipantIds)];
        
        const profileMap = new Map();
        if (uniqueIds.length > 0) {
            const { data: profiles } = await supabaseClient
                .from('profiles')
                .select('id, full_name, username, last_seen, is_online')
                .in('id', uniqueIds);
            
            if (profiles) {
                profiles.forEach(p => profileMap.set(p.id, p));
            }
        }
        profileMap.set(BOT_USER_ID, BOT_PROFILE);
        
        const chatData = [];
        for (const chat of validChats) {
            const otherId = chat.participants?.find(id => id !== currentUser.id);
            
            if (chat.id === SAVED_CHAT_ID) {
                chatData.push({
                    id: chat.id,
                    otherId: SAVED_CHAT_ID,
                    otherUser: SAVED_CHAT,
                    name: 'Избранное',
                    isSaved: true,
                    isBot: false,
                    unreadCount: 0,
                    lastMessage: lastMessages.get(chat.id) || 'Сохраненные сообщения',
                    isOnline: false
                });
                continue;
            }
            
            const otherUser = profileMap.get(otherId);
            if (!otherUser && otherId !== BOT_USER_ID) continue;
            
            const name = otherUser?.full_name || otherUser?.username || 'Пользователь';
            const isBot = otherId === BOT_USER_ID;
            const unreadCount = unreadCounts.get(chat.id) || 0;
            const status = otherUser ? getUserStatusFromProfile(otherUser) : { class: '' };
            const isOnline = status.class === 'status-online';
            
            chatData.push({
                id: chat.id,
                otherId,
                otherUser,
                name,
                isBot,
                isSaved: false,
                unreadCount,
                lastMessage: lastMessages.get(chat.id) || 'Нет сообщений',
                isOnline: isOnline
            });
        }
        
        let filteredData = chatData;
        if (searchTerm && !isUserSearch) {
            filteredData = chatData.filter(chat => 
                chat.name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        
        renderDialogsList(container, filteredData);
        
    } catch (err) {
        console.error('Ошибка:', err);
        container.innerHTML = '<div class="dialogs-loading">Ошибка загрузки</div>';
    } finally {
        isUpdatingDialogs = false;
    }
}

async function loadUserSearchResults(searchTerm, container) {
    const users = await searchUsersByUsername(searchTerm);
    
    container.innerHTML = `
        <div class="search-header">
            <span class="search-title search-title-with-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                Найдено пользователей: ${users.length}
            </span>
        </div>
    `;
    
    if (users.length === 0) {
        container.innerHTML += '<div class="dialogs-loading">Пользователи не найдены</div>';
        return;
    }
    
    for (const user of users) {
        const name = user.full_name || user.username;
        const div = document.createElement('div');
        div.className = 'dialog-item user-search-item';
        div.dataset.userId = user.id;
        div.innerHTML = `
            <div class="dialog-avatar ${user.isBot ? 'bot-avatar' : ''} ${user.isSaved ? 'saved-avatar' : ''}">
                ${user.isBot
                    ? '<img src="lumina.svg" alt="Bot">'
                    : (user.isSaved
                        ? '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'
                        : `<div class="avatar-letter">${escapeHtml(name.charAt(0))}</div>`)}
            </div>
            <div class="dialog-info">
                <div class="dialog-name">
                    ${escapeHtml(name)}
                    <span class="username-hint">@${escapeHtml(user.username)}</span>
                </div>
                <div class="dialog-preview">Нажмите, чтобы начать чат</div>
            </div>
        `;
        div.onclick = async () => {
            try {
                if (user.isSaved || user.id === SAVED_CHAT_ID) {
                    await ensureSavedChat();
                    await openSavedChat(SAVED_CHAT_ID);
                } else {
                    const chatId = await getOrCreatePrivateChat(user.id);
                    await openChat(chatId, user.id, user);
                }
                const searchInputElem = document.getElementById('search-dialogs');
                if (searchInputElem) searchInputElem.value = '';
                loadDialogs();
            } catch (err) {
                showToast('Ошибка создания чата', true);
            }
        };
        container.appendChild(div);
    }
}

async function openChat(chatId, otherUserId, otherUser) {
    if (otherUserId && otherUserId !== BOT_USER_ID) {
        const userExists = await checkUserExists(otherUserId);
        if (!userExists) {
            showToast('Пользователь удален, чат будет закрыт', true);
            await supabaseClient.from('chats').delete().eq('id', chatId);
            await supabaseClient.from('messages').delete().eq('chat_id', chatId);
            await loadDialogs();
            return;
        }
    }
    if (isOpeningChat) {
        pendingChatId = chatId;
        return;
    }
    if (currentChat?.id === chatId) return;
    
    isOpeningChat = true;
    
    try {
        const isBot = otherUserId === BOT_USER_ID;
        
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) setMessagesLoadingState(messagesContainer, true);
        
        currentChat = {
            id: chatId,
            type: 'private',
            other_user: otherUser || (isBot ? BOT_PROFILE : null)
        };
        
        const chatTitle = document.getElementById('chat-title');
        if (chatTitle) {
            const name = otherUser?.full_name || otherUser?.username || (isBot ? 'Lumina Bot' : 'Чат');
            chatTitle.innerHTML = isBot
                ? `<span class="bot-badge left-badge">Бот</span>${escapeHtml(name)}<span class="bot-verify-inline"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>`
                : escapeHtml(name);
        }
        updateChatHeaderAvatar(otherUser || (isBot ? BOT_PROFILE : null));
        
        if (!isBot && otherUserId) {
            const { data: profile } = await supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', otherUserId)
                .maybeSingle();
            
            if (profile) {
                if (typeof updateChatStatusFromProfile === 'function') updateChatStatusFromProfile(profile);
                subscribeToUserStatus(otherUserId);
                subscribeToTyping(chatId);
            }
        } else if (isBot) {
            const chatStatus = document.querySelector('.chat-status');
            if (chatStatus) {
                chatStatus.textContent = 'бот';
                chatStatus.className = 'chat-status status-bot';
            }
        }
        
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('btn-send-msg');
        const inputZone = document.querySelector('.input-zone');
        
        if (isBot) {
            if (inputZone) inputZone.style.display = 'none';
            if (messageInput) messageInput.disabled = true;
            if (sendButton) sendButton.disabled = true;
        } else {
            if (inputZone) inputZone.style.display = 'block';
            if (messageInput) {
                messageInput.disabled = false;
                messageInput.placeholder = 'Написать сообщение...';
                setTimeout(() => messageInput.focus(), 100);
            }
            if (sendButton) sendButton.disabled = false;
            setupTypingIndicator();
        }
        
        await smoothLoadChatMessages(chatId, messagesContainer);
        subscribeToMessages(chatId);
        
        setTimeout(async () => {
            await markChatMessagesAsRead(chatId);
            
            if (window.readStatusObservers) {
                window.readStatusObservers.observer?.disconnect();
                window.readStatusObservers.mutationObserver?.disconnect();
            }
            window.readStatusObservers = setupReadStatusObserver();
        }, 500);
        
        document.querySelectorAll('.dialog-item').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.chatId === chatId) el.classList.add('active');
        });
        
    } finally {
        const messagesContainer = document.getElementById('messages');
        setMessagesLoadingState(messagesContainer, false);
        isOpeningChat = false;
        if (pendingChatId && pendingChatId !== chatId) {
            const pending = pendingChatId;
            pendingChatId = null;
            const pendingDialog = document.querySelector(`.dialog-item[data-chat-id="${pending}"]`);
            if (pendingDialog) {
                const otherId = pendingDialog.dataset.otherUserId;
                await openChat(pending, otherId, null);
            }
        }
    }
}

async function openSavedChat(chatId) {
    if (isOpeningChat) return;
    if (currentChat?.id === chatId) return;
    
    isOpeningChat = true;
    
    try {
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) setMessagesLoadingState(messagesContainer, true);
        
        currentChat = {
            id: chatId,
            type: 'saved',
            other_user: SAVED_CHAT
        };
        
        const chatTitle = document.getElementById('chat-title');
        if (chatTitle) {
            chatTitle.innerHTML = 'Избранное';
        }
        updateChatHeaderAvatar(SAVED_CHAT, { hidden: true });
        
        const chatStatus = document.querySelector('.chat-status');
        if (chatStatus) {
            chatStatus.textContent = 'личное';
            chatStatus.className = 'chat-status status-offline';
        }
        
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('btn-send-msg');
        const inputZone = document.querySelector('.input-zone');
        
        if (inputZone) inputZone.style.display = 'block';
        if (messageInput) {
            messageInput.disabled = false;
            messageInput.placeholder = 'Сохранить сообщение...';
            setTimeout(() => messageInput.focus(), 100);
        }
        if (sendButton) sendButton.disabled = false;
        
        await smoothLoadChatMessages(chatId, messagesContainer);
        subscribeToMessages(chatId);
        
        document.querySelectorAll('.dialog-item').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.chatId === chatId) el.classList.add('active');
        });
        
    } finally {
        const messagesContainer = document.getElementById('messages');
        setMessagesLoadingState(messagesContainer, false);
        isOpeningChat = false;
    }
}

window.loadDialogs = loadDialogs;
window.renderDialogsList = renderDialogsList;
window.loadUserSearchResults = loadUserSearchResults;
window.openChat = openChat;
window.openSavedChat = openSavedChat;
