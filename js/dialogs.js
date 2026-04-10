// dialogs.js — диалоги + группы + плавная загрузка

function renderDialogsList(container, filteredData) {
    container.innerHTML = '';

    if (filteredData.length === 0) {
        container.innerHTML = `
            <div class="dialogs-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <p>Нет диалогов.<br>Введите @username для поиска</p>
            </div>
        `;
        return;
    }

    filteredData.forEach((chat, i) => {
        const div = document.createElement('div');
        div.className = [
            'dialog-item',
            currentChat?.id === chat.id ? 'active' : '',
            chat.unreadCount > 0 ? 'unread-dialog' : '',
            chat.isSaved ? 'saved-dialog' : '',
            chat.isGroup ? 'group-dialog' : ''
        ].filter(Boolean).join(' ');
        div.dataset.chatId = chat.id;
        div.dataset.otherUserId = chat.otherId || '';
        div.style.animationDelay = `${i * 30}ms`;

        const unreadBadge = chat.unreadCount > 0
            ? `<span class="unread-badge-count">${chat.unreadCount > 99 ? '99+' : chat.unreadCount}</span>` : '';

        let avatarHtml = '';
        if (chat.isBot) {
            avatarHtml = '<img src="lumina.svg" alt="Bot" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
        } else if (chat.isSaved) {
            avatarHtml = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
        } else if (chat.isGroup) {
            avatarHtml = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>`;
        } else if (chat.otherUser?.avatar_url) {
            avatarHtml = `<img src="${escapeHtml(chat.otherUser.avatar_url)}" alt="${escapeHtml(chat.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            avatarHtml = `<div class="avatar-letter">${escapeHtml(chat.name.charAt(0))}</div>`;
        }

        const isOnline = chat.isOnline === true && !chat.isGroup && !chat.isBot && !chat.isSaved;

        const groupBadgeHtml = chat.isGroup ? `
            <span class="group-badge">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
            </span>
        ` : '';

        const verifiedBadge = (!chat.isBot && !chat.isGroup && !chat.isSaved && chat.otherUser?.is_verified === true) 
            ? '<span class="verified-user-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span>' 
            : '';

        div.innerHTML = `
            <div class="dialog-avatar ${chat.isBot ? 'bot-avatar' : ''} ${chat.isSaved ? 'saved-avatar' : ''} ${chat.isGroup ? 'group-avatar' : ''}">
                ${avatarHtml}
                ${isOnline ? '<div class="online-dot"></div>' : ''}
            </div>
            <div class="dialog-info">
                <div class="dialog-name">
                    ${chat.isBot ? '<span class="bot-badge left-badge">Бот</span>' : ''}
                    ${groupBadgeHtml}
                    ${escapeHtml(chat.name)}
                    ${verifiedBadge}
                    ${chat.isBot ? '<span class="bot-verify-inline"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span>' : ''}
                    ${unreadBadge}
                </div>
                <div class="dialog-preview">${escapeHtml(chat.lastMessage || '')}</div>
            </div>
        `;

        div.onclick = async () => {
            document.querySelectorAll('.dialog-item').forEach(el => el.classList.remove('active'));
            div.classList.add('active');

            if (chat.isSaved) {
                await openSavedChat(chat.id);
            } else if (chat.isGroup) {
                await openGroupChat(chat.id, chat.groupInfo);
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
        const userId = window.currentUser?.id || currentUser?.id;
        if (!userId) {
            console.error('loadDialogs: currentUser не определён');
            container.innerHTML = '<div class="dialogs-empty">Ошибка загрузки</div>';
            isUpdatingDialogs = false;
            return;
        }

        const { data: allChats, error } = await supabaseClient
            .from('chats')
            .select('id, type, participants, updated_at, created_at, last_message, is_group, group_id')
            .order('updated_at', { ascending: false });

        if (error) throw error;

        const chats = (allChats || []).filter(c =>
            c.participants && c.participants.includes(userId)
        );

        const groupIds = chats.filter(c => c.is_group && c.group_id).map(c => c.group_id);
        let groupsMap = new Map();
        if (groupIds.length > 0) {
            const { data: groups } = await supabaseClient
                .from('groups')
                .select('id, name, description, member_count, avatar_emoji')
                .in('id', groupIds);
            if (groups) groups.forEach(g => groupsMap.set(g.id, g));
        }

        const validChats = [];
        for (const chat of chats) {
            if (chat.is_group) {
                validChats.push(chat);
                continue;
            }
            const otherId = chat.participants?.find(id => id !== userId);
            if (!otherId || otherId === BOT_USER_ID || chat.id === SAVED_CHAT_ID) {
                validChats.push(chat);
                continue;
            }
            const userExists = await checkUserExists(otherId);
            if (userExists) {
                validChats.push(chat);
            } else {
                await supabaseClient.from('chats').delete().eq('id', chat.id);
                await supabaseClient.from('messages').delete().eq('chat_id', chat.id);
            }
        }

        if (validChats.length === 0) {
            container.innerHTML = '<div class="dialogs-empty">Нет диалогов</div>';
            isUpdatingDialogs = false;
            return;
        }

        const { data: unreadData } = await supabaseClient
            .from('messages')
            .select('chat_id')
            .eq('is_read', false)
            .neq('user_id', userId)
            .in('chat_id', validChats.map(c => c.id));

        const unreadCounts = new Map();
        (unreadData || []).forEach(m => {
            unreadCounts.set(m.chat_id, (unreadCounts.get(m.chat_id) || 0) + 1);
        });

        const lastMessages = new Map();
        for (const chat of validChats) {
            const cached = messagesCache.get(chat.id);
            if (cached && cached.length > 0) {
                const last = cached[cached.length - 1];
                const isOwn = last.user_id === userId;
                let text = last.text || '';
                if (text.length > MAX_MESSAGE_PREVIEW_LENGTH) text = text.slice(0, MAX_MESSAGE_PREVIEW_LENGTH - 3) + '...';
                lastMessages.set(chat.id, (isOwn ? 'Вы: ' : '') + text);
                continue;
            }

            const { data: lastMsg } = await supabaseClient
                .from('messages')
                .select('text, user_id, is_system')
                .eq('chat_id', chat.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (lastMsg) {
                if (lastMsg.is_system) {
                    let cleanText = lastMsg.text.replace(/[🎉✅⚠️❌👑🛡️👤➕👋✏️📝📢ℹ️]/g, '').trim();
                    lastMessages.set(chat.id, cleanText.slice(0, 40));
                } else {
                    const isOwn = lastMsg.user_id === userId;
                    let text = lastMsg.text || '';
                    if (text.length > MAX_MESSAGE_PREVIEW_LENGTH) text = text.slice(0, MAX_MESSAGE_PREVIEW_LENGTH - 3) + '...';
                    lastMessages.set(chat.id, (isOwn ? 'Вы: ' : '') + text);
                }
            }
        }

        const privateParticipantIds = validChats
            .filter(c => !c.is_group)
            .flatMap(c => c.participants || []);
        const uniqueIds = [...new Set(privateParticipantIds)];
        const profileMap = new Map();

        if (uniqueIds.length > 0) {
            const { data: profiles } = await supabaseClient
                .from('profiles')
                .select('id, full_name, username, bio, last_seen, is_online, is_verified, avatar_url')
                .in('id', uniqueIds);
            if (profiles) profiles.forEach(p => profileMap.set(p.id, p));
        }
        profileMap.set(BOT_USER_ID, { ...BOT_PROFILE, is_verified: true });

        const chatData = [];
        for (const chat of validChats) {
            if (chat.is_group) {
                const group = groupsMap.get(chat.group_id);
                if (!group) continue;
                chatData.push({
                    id: chat.id,
                    isGroup: true,
                    groupInfo: { ...group, chat_id: chat.id },
                    name: group.name,
                    unreadCount: unreadCounts.get(chat.id) || 0,
                    lastMessage: lastMessages.get(chat.id) || `${group.member_count || 0} участников`
                });
                continue;
            }

            if (chat.id === SAVED_CHAT_ID) {
                chatData.push({
                    id: chat.id,
                    otherId: SAVED_CHAT_ID,
                    otherUser: SAVED_CHAT,
                    name: 'Избранное',
                    isSaved: true,
                    unreadCount: 0,
                    lastMessage: lastMessages.get(chat.id) || 'Сохранённые сообщения'
                });
                continue;
            }

            const otherId = chat.participants?.find(id => id !== userId);
            const otherUser = profileMap.get(otherId);
            if (!otherUser && otherId !== BOT_USER_ID) continue;

            const isBot = otherId === BOT_USER_ID;
            const status = otherUser ? getUserStatusFromProfile(otherUser) : { class: '' };

            chatData.push({
                id: chat.id,
                otherId,
                otherUser,
                name: otherUser?.full_name || otherUser?.username || 'Пользователь',
                isBot,
                isSaved: false,
                unreadCount: unreadCounts.get(chat.id) || 0,
                lastMessage: lastMessages.get(chat.id) || 'Нет сообщений',
                isOnline: status.class === 'status-online'
            });
        }

        let filteredData = chatData;
        if (searchTerm && !isUserSearch) {
            filteredData = chatData.filter(c =>
                c.name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        renderDialogsList(container, filteredData);
    } catch (err) {
        console.error('Ошибка loadDialogs:', err);
        container.innerHTML = '<div class="dialogs-empty">Ошибка загрузки</div>';
    } finally {
        isUpdatingDialogs = false;
    }
}

async function loadUserSearchResults(searchTerm, container) {
    const users = await searchUsersByUsername(searchTerm);

    container.innerHTML = `
        <div class="search-header">
            <span class="search-title">Найдено: ${users.length}</span>
        </div>
    `;

    if (users.length === 0) {
        container.innerHTML += '<div class="dialogs-empty">Пользователи не найдены</div>';
        return;
    }

    users.forEach(user => {
        const name = user.full_name || user.username;
        const verifiedBadge = user.is_verified === true ? '<span class="verified-user-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span>' : '';
        
        let avatarHtml = '';
        if (user.isBot) {
            avatarHtml = '<img src="lumina.svg" alt="Bot" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
        } else if (user.isSaved) {
            avatarHtml = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
        } else if (user.avatar_url) {
            avatarHtml = `<img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            avatarHtml = `<div class="avatar-letter">${escapeHtml(name.charAt(0))}</div>`;
        }
        
        const div = document.createElement('div');
        div.className = 'dialog-item user-search-item';
        div.innerHTML = `
            <div class="dialog-avatar ${user.isBot ? 'bot-avatar' : ''} ${user.isSaved ? 'saved-avatar' : ''}" style="${!user.isBot && !user.isSaved ? 'background: linear-gradient(135deg, var(--accent-blue), var(--accent-cyan));' : ''}">
                ${avatarHtml}
            </div>
            <div class="dialog-info">
                <div class="dialog-name">
                    ${escapeHtml(name)}
                    ${verifiedBadge}
                    <span class="username-hint">@${escapeHtml(user.username)}</span>
                </div>
                <div class="dialog-preview">Нажмите, чтобы открыть чат</div>
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
                const si = document.getElementById('search-dialogs');
                if (si) si.value = '';
                loadDialogs();
            } catch {
                showToast('Ошибка создания чата', true);
            }
        };
        container.appendChild(div);
    });
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

window.loadDialogs = loadDialogs;
window.renderDialogsList = renderDialogsList;
window.loadUserSearchResults = loadUserSearchResults;
window.openChat = openChat;
window.openSavedChat = openSavedChat;
window.openGroupChat = openGroupChat;
window.updateChatHeaderAvatar = updateChatHeaderAvatar;
window.setMessagesLoadingState = setMessagesLoadingState;
window.smoothLoadChatMessages = smoothLoadChatMessages;
