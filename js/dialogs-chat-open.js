// dialogs-chat-open.js — открытие чатов

function updateChatHeaderAvatar(userProfile, options = {}) {
    const avatarBtn = document.getElementById('chat-user-avatar');
    if (!avatarBtn) return;

    const isHidden = options.hidden === true || !userProfile;
    const isBot = userProfile?.id === BOT_USER_ID;
    const isSaved = userProfile?.id === SAVED_CHAT_ID;
    const isGroup = options.isGroup === true;

    if (isHidden || isSaved) {
        avatarBtn.style.display = 'none';
        avatarBtn.onclick = null;
        return;
    }

    avatarBtn.style.display = 'inline-flex';
    avatarBtn.classList.toggle('bot-avatar', isBot);
    avatarBtn.classList.toggle('group-avatar', isGroup);
    avatarBtn.title = isGroup ? 'Информация о группе' : 'Открыть профиль';
    
    if (isGroup) {
        avatarBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>`;
    } else if (isBot) {
        avatarBtn.innerHTML = '<img src="lumina.svg" alt="Bot" style="width:100%;height:100%;object-fit:cover;">';
    } else if (userProfile.avatar_url) {
        avatarBtn.innerHTML = `<img src="${escapeHtml(userProfile.avatar_url)}" alt="${escapeHtml(userProfile.full_name || userProfile.username)}" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
        avatarBtn.innerHTML = escapeHtml((userProfile.full_name || userProfile.username || '?').charAt(0).toUpperCase());
        avatarBtn.style.background = 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))';
    }

    if (!isGroup) {
        avatarBtn.onclick = () => {
            if (typeof openProfileModal !== 'function') return;
            openProfileModal(userProfile, { readOnly: userProfile.id !== currentUser?.id });
        };
    }
}

function setMessagesLoadingState(container, isLoading) {
    if (!container) return;
    container.classList.toggle('chat-loading', isLoading);
}

async function smoothLoadChatMessages(chatId, container) {
    setMessagesLoadingState(container, true);
    await new Promise(r => setTimeout(r, 80));
    await loadMessages(chatId);
    await new Promise(r => setTimeout(r, 60));
    setMessagesLoadingState(container, false);
}

async function openGroupChat(chatId, groupInfo) {
    if (isOpeningChat) { pendingChatId = chatId; return; }
    if (currentChat?.id === chatId) return;

    isOpeningChat = true;
    const messagesContainer = document.getElementById('messages');

    try {
        if (messagesContainer) setMessagesLoadingState(messagesContainer, true);

        currentChat = { id: chatId, type: 'group', is_group: true, group: groupInfo };

        const chatTitle = document.getElementById('chat-title');
        if (chatTitle) chatTitle.textContent = groupInfo?.name || 'Группа';

        const avatarBtn = document.getElementById('chat-user-avatar');
        if (avatarBtn) {
            avatarBtn.style.display = 'inline-flex';
            avatarBtn.classList.remove('bot-avatar');
            avatarBtn.classList.add('group-avatar');
            avatarBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>`;
            avatarBtn.title = 'Информация о группе';
            avatarBtn.onclick = () => {
                if (typeof showGroupProfile === 'function') showGroupProfile(groupInfo.id);
            };
        }
        
        const chatStatus = document.querySelector('.chat-status');
        if (chatStatus) {
            chatStatus.textContent = `${groupInfo?.member_count || 0} участников`;
            chatStatus.className = 'chat-status';
            chatStatus.style.color = '';
            chatStatus.removeAttribute('data-online');
        }
        
        const inputZone = document.querySelector('.input-zone');
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('btn-send-msg');
        if (inputZone) inputZone.style.display = 'block';
        if (messageInput) { messageInput.disabled = false; messageInput.placeholder = 'Написать в группу...'; }
        if (sendButton) sendButton.disabled = false;

        setupTypingIndicator();
        await smoothLoadChatMessages(chatId, messagesContainer);
        subscribeToMessages(chatId);
        subscribeToTyping(chatId);

        setTimeout(() => markChatMessagesAsRead(chatId), 500);

        document.querySelectorAll('.dialog-item').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.chatId === chatId) el.classList.add('active');
        });

        if (isMobileDevice()) openChatMobile(chatId);

    } finally {
        if (messagesContainer) setMessagesLoadingState(messagesContainer, false);
        isOpeningChat = false;
    }
}

async function openChat(chatId, otherUserId, otherUser) {
    if (otherUserId && otherUserId !== BOT_USER_ID) {
        const { data: isBlocked } = await supabaseClient
            .from('blocked_users')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('blocked_user_id', otherUserId)
            .maybeSingle();
        
        if (isBlocked) {
            showToast('Пользователь заблокирован. Разблокируйте его в настройках.', true);
            return;
        }
        
        const userExists = await checkUserExists(otherUserId);
        if (!userExists) {
            showToast('Пользователь удалён', true);
            await supabaseClient.from('chats').delete().eq('id', chatId);
            await loadDialogs();
            return;
        }
    }
    if (isOpeningChat) { pendingChatId = chatId; return; }
    if (currentChat?.id === chatId) {
        if (isMobileDevice()) openChatMobile(chatId);
        return;
    }

    isOpeningChat = true;
    const messagesContainer = document.getElementById('messages');

    try {
        if (messagesContainer) setMessagesLoadingState(messagesContainer, true);

        const isBot = otherUserId === BOT_USER_ID;
        currentChat = { id: chatId, type: 'private', other_user: otherUser || (isBot ? BOT_PROFILE : null) };

        const chatTitle = document.getElementById('chat-title');
        if (chatTitle) {
            const name = otherUser?.full_name || otherUser?.username || (isBot ? 'Lumina Bot' : 'Чат');
            const verifiedBadge = (!isBot && otherUser?.is_verified === true) ? '<span class="verified-user-badge" style="margin-left: 6px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span>' : '';
            chatTitle.innerHTML = isBot
                ? `<span class="bot-badge left-badge">Бот</span>${escapeHtml(name)}<span class="bot-verify-inline"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span>`
                : escapeHtml(name) + verifiedBadge;
        }
        updateChatHeaderAvatar(otherUser || (isBot ? BOT_PROFILE : null));

        if (!isBot && otherUserId) {
            const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', otherUserId).maybeSingle();
            if (profile) {
                if (typeof updateChatStatusFromProfile === 'function') updateChatStatusFromProfile(profile);
                subscribeToUserStatus(otherUserId);
                subscribeToTyping(chatId);
            }
        } else if (isBot) {
            const cs = document.querySelector('.chat-status');
            if (cs) { cs.textContent = 'бот'; cs.className = 'chat-status status-bot'; }
        }

        const inputZone = document.querySelector('.input-zone');
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('btn-send-msg');

        if (isBot) {
            if (inputZone) inputZone.style.display = 'none';
            if (messageInput) messageInput.disabled = true;
            if (sendButton) sendButton.disabled = true;
        } else {
            if (inputZone) inputZone.style.display = 'block';
            if (messageInput) { messageInput.disabled = false; messageInput.placeholder = 'Написать сообщение...'; }
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

        if (isMobileDevice()) openChatMobile(chatId);

    } finally {
        if (messagesContainer) setMessagesLoadingState(messagesContainer, false);
        isOpeningChat = false;
        if (pendingChatId && pendingChatId !== chatId) {
            const pending = pendingChatId;
            pendingChatId = null;
            const el = document.querySelector(`.dialog-item[data-chat-id="${pending}"]`);
            if (el) await openChat(pending, el.dataset.otherUserId, null);
        }
    }
}

async function openSavedChat(chatId) {
    if (isOpeningChat) return;
    if (currentChat?.id === chatId) {
        if (isMobileDevice()) openChatMobile(chatId);
        return;
    }

    isOpeningChat = true;
    const messagesContainer = document.getElementById('messages');

    try {
        if (messagesContainer) setMessagesLoadingState(messagesContainer, true);

        currentChat = { id: chatId, type: 'saved', other_user: SAVED_CHAT };

        const chatTitle = document.getElementById('chat-title');
        if (chatTitle) chatTitle.textContent = 'Избранное';
        updateChatHeaderAvatar(SAVED_CHAT, { hidden: true });

        const cs = document.querySelector('.chat-status');
        if (cs) { cs.textContent = 'личное'; cs.className = 'chat-status'; }

        const inputZone = document.querySelector('.input-zone');
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('btn-send-msg');
        if (inputZone) inputZone.style.display = 'block';
        if (messageInput) { messageInput.disabled = false; messageInput.placeholder = 'Сохранить сообщение...'; }
        if (sendButton) sendButton.disabled = false;

        await smoothLoadChatMessages(chatId, messagesContainer);
        subscribeToMessages(chatId);

        document.querySelectorAll('.dialog-item').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.chatId === chatId) el.classList.add('active');
        });

        if (isMobileDevice()) openChatMobile(chatId);

    } finally {
        if (messagesContainer) setMessagesLoadingState(messagesContainer, false);
        isOpeningChat = false;
    }
}

window.updateChatHeaderAvatar = updateChatHeaderAvatar;
window.setMessagesLoadingState = setMessagesLoadingState;
window.smoothLoadChatMessages = smoothLoadChatMessages;
window.openChat = openChat;
window.openSavedChat = openSavedChat;
window.openGroupChat = openGroupChat;
