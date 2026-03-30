// dialogs.js - Управление диалогами

async function loadDialogs(searchTerm = '') {
    const container = document.getElementById('dialogs-list');
    if (!container) return;
    
    const isUserSearch = searchTerm.startsWith('@');
    
    if (isUserSearch && searchTerm.length > 1) {
        await loadUserSearchResults(searchTerm, container);
        return;
    }
    
    if (isUpdatingDialogs) return;
    isUpdatingDialogs = true;
    
    try {
        // Исправленный запрос - убираем select=* из URL, используем .select()
        const { data: chats, error: chatsError } = await supabaseClient
            .from('chats')
            .select('*')
            .contains('participants', [currentUser.id])
            .order('updated_at', { ascending: false });
        
        if (chatsError) {
            console.error('Ошибка загрузки чатов:', chatsError);
            throw chatsError;
        }
        
        const validChats = [];
        for (const chat of chats || []) {
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
                    console.log(`🗑️ Удаляем мертвый чат: ${chat.id}`);
                    await supabaseClient.from('chats').delete().eq('id', chat.id);
                    await supabaseClient.from('messages').delete().eq('chat_id', chat.id);
                }
            }
        }
        
        // Получаем непрочитанные сообщения
        let unreadCounts = new Map();
        if (validChats.length > 0) {
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
        }
        
        // Получаем последние сообщения
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
                if (text && text.length > 50) text = text.slice(0, 47) + '...';
                lastMessages.set(chat.id, prefix + text);
            }
        }
        
        // Получаем профили участников
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
        
        // Формируем данные для отображения
        const chatData = [];
        for (const chat of validChats) {
            const otherId = chat.participants?.find(id => id !== currentUser.id);
            
            // Чат "Избранное"
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
            
            // Обычный чат или чат с ботом
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
        
        // Фильтрация по поиску
        let filteredData = chatData;
        if (searchTerm && !isUserSearch) {
            filteredData = chatData.filter(chat => 
                chat.name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        
        renderDialogsList(container, filteredData);
        
    } catch (err) {
        console.error('Ошибка загрузки диалогов:', err);
        if (container.children.length === 0) {
            container.innerHTML = '<div class="dialogs-loading">Ошибка загрузки диалогов</div>';
        }
    } finally {
        isUpdatingDialogs = false;
    }
}

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
        if (chat.isBot) {
            avatarHtml = '<img src="lumina.svg" alt="Bot">';
        } else if (chat.isSaved) {
            avatarHtml = '<img src="favourite.svg" alt="Saved">';
        } else {
            avatarHtml = `<div class="avatar-letter">${escapeHtml(chat.name.charAt(0))}</div>`;
        }
        
        div.innerHTML = `
            <div class="dialog-avatar ${chat.isBot ? 'bot-avatar' : ''} ${chat.isSaved ? 'saved-avatar' : ''}">
                ${avatarHtml}
                ${chat.isBot ? '<div class="verified-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' : ''}
                ${!chat.isBot && !chat.isSaved ? `<div class="online-dot ${isOnline ? '' : 'hidden'}"></div>` : ''}
            </div>
            <div class="dialog-info">
                <div class="dialog-name">
                    ${escapeHtml(chat.name)}
                    ${chat.isBot ? '<span class="bot-badge">Бот</span>' : ''}
                    ${chat.isSaved ? '<span class="saved-badge">⭐</span>' : ''}
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

async function loadUserSearchResults(searchTerm, container) {
    const users = await searchUsersByUsername(searchTerm);
    
    container.innerHTML = `
        <div class="search-header">
            <span class="search-title">👥 Найдено пользователей: ${users.length}</span>
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
            <div class="dialog-avatar">
                <div class="avatar-letter">${escapeHtml(name.charAt(0))}</div>
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
                const chatId = await getOrCreatePrivateChat(user.id);
                await openChat(chatId, user.id, user);
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

// Эти функции должны быть определены в других файлах, но для безопасности проверяем их наличие
async function openChat(chatId, otherUserId, otherUser) {
    if (typeof window.openChatImpl === 'function') {
        return window.openChatImpl(chatId, otherUserId, otherUser);
    }
    console.error('openChat не определена');
}

async function openSavedChat(chatId) {
    if (typeof window.openSavedChatImpl === 'function') {
        return window.openSavedChatImpl(chatId);
    }
    console.error('openSavedChat не определена');
}

// Экспортируем функции в глобальный объект
window.loadDialogs = loadDialogs;
window.renderDialogsList = renderDialogsList;
window.loadUserSearchResults = loadUserSearchResults;
window.openChat = openChat;
window.openSavedChat = openSavedChat;
