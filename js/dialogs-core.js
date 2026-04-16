// dialogs-core.js — основные функции для загрузки диалогов

window.isUpdatingDialogs = window.isUpdatingDialogs || false;
let dialogsSubscription = null;

// Подписка на новые чаты в реальном времени
function subscribeToNewChats() {
    if (dialogsSubscription) {
        supabaseClient.removeChannel(dialogsSubscription);
    }
    
    const userId = window.currentUser?.id || currentUser?.id;
    if (!userId) return;
    
    dialogsSubscription = supabaseClient.channel('new-chats')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'chats',
            filter: `participants=cs.{${userId}}`
        }, async (payload) => {
            console.log('Новый чат обнаружен:', payload.new);
            if (typeof loadDialogs === 'function') {
                await loadDialogs();
            }
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'chats',
            filter: `participants=cs.{${userId}}`
        }, async (payload) => {
            console.log('Чат обновлён:', payload.new);
            if (typeof loadDialogs === 'function') {
                await loadDialogs();
            }
        })
        .subscribe();
}

async function loadDialogs(searchTerm = '') {
    const container = document.getElementById('dialogs-list');
    if (!container) return;

    const isUserSearch = searchTerm && searchTerm.startsWith('@');
    if (isUserSearch && searchTerm.length > 1) {
        await loadUserSearchResults(searchTerm, container);
        return;
    }

    if (window.isUpdatingDialogs) return;
    window.isUpdatingDialogs = true;

    try {
        const userId = window.currentUser?.id || currentUser?.id;
        if (!userId) {
            console.error('loadDialogs: currentUser не определён');
            container.innerHTML = '<div class="dialogs-empty">Ошибка загрузки</div>';
            window.isUpdatingDialogs = false;
            return;
        }

        const { data: allChats, error } = await supabaseClient
            .from('chats')
            .select('id, type, participants, updated_at, created_at, last_message, is_group, group_id, is_pinned, is_muted')
            .order('is_pinned', { ascending: false })
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
            window.isUpdatingDialogs = false;
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
                    lastMessage: lastMessages.get(chat.id) || `${group.member_count || 0} участников`,
                    isPinned: chat.is_pinned || false,
                    isMuted: chat.is_muted || false
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
                    lastMessage: lastMessages.get(chat.id) || 'Сохранённые сообщения',
                    isPinned: chat.is_pinned || false,
                    isMuted: chat.is_muted || false
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
                isOnline: status.class === 'status-online',
                isPinned: chat.is_pinned || false,
                isMuted: chat.is_muted || false
            });
        }

        let filteredData = chatData;
        if (searchTerm && !isUserSearch) {
            filteredData = chatData.filter(c =>
                c.name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        
        const pinnedChats = filteredData.filter(c => c.isPinned);
        const unpinnedChats = filteredData.filter(c => !c.isPinned);
        const sortedData = [...pinnedChats, ...unpinnedChats];

        if (typeof renderDialogsList === 'function') {
            renderDialogsList(container, sortedData);
        } else {
            console.error('renderDialogsList не определена');
            container.innerHTML = '<div class="dialogs-empty">Ошибка рендера</div>';
        }
    } catch (err) {
        console.error('Ошибка loadDialogs:', err);
        container.innerHTML = '<div class="dialogs-empty">Ошибка загрузки</div>';
    } finally {
        window.isUpdatingDialogs = false;
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

// Экспорт
window.loadDialogs = loadDialogs;
window.loadUserSearchResults = loadUserSearchResults;
window.subscribeToNewChats = subscribeToNewChats;
