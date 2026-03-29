import { _supabase, BOT_USER_ID, BOT_PROFILE } from './config.js';
import { api } from './api.js';
import { showScreen, showToast, escapeHtml, renderMessage, getUserStatusFromProfile } from './ui.js';

let currentUser = null;
let currentProfile = null;
let currentChat = null;
let realtimeChannel = null;
let statusSubscription = null;
let typingChannel = null;
let allUsers = [];

const messagesCache = new Map();
const dialogCache = new Map();

// ─── DVH фикс ────────────────────────────────────────────
function updateDvh() {
    document.documentElement.style.setProperty('--dvh', `${window.innerHeight}px`);
}
window.addEventListener('resize', updateDvh);
updateDvh();

let originalHeight = window.innerHeight;
window.addEventListener('resize', () => {
    const newHeight = window.innerHeight;
    if (newHeight < originalHeight - 100) {
        setTimeout(() => {
            const inputZone = document.querySelector('.input-zone');
            if (inputZone && inputZone.style.display !== 'none') {
                document.getElementById('message-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }
    originalHeight = newHeight;
    updateDvh();
});

// ─── ОНЛАЙН СТАТУС ───────────────────────────────────────
let onlineInterval = null;
let isUserOnline = true;

async function setUserOnlineStatus(isOnline) {
    if (!currentUser) return;
    isUserOnline = isOnline;
    try { await api.updateOnlineStatus(currentUser.id, isOnline); } catch (e) {}
}

function startOnlineHeartbeat() {
    if (onlineInterval) clearInterval(onlineInterval);
    setUserOnlineStatus(true);
    onlineInterval = setInterval(() => {
        if (currentUser && isUserOnline) setUserOnlineStatus(true);
    }, 30000);
}

function stopOnlineHeartbeat() {
    if (onlineInterval) { clearInterval(onlineInterval); onlineInterval = null; }
    if (currentUser) setUserOnlineStatus(false);
}

window.addEventListener('beforeunload', () => {
    if (currentUser) setUserOnlineStatus(false);
});
document.addEventListener('visibilitychange', () => {
    if (!currentUser) return;
    setUserOnlineStatus(!document.hidden);
});

// ─── НИЖНЯЯ ПАНЕЛЬ ПРОФИЛЯ ───────────────────────────────
function updateProfileFooter() {
    if (!currentProfile) return;
    const footerAvatar = document.getElementById('footer-avatar');
    const footerName = document.getElementById('footer-name');
    const footerUsername = document.getElementById('footer-username');
    if (footerAvatar) footerAvatar.textContent = (currentProfile.full_name || '?')[0].toUpperCase();
    if (footerName) footerName.textContent = currentProfile.full_name || currentProfile.username || 'Пользователь';
    if (footerUsername) footerUsername.textContent = `@${currentProfile.username || 'username'}`;
}

function openProfileScreen() {
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
}

function initProfileFooter() {
    const footer = document.getElementById('profile-footer');
    if (!footer) return;
    const footerInfo = footer.querySelector('.profile-footer-info');
    if (footerInfo) footerInfo.onclick = openProfileScreen;
    const settingsBtn = document.getElementById('footer-settings');
    if (settingsBtn) settingsBtn.onclick = openProfileScreen;
    const logoutFooterBtn = document.getElementById('footer-logout');
    if (logoutFooterBtn) logoutFooterBtn.onclick = logout;
}

// ─── LOGOUT ──────────────────────────────────────────────
async function logout() {
    stopOnlineHeartbeat();
    if (realtimeChannel) await _supabase.removeChannel(realtimeChannel);
    if (statusSubscription) await _supabase.removeChannel(statusSubscription);
    if (typingChannel) await _supabase.removeChannel(typingChannel);
    messagesCache.clear();
    dialogCache.clear();
    await api.signOut();
    currentUser = null;
    currentProfile = null;
    currentChat = null;
    showScreen('reg');
}

// ─── LAST SEEN ───────────────────────────────────────────
let lastActivityUpdate = 0;

async function updateLastSeen() {
    if (!currentUser) return;
    const now = Date.now();
    if (now - lastActivityUpdate < 30000) return;
    lastActivityUpdate = now;
    try {
        await _supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', currentUser.id);
    } catch (e) {}
}

// ─── СТАТУС В ШАПКЕ ЧАТА ─────────────────────────────────
function updateChatStatusFromProfile(profile) {
    const chatStatus = document.querySelector('.chat-status');
    if (!chatStatus) return;
    if (currentChat?.other_user?.id === BOT_USER_ID) {
        chatStatus.textContent = 'бот';
        chatStatus.className = 'chat-status status-bot';
        return;
    }
    const status = getUserStatusFromProfile(profile);
    chatStatus.textContent = status.text;
    chatStatus.className = `chat-status ${status.class}`;
}

// ─── ПОДПИСКА НА СТАТУС ПОЛЬЗОВАТЕЛЯ ─────────────────────
function subscribeToUserStatus(userId) {
    if (statusSubscription) _supabase.removeChannel(statusSubscription);
    statusSubscription = _supabase
        .channel(`status-${userId}`)
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
            (payload) => {
                if (payload.new && currentChat?.other_user?.id === userId) {
                    updateChatStatusFromProfile(payload.new);
                }
                const dialogItem = document.querySelector(`.dialog-item[data-other-user-id="${userId}"]`);
                if (dialogItem) {
                    const statusDiv = dialogItem.querySelector('.dialog-status');
                    if (statusDiv) {
                        const status = getUserStatusFromProfile(payload.new);
                        statusDiv.textContent = status.text;
                        statusDiv.className = `dialog-status ${status.class === 'status-online' ? 'dialog-status-online' : 'dialog-status-offline'}`;
                    }
                }
            }
        ).subscribe();
}

// ─── ИНДИКАТОР ПЕЧАТАНИЯ ─────────────────────────────────
let typingTimeout = null;
let isTyping = false;

async function sendTypingStatus(isTypingNow) {
    if (!currentChat || !typingChannel) return;
    try {
        await typingChannel.send({
            type: 'broadcast',
            event: 'typing',
            payload: { isTyping: isTypingNow, userId: currentUser.id }
        });
    } catch (e) {}
}

function subscribeToTyping(chatId) {
    if (typingChannel) _supabase.removeChannel(typingChannel);
    typingChannel = _supabase
        .channel(`typing-${chatId}`)
        .on('broadcast', { event: 'typing' }, (payload) => {
            if (payload.payload.userId === currentUser.id) return;
            const typingStatus = document.querySelector('.typing-status');
            if (!typingStatus) return;
            if (payload.payload.isTyping) {
                typingStatus.textContent = 'печатает...';
                typingStatus.style.display = 'block';
                setTimeout(() => {
                    if (typingStatus.textContent === 'печатает...') typingStatus.style.display = 'none';
                }, 3000);
            } else {
                typingStatus.style.display = 'none';
            }
        }).subscribe();
}

function setupTypingIndicator() {
    const messageInput = document.getElementById('message-input');
    if (!messageInput) return;
    messageInput.addEventListener('input', () => {
        if (!currentChat || currentChat.other_user?.id === BOT_USER_ID) return;
        if (typingTimeout) clearTimeout(typingTimeout);
        if (!isTyping) { isTyping = true; sendTypingStatus(true); }
        typingTimeout = setTimeout(() => { isTyping = false; sendTypingStatus(false); }, 1000);
    });
}

// ─── НЕПРОЧИТАННЫЕ ───────────────────────────────────────
async function markChatMessagesAsRead(chatId) {
    if (!chatId || !currentUser) return;
    try {
        await api.markAsRead(chatId, currentUser.id);
        if (messagesCache.has(chatId)) {
            messagesCache.get(chatId).forEach(msg => {
                if (msg.user_id !== currentUser.id) msg.is_read = true;
            });
        }
        await loadDialogs();
    } catch (e) { console.error(e); }
}

// ─── ЗАГРУЗКА ДИАЛОГОВ ───────────────────────────────────
let isUpdatingDialogs = false;

async function loadDialogs(searchTerm = '') {
    const container = document.getElementById('dialogs-list');
    if (!container) return;

    const isUserSearch = searchTerm.startsWith('@');

    if (isUserSearch && searchTerm.length > 1) {
        const users = await api.searchUsers(searchTerm, currentUser.id);
        container.innerHTML = `<div class="search-header"><span class="search-title">👥 Найдено: ${users.length}</span></div>`;
        if (users.length === 0) {
            container.innerHTML += '<div class="dialogs-loading">Пользователи не найдены</div>';
        } else {
            users.forEach(user => {
                const name = user.full_name || user.username;
                const div = document.createElement('div');
                div.className = 'dialog-item user-search-item';
                div.dataset.userId = user.id;
                div.innerHTML = `
                    <div class="dialog-avatar"><div class="avatar-letter">${escapeHtml(name.charAt(0))}</div></div>
                    <div class="dialog-info">
                        <div class="dialog-name">${escapeHtml(name)} <span class="username-hint">@${escapeHtml(user.username)}</span></div>
                        <div class="dialog-preview">Нажмите, чтобы начать чат</div>
                    </div>`;
                div.onclick = async () => {
                    try {
                        const chatId = await api.getOrCreateChat(currentUser.id, user.id);
                        await openChat(chatId, user.id, user);
                        const searchInputElem = document.getElementById('search-dialogs');
                        if (searchInputElem) searchInputElem.value = '';
                        loadDialogs();
                    } catch (e) { showToast('Ошибка создания чата', true); }
                };
                container.appendChild(div);
            });
        }
        return;
    }

    if (isUpdatingDialogs) return;
    isUpdatingDialogs = true;

    try {
        const { data: chats, error } = await api.getChats(currentUser.id);
        if (error) throw error;

        const allParticipantIds = chats ? chats.flatMap(c => c.participants) : [];
        const profileMap = new Map();

        if (allParticipantIds.length > 0) {
            const profiles = await api.getProfilesByIds(allParticipantIds);
            profiles.forEach(p => profileMap.set(p.id, p));
        }
        profileMap.set(BOT_USER_ID, BOT_PROFILE);

        const chatData = await Promise.all((chats || []).map(async (chat) => {
            const otherId = chat.participants.find(id => id !== currentUser.id);
            const otherUser = profileMap.get(otherId);
            const name = otherUser?.full_name || otherUser?.username || 'Пользователь';
            const isBot = otherId === BOT_USER_ID;
            const unreadCount = await api.getUnreadCount(chat.id, currentUser.id);
            const lastMessage = await api.getLastMessage(chat.id, currentUser.id);
            const status = otherUser ? getUserStatusFromProfile(otherUser) : { text: '', class: '' };

            return { id: chat.id, otherId, otherUser, name, isBot, unreadCount,
                     lastMessage: lastMessage || 'Нет сообщений', updatedAt: chat.updated_at,
                     statusText: status.text, statusClass: status.class };
        }));

        chatData.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        let filteredData = searchTerm && !isUserSearch
            ? chatData.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
            : chatData;

        container.innerHTML = '';

        if (filteredData.length === 0) {
            container.innerHTML = '<div class="dialogs-loading">Нет диалогов. Введите @username для поиска</div>';
        } else {
            filteredData.forEach(chat => {
                const div = document.createElement('div');
                div.className = `dialog-item ${currentChat?.id === chat.id ? 'active' : ''} ${chat.unreadCount > 0 ? 'unread-dialog' : ''}`;
                div.dataset.chatId = chat.id;
                div.dataset.otherUserId = chat.otherId;
                div.innerHTML = `
                    <div class="dialog-avatar ${chat.isBot ? 'bot-avatar' : ''}">
                        ${chat.isBot
                            ? '<img src="lumina.svg" alt="Bot" width="32" height="32"><div class="verified-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>'
                            : `<div class="avatar-letter">${escapeHtml(chat.name.charAt(0))}</div>`}
                    </div>
                    <div class="dialog-info">
                        <div class="dialog-name">
                            ${escapeHtml(chat.name)}
                            ${chat.isBot ? '<span class="bot-badge">Бот</span>' : ''}
                            ${chat.unreadCount > 0 ? `<span class="unread-badge-count">${chat.unreadCount}</span>` : ''}
                        </div>
                        <div class="dialog-preview">${escapeHtml(chat.lastMessage)}</div>
                        ${!chat.isBot && chat.statusText ? `<div class="dialog-status ${chat.statusClass === 'status-online' ? 'dialog-status-online' : 'dialog-status-offline'}">${chat.statusText}</div>` : ''}
                    </div>`;
                div.onclick = async () => {
                    await openChat(chat.id, chat.otherId, chat.otherUser);
                    if (chat.unreadCount > 0) await markChatMessagesAsRead(chat.id);
                };
                container.appendChild(div);
            });
        }
    } catch (e) {
        console.error(e);
        if (!container.children.length) container.innerHTML = '<div class="dialogs-loading">Ошибка загрузки</div>';
    } finally {
        isUpdatingDialogs = false;
    }
}

// ─── ОТКРЫТИЕ ЧАТА ───────────────────────────────────────
let isOpeningChat = false;
let pendingChatId = null;

async function openChat(chatId, otherUserId, otherUser) {
    if (isOpeningChat) { pendingChatId = chatId; return; }
    if (currentChat?.id === chatId) return;
    isOpeningChat = true;

    try {
        const isBot = otherUserId === BOT_USER_ID;
        document.getElementById('messages').innerHTML = '<div class="loading-messages">Загрузка сообщений...</div>';

        currentChat = { id: chatId, type: 'private', other_user: otherUser || (isBot ? BOT_PROFILE : null) };

        const chatTitle = document.getElementById('chat-title');
        if (chatTitle) {
            const name = otherUser?.full_name || otherUser?.username || (isBot ? 'Lumina Bot' : 'Чат');
            chatTitle.innerHTML = `${escapeHtml(name)}${isBot ? ' <span class="bot-badge">Бот</span>' : ''}`;
        }

        if (!isBot && otherUserId) {
            const { data: profile } = await api.getProfile(otherUserId);
            if (profile) {
                updateChatStatusFromProfile(profile);
                subscribeToUserStatus(otherUserId);
                subscribeToTyping(chatId, otherUserId);
            }
        } else if (isBot) {
            const chatStatus = document.querySelector('.chat-status');
            if (chatStatus) { chatStatus.textContent = 'бот'; chatStatus.className = 'chat-status status-bot'; }
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
            if (messageInput) { messageInput.disabled = false; setTimeout(() => messageInput.focus(), 100); }
            if (sendButton) sendButton.disabled = false;
            setupTypingIndicator();
        }

        await loadMessages(chatId);
        subscribeToMessages(chatId);

        document.querySelectorAll('.dialog-item').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.chatId === chatId) el.classList.add('active');
        });

        await markChatMessagesAsRead(chatId);
    } finally {
        isOpeningChat = false;
        if (pendingChatId && pendingChatId !== chatId) {
            const pending = pendingChatId;
            pendingChatId = null;
            const el = document.querySelector(`.dialog-item[data-chat-id="${pending}"]`);
            if (el) await openChat(pending, el.dataset.otherUserId, null);
        }
    }
}

// ─── ЗАГРУЗКА СООБЩЕНИЙ ──────────────────────────────────
let isLoadingMessages = false;

async function loadMessages(chatId) {
    const container = document.getElementById('messages');
    if (!container) return;

    if (messagesCache.has(chatId) && messagesCache.get(chatId).length > 0) {
        container.innerHTML = '';
        messagesCache.get(chatId).forEach(msg => renderMessage(msg, currentUser, currentProfile));
        container.scrollTop = container.scrollHeight;
        return;
    }

    if (isLoadingMessages) return;
    isLoadingMessages = true;

    try {
        const { data: msgs, error } = await api.getMessages(chatId);
        if (error) throw error;

        const userIds = [...new Set((msgs || []).map(m => m.user_id))];
        const profilesMap = new Map();

        if (userIds.length > 0) {
            const profiles = await api.getProfilesByIds(userIds);
            profiles.forEach(p => profilesMap.set(p.id, p));
        }
        profilesMap.set(BOT_USER_ID, BOT_PROFILE);

        const messagesWithProfiles = (msgs || []).map(msg => ({
            ...msg,
            profiles: profilesMap.get(msg.user_id)
        }));

        messagesCache.set(chatId, messagesWithProfiles);
        container.innerHTML = '';

        if (messagesWithProfiles.length > 0) {
            messagesWithProfiles.forEach(msg => renderMessage(msg, currentUser, currentProfile));
        } else {
            container.innerHTML = '<div class="msg-stub">Начните переписку</div>';
        }
        container.scrollTop = container.scrollHeight;
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="loading-messages">Ошибка загрузки</div>';
    } finally {
        isLoadingMessages = false;
    }
}

// ─── REALTIME СООБЩЕНИЯ ──────────────────────────────────
function subscribeToMessages(chatId) {
    if (realtimeChannel) _supabase.removeChannel(realtimeChannel);

    realtimeChannel = _supabase
        .channel(`chat-${chatId}`)
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
            async (payload) => {
                if (document.querySelector(`.message[data-id="${payload.new.id}"]`)) return;

                let profile = currentProfile;
                if (payload.new.user_id !== currentUser?.id) {
                    if (payload.new.user_id === BOT_USER_ID) {
                        profile = BOT_PROFILE;
                    } else {
                        const { data } = await api.getProfile(payload.new.user_id);
                        if (data) profile = data;
                    }
                }

                const newMsg = { ...payload.new, profiles: profile };
                if (messagesCache.has(chatId)) {
                    messagesCache.get(chatId).push(newMsg);
                }

                renderMessage(newMsg, currentUser, currentProfile);
                updateDialogLastMessage(chatId, payload.new.text, payload.new.user_id === currentUser.id);

                if (currentChat?.id === chatId && payload.new.user_id !== currentUser.id) {
                    await markChatMessagesAsRead(chatId);
                }
            }
        )
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
            (payload) => {
                const msgDiv = document.querySelector(`.message[data-id="${payload.new.id}"]`);
                if (msgDiv) {
                    const textDiv = msgDiv.querySelector('.text');
                    if (textDiv) textDiv.textContent = payload.new.text;
                    const timeDiv = msgDiv.querySelector('.msg-time');
                    if (timeDiv && !timeDiv.textContent.includes('(изм)')) timeDiv.textContent += ' (изм)';
                }
                if (messagesCache.has(chatId)) {
                    const cached = messagesCache.get(chatId);
                    const idx = cached.findIndex(m => m.id === payload.new.id);
                    if (idx !== -1) { cached[idx].text = payload.new.text; cached[idx].is_read = payload.new.is_read; }
                }
            }
        )
        .on('postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
            (payload) => {
                document.querySelector(`.message[data-id="${payload.old.id}"]`)?.remove();
                if (messagesCache.has(chatId)) {
                    messagesCache.set(chatId, messagesCache.get(chatId).filter(m => m.id !== payload.old.id));
                }
            }
        )
        .subscribe();
}

function updateDialogLastMessage(chatId, text, isOwn) {
    const dialogItem = document.querySelector(`.dialog-item[data-chat-id="${chatId}"]`);
    if (dialogItem) {
        const previewSpan = dialogItem.querySelector('.dialog-preview');
        if (previewSpan) {
            let shortText = text.length > 50 ? text.slice(0, 47) + '...' : text;
            previewSpan.textContent = (isOwn ? 'Вы: ' : '') + shortText;
        }
        const parent = dialogItem.parentNode;
        parent.removeChild(dialogItem);
        parent.insertBefore(dialogItem, parent.firstChild);
    }
}

// ─── ОТПРАВКА СООБЩЕНИЯ ──────────────────────────────────
async function sendMsg() {
    const input = document.getElementById('message-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text || !currentUser || !currentChat) {
        if (!currentChat) showToast('Выберите чат', true);
        return;
    }
    if (currentChat.other_user?.id === BOT_USER_ID) {
        showToast('Нельзя отправлять сообщения боту', true);
        return;
    }
    input.value = '';

    const { data, error } = await api.sendMessage(text, currentUser.id, currentChat.id);
    if (error) {
        showToast('Ошибка отправки', true);
        input.value = text;
    } else {
        renderMessage({ ...data, profiles: currentProfile }, currentUser, currentProfile);
        await api.updateChatTimestamp(currentChat.id, text);
        updateDialogLastMessage(currentChat.id, text, true);
        input.focus();
    }
}

// ─── КОНТЕКСТНОЕ МЕНЮ СООБЩЕНИЙ ──────────────────────────
const messageMenu = document.getElementById('message-menu');

function showMessageMenu(e, messageId, messageText, isOwn) {
    e.preventDefault();
    e.stopPropagation();
    if (!messageMenu) return;
    messageMenu.style.display = 'block';
    messageMenu.style.left = `${Math.min(e.clientX, window.innerWidth - 200)}px`;
    messageMenu.style.top = `${Math.min(e.clientY, window.innerHeight - 200)}px`;
    messageMenu.querySelectorAll('.menu-item').forEach(item => {
        item.onclick = () => handleMessageAction(item.dataset.action, messageId, messageText, isOwn);
    });
    setTimeout(() => document.addEventListener('click', hideMessageMenu), 0);
}

function hideMessageMenu() {
    if (messageMenu) messageMenu.style.display = 'none';
    document.removeEventListener('click', hideMessageMenu);
}

async function handleMessageAction(action, messageId, messageText, isOwn) {
    hideMessageMenu();
    switch (action) {
        case 'copy':
            await navigator.clipboard.writeText(messageText);
            showToast('Текст скопирован');
            break;
        case 'edit':
            if (!isOwn) { showToast('Можно редактировать только свои сообщения', true); break; }
            const newText = prompt('Изменить сообщение:', messageText);
            if (newText && newText.trim()) {
                const { error } = await api.editMessage(messageId, newText);
                showToast(error ? 'Ошибка редактирования' : 'Сообщение изменено', !!error);
            }
            break;
        case 'delete':
            if (!isOwn) { showToast('Можно удалять только свои сообщения', true); break; }
            if (confirm('Удалить сообщение?')) {
                const { error } = await api.deleteMessage(messageId);
                if (!error) {
                    document.querySelector(`.message[data-id="${messageId}"]`)?.remove();
                    showToast('Сообщение удалено');
                } else {
                    showToast('Ошибка удаления', true);
                }
            }
            break;
        case 'reply':
            const input = document.getElementById('message-input');
            if (input) { input.value = `> ${messageText}\n\n`; input.focus(); }
            break;
        case 'pin':
        case 'forward':
            showToast('Функция в разработке');
            break;
    }
}

// ─── НАВИГАЦИЯ АВТОРИЗАЦИИ ───────────────────────────────
document.getElementById('to-login')?.addEventListener('click', () => showScreen('login'));
document.getElementById('to-register')?.addEventListener('click', () => showScreen('reg'));
document.getElementById('btn-go-to-login')?.addEventListener('click', () => showScreen('login'));
document.getElementById('btn-go-to-register')?.addEventListener('click', () => showScreen('reg'));

// ─── РЕГИСТРАЦИЯ ─────────────────────────────────────────
document.getElementById('btn-do-reg')?.addEventListener('click', async () => {
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value.trim();
    const fullName = document.getElementById('reg-full-name')?.value.trim() || '';
    if (!username || !password) return showToast('Заполните все поля', true);

    const { error } = await api.signUp(username, password, fullName);
    if (error) return showToast(error.message, true);
    showToast('Аккаунт создан! Войдите.');
    setTimeout(() => showScreen('login'), 1000);
});

// ─── ВХОД ────────────────────────────────────────────────
document.getElementById('btn-do-login')?.addEventListener('click', async () => {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const { data, error } = await api.signIn(username, password);
    if (error) return showToast('Ошибка входа: ' + error.message, true);
    currentUser = data.user;
    await afterLogin(username);
});

async function afterLogin(username) {
    let { data: p } = await api.getProfile(currentUser.id);
    if (!p) {
        const clean = (username || '').replace(/^@/, '');
        const { data } = await api.createProfile(currentUser.id, clean);
        p = data;
    }
    currentProfile = p;

    if (currentProfile) {
        const badge = document.getElementById('current-user-badge');
        if (badge) badge.textContent = currentProfile.full_name;
        updateProfileFooter();
        initProfileFooter();
    }

    allUsers = await api.loadAllUsers(currentUser.id);
    await api.ensureBotChat(currentUser.id);

    showScreen('chat');
    await loadDialogs();

    document.getElementById('chat-title').textContent = 'Lumina Lite';
    document.querySelector('.chat-status').textContent = 'выберите диалог';
    const inputZone = document.querySelector('.input-zone');
    if (inputZone) inputZone.style.display = 'none';
    document.getElementById('messages').innerHTML = '<div class="msg-stub"><p>Выберите диалог, чтобы начать общение</p></div>';
    currentChat = null;

    document.addEventListener('click', updateLastSeen);
    document.addEventListener('keypress', updateLastSeen);
    setInterval(updateLastSeen, 30000);
    updateLastSeen();
    startOnlineHeartbeat();
}

// ─── ПРОФИЛЬ ─────────────────────────────────────────────
document.getElementById('btn-profile')?.addEventListener('click', openProfileScreen);
document.getElementById('btn-profile-back')?.addEventListener('click', () => showScreen('chat'));
document.getElementById('btn-logout')?.addEventListener('click', logout);
document.getElementById('btn-logout-profile')?.addEventListener('click', logout);

document.getElementById('btn-save-profile')?.addEventListener('click', async () => {
    const full_name = document.getElementById('profile-fullname').value.trim();
    const bio = document.getElementById('profile-bio').value.trim();
    if (!full_name) return showToast('Имя не может быть пустым', true);

    const { error } = await api.updateProfile(currentUser.id, { full_name, bio });
    if (error) return showToast('Ошибка сохранения', true);

    currentProfile.full_name = full_name;
    currentProfile.bio = bio;
    document.getElementById('current-user-badge').textContent = full_name;
    document.getElementById('profile-avatar-letter').textContent = full_name[0].toUpperCase();
    updateProfileFooter();
    showToast('Профиль сохранён ✓');
    setTimeout(() => showScreen('chat'), 800);
});

// ─── ПОИСК ДИАЛОГОВ ──────────────────────────────────────
const searchInputElem = document.getElementById('search-dialogs');
if (searchInputElem) {
    let searchTimeout;
    searchInputElem.oninput = (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => loadDialogs(e.target.value), 300);
    };
}

// ─── ЭМОДЗИ ──────────────────────────────────────────────
const emojiBtn = document.getElementById('btn-emoji');
const emojiPicker = document.getElementById('emoji-picker');
if (emojiBtn && emojiPicker) {
    emojiBtn.onclick = (e) => {
        e.stopPropagation();
        emojiPicker.style.display = emojiPicker.style.display === 'flex' ? 'none' : 'flex';
    };
    document.querySelectorAll('.emoji-item').forEach(emoji => {
        emoji.onclick = () => {
            const input = document.getElementById('message-input');
            if (input) { input.value += emoji.textContent; input.focus(); }
            emojiPicker.style.display = 'none';
        };
    });
    document.addEventListener('click', (e) => {
        if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) emojiPicker.style.display = 'none';
    });
}

// ─── ОТПРАВКА / ENTER ────────────────────────────────────
document.getElementById('btn-send-msg')?.addEventListener('click', sendMsg);
document.getElementById('message-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
});

// ─── СТАРТ ───────────────────────────────────────────────
(async () => {
    const { data: { session } } = await api.getSession();
    if (session) {
        currentUser = session.user;
        const email = currentUser.email || '';
        const username = email.replace('@lumina.local', '');
        await afterLogin(username);
    } else {
        showScreen('reg');
    }
})();
