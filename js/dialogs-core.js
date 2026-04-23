// dialogs-core.js — оптимизированная загрузка диалогов

let dialogsUpdating = false;
let dialogsSubscriptionChannel = null;
let dialogsCache = null;
let lastDialogsLoad = 0;
const DIALOGS_CACHE_TTL = 30000; // 30 секунд кэш

function subscribeToNewChats() {
    if (dialogsSubscriptionChannel) {
        supabaseClient.removeChannel(dialogsSubscriptionChannel);
    }
    
    const userId = window.currentUser?.id || currentUser?.id;
    if (!userId) return;
    
    dialogsSubscriptionChannel = supabaseClient.channel('new-chats')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'chats',
            filter: `participants=cs.{${userId}}`
        }, async (payload) => {
            dialogsCache = null; // Инвалидируем кэш
            if (typeof loadDialodsOptimized === 'function') {
                await loadDialodsOptimized();
            }
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'chats',
            filter: `participants=cs.{${userId}}`
        }, async (payload) => {
            dialogsCache = null;
            if (typeof loadDialodsOptimized === 'function') {
                await loadDialodsOptimized();
            }
        })
        .subscribe();
}

// Оптимизированная загрузка с кэшем
async function loadDialodsOptimized(force = false) {
    const now = Date.now();
    if (!force && dialogsCache && (now - lastDialogsLoad) < DIALOGS_CACHE_TTL) {
        console.log('Загружаем диалоги из кэша');
        if (typeof renderDialogsList === 'function') {
            const container = document.getElementById('dialogs-list');
            if (container) renderDialogsList(container, dialogsCache);
        }
        return;
    }
    
    return loadDialogs();
}

async function loadDialogs(searchTerm = '') {
    const container = document.getElementById('dialogs-list');
    if (!container) return;

    const isUserSearch = searchTerm && searchTerm.startsWith('@');
    if (isUserSearch && searchTerm.length > 1) {
        await loadUserSearchResults(searchTerm, container);
        return;
    }

    if (dialogsUpdating) return;
    dialogsUpdating = true;

    // Показываем скелетон загрузки
    container.innerHTML = `
        <div class="dialogs-skeleton">
            ${Array(5).fill(0).map(() => `
                <div class="skeleton-item">
                    <div class="skeleton-avatar"></div>
                    <div class="skeleton-info">
                        <div class="skeleton-name"></div>
                        <div class="skeleton-preview"></div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    try {
        const userId = window.currentUser?.id || currentUser?.id;
        if (!userId) {
            container.innerHTML = '<div class="dialogs-empty">Ошибка загрузки</div>';
            dialogsUpdating = false;
            return;
        }

        // Загружаем чаты одним запросом
        const { data: allChats, error } = await supabaseClient
            .from('chats')
            .select('id, type, participants, updated_at, created_at, last_message, is_group, group_id, is_pinned, is_muted')
            .order('is_pinned', { ascending: false })
            .order('updated_at', { ascending: false })
            .limit(50); // Ограничиваем количество

        if (error) throw error;

        const chats = (allChats || []).filter(c =>
            c.participants && c.participants.includes(userId)
        );

        if (chats.length === 0) {
            container.innerHTML = '<div class="dialogs-empty">Нет диалогов</div>';
            dialogsUpdating = false;
            return;
        }

        // Получаем ID всех участников одним запросом
        const participantIds = new Set();
        const groupIds = new Set();
        
        chats.forEach(chat => {
            if (chat.is_group && chat.group_id) {
                groupIds.add(chat.group_id);
            } else if (!chat.is_group) {
                chat.participants?.forEach(id => {
                    if (id !== userId && id !== BOT_USER_ID && id !== SAVED_CHAT_ID) {
                        participantIds.add(id);
                    }
                });
            }
        });

        // Параллельные запросы
        const [groupsResult, profilesResult, unreadResult] = await Promise.all([
            groupIds.size > 0 ? supabaseClient.from('groups').select('id, name, description, member_count, avatar_emoji').in('id', Array.from(groupIds)) : { data: [] },
            participantIds.size > 0 ? supabaseClient.from('profiles').select('id, full_name, username, bio, last_seen, is_online, is_verified, avatar_url').in('id', Array.from(participantIds)) : { data: [] },
            supabaseClient.from('messages').select('chat_id').eq('is_read', false).neq('user_id', userId).in('chat_id', chats.map(c => c.id))
        ]);

        const groupsMap = new Map();
        (groupsResult.data || []).forEach(g => groupsMap.set(g.id, g));

        const profileMap = new Map();
        (profilesResult.data || []).forEach(p => profileMap.set(p.id, p));
        profileMap.set(BOT_USER_ID, { ...BOT_PROFILE, is_verified: true });

        const unreadCounts = new Map();
        (unreadResult.data || []).forEach(m => {
            unreadCounts.set(m.chat_id, (unreadCounts.get(m.chat_id) || 0) + 1);
        });

        // Формируем данные для рендера
        const chatData = [];
        for (const chat of chats) {
            if (chat.is_group) {
                const group = groupsMap.get(chat.group_id);
                if (!group) continue;
                chatData.push({
                    id: chat.id,
                    isGroup: true,
                    groupInfo: { ...group, chat_id: chat.id },
                    name: group.name,
                    unreadCount: unreadCounts.get(chat.id) || 0,
                    lastMessage: chat.last_message || `${group.member_count || 0} участников`,
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
                    lastMessage: chat.last_message || 'Сохранённые сообщения',
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
                lastMessage: chat.last_message || 'Нет сообщений',
                isOnline: status.class === 'status-online',
                isPinned: chat.is_pinned || false,
                isMuted: chat.is_muted || false
            });
        }

        // Сохраняем в кэш
        dialogsCache = chatData;
        lastDialogsLoad = Date.now();

        if (typeof renderDialogsList === 'function') {
            renderDialogsList(container, chatData);
        }
    } catch (err) {
        console.error('Ошибка loadDialogs:', err);
        container.innerHTML = '<div class="dialogs-empty">Ошибка загрузки</div>';
    } finally {
        dialogsUpdating = false;
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
window.loadDialodsOptimized = loadDialodsOptimized;
window.loadUserSearchResults = loadUserSearchResults;
window.subscribeToNewChats = subscribeToNewChats;
