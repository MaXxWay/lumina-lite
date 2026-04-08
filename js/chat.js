// chat.js — сообщения, рендер, realtime

async function getOrCreatePrivateChat(otherUserId) {
    try {
        if (otherUserId === BOT_USER_ID) {
            const { data: existing } = await supabaseClient.from('chats')
                .select('id').eq('type', 'private').contains('participants', [currentUser.id, BOT_USER_ID]).maybeSingle();
            return existing?.id;
        }
        const { data: existing } = await supabaseClient.from('chats')
            .select('id').eq('type', 'private').contains('participants', [currentUser.id, otherUserId]).maybeSingle();
        if (existing) return existing.id;

        const { data: newChat } = await supabaseClient.from('chats')
            .insert({ type: 'private', participants: [currentUser.id, otherUserId], created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .select().single();
        return newChat.id;
    } catch (err) { throw err; }
}

async function markChatMessagesAsRead(chatId) {
    if (!chatId || !currentUser || chatId === SAVED_CHAT_ID) return;
    try {
        await supabaseClient.from('messages')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('chat_id', chatId).neq('user_id', currentUser.id).eq('is_read', false);

        if (messagesCache.has(chatId)) {
            messagesCache.get(chatId).forEach(m => { if (m.user_id !== currentUser.id) m.is_read = true; });
        }

        const container = document.getElementById('messages');
        if (container && currentChat?.id === chatId) {
            container.querySelectorAll('.message:not(.own)').forEach(el => {
                const rs = el.querySelector('.read-status');
                if (rs && !el.classList.contains('bot-message')) setMessageReadStatus(rs, true);
                el.classList.remove('unread-message');
            });
        }
        if (typeof loadDialogs === 'function') loadDialogs();
    } catch (err) { console.error('Ошибка markChatMessagesAsRead:', err); }
}

function setupReadStatusObserver() {
    const container = document.getElementById('messages');
    if (!container) return;

    const observer = new IntersectionObserver(entries => {
        const visible = [];
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el = entry.target;
            const msgId = el.dataset.id;
            const isOwn = el.classList.contains('own');
            const isBot = el.classList.contains('bot-message');
            if (!isOwn && !isBot && msgId && !observedMessages.has(msgId)) {
                visible.push(msgId);
                observedMessages.add(msgId);
            }
        });
        if (!visible.length || !currentChat || currentChat.id === SAVED_CHAT_ID) return;

        if (readCheckTimeout) clearTimeout(readCheckTimeout);
        readCheckTimeout = setTimeout(async () => {
            try {
                await supabaseClient.from('messages').update({ is_read: true }).in('id', visible);
                visible.forEach(id => {
                    const el = document.querySelector(`.message[data-id="${id}"]`);
                    if (!el) return;
                    const rs = el.querySelector('.read-status');
                    if (rs) setMessageReadStatus(rs, true);
                    el.classList.remove('unread-message');
                });
                if (messagesCache.has(currentChat.id)) {
                    messagesCache.get(currentChat.id).forEach(m => { if (visible.includes(m.id)) m.is_read = true; });
                }
                loadDialogs();
            } catch {}
            readCheckTimeout = null;
        }, 500);
    }, { threshold: 0.5 });

    const observe = () => container.querySelectorAll('.message:not(.own):not(.bot-message)').forEach(m => observer.observe(m));
    observe();
    const mo = new MutationObserver(observe);
    mo.observe(container, { childList: true, subtree: true });
    return { observer, mutationObserver: mo };
}

async function loadMessages(chatId) {
    const container = document.getElementById('messages');
    if (!container) return;

    if (messagesCache.has(chatId) && messagesCache.get(chatId).length > 0) {
        renderMessagesList(container, messagesCache.get(chatId));
        return;
    }

    if (isLoadingMessages) return;
    isLoadingMessages = true;

    try {
        const { data: msgs } = await supabaseClient
            .from('messages').select('*').eq('chat_id', chatId)
            .order('created_at', { ascending: true }).limit(200);

        const userIds = [...new Set((msgs || []).map(m => m.user_id))];
        const profilesMap = new Map();
        if (userIds.length > 0) {
            const { data: profiles } = await supabaseClient.from('profiles').select('id, full_name, username, bio').in('id', userIds);
            if (profiles) profiles.forEach(p => profilesMap.set(p.id, p));
        }
        profilesMap.set(BOT_USER_ID, BOT_PROFILE);

        const list = (msgs || []).map(m => ({ ...m, profiles: profilesMap.get(m.user_id), is_read: m.is_read || false }));
        messagesCache.set(chatId, list);
        renderMessagesList(container, list);
    } catch {
        container.innerHTML = '<div class="msg-stub">Ошибка загрузки сообщений</div>';
    } finally {
        isLoadingMessages = false;
    }
}

function renderMessagesList(container, list) {
    container.innerHTML = '';
    if (!list || list.length === 0) {
        container.innerHTML = '<div class="msg-stub">Начните переписку</div>';
        return;
    }
    let lastDate = null;
    list.forEach(msg => {
        const d = formatDateDivider(msg.created_at);
        if (d !== lastDate) {
            const div = document.createElement('div');
            div.className = 'date-divider';
            div.innerHTML = `<div class="date-divider-line"></div><div class="date-divider-text">${d}</div><div class="date-divider-line"></div>`;
            container.appendChild(div);
            lastDate = d;
        }
        
        if (msg.is_system) {
            renderSystemMessage(msg.text, msg.created_at);
        } else {
            renderMessage(msg, false);
        }
    });
    container.scrollTop = container.scrollHeight;
}

function renderSystemMessage(text, timestamp = null) {
    const container = document.getElementById('messages');
    if (!container) return;
    
    // Удаляем ВСЕ эмодзи из системных сообщений
    let cleanText = text
        .replace(/[🎉✅⚠️❌👑🛡️👤➕👋✏️📝📢ℹ️💾👥]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    
    const div = document.createElement('div');
    div.className = 'system-message-wrapper';
    div.innerHTML = `
        <div class="system-message">
            <span class="system-text">${escapeHtml(cleanText)}</span>
        </div>
    `;
    container.appendChild(div);
    setTimeout(() => container.scrollTop = container.scrollHeight, 50);
}

function renderMessage(msg, isNewMessage = false) {
    const container = document.getElementById('messages');
    if (!container) return;

    container.querySelector('.msg-stub')?.remove();

    const isOwn = currentUser && msg.user_id === currentUser.id;
    const isBot = msg.user_id === BOT_USER_ID;
    const isGroup = currentChat?.is_group;

    let name = 'Пользователь';
    if (msg.profiles?.full_name) name = msg.profiles.full_name;
    else if (isOwn && currentProfile?.full_name) name = currentProfile.full_name;
    else if (isBot) name = 'Lumina Bot';

    const timeStr = new Date(msg.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
    const isRead = msg.is_read === true;
    const formattedDate = formatDateDivider(msg.created_at);

    if (isNewMessage) {
        const lastChild = container.lastElementChild;
        let lastDate = lastChild?.dataset?.date || lastChild?.querySelector('.date-divider-text')?.textContent;
        if (lastDate !== formattedDate) {
            const div = document.createElement('div');
            div.className = 'date-divider';
            div.innerHTML = `<div class="date-divider-line"></div><div class="date-divider-text">${formattedDate}</div><div class="date-divider-line"></div>`;
            container.appendChild(div);
        }
    }

    const divMsg = document.createElement('div');
    divMsg.className = [
        'message',
        isOwn ? 'own' : 'other',
        isBot ? 'bot-message' : '',
        !isOwn && !isRead && currentChat?.id !== SAVED_CHAT_ID ? 'unread-message' : ''
    ].filter(Boolean).join(' ');
    divMsg.dataset.id = msg.id;
    divMsg.dataset.text = msg.text;
    divMsg.dataset.date = formattedDate;

    const readStatusHtml = (isOwn && !isBot && currentChat?.id !== SAVED_CHAT_ID)
        ? `<span class="read-status ${isRead ? 'read' : 'unread'}">${getReadIcon(isRead)}</span>` : '';

    const showSender = !isOwn && (isGroup || !isOwn);

    let avatarContent = '';
    if (isBot) {
        avatarContent = '<img src="lumina.svg" alt="Bot">';
    } else {
        avatarContent = `<div class="avatar-letter">${escapeHtml(name.charAt(0))}</div>`;
    }

    divMsg.innerHTML = `
        <div class="msg-avatar ${isBot ? 'bot-avatar' : ''}">
            ${avatarContent}
        </div>
        <div class="msg-bubble">
            ${showSender ? `<div class="msg-sender">${escapeHtml(name)}</div>` : ''}
            <div class="text">${escapeHtml(msg.text)}</div>
            <div class="msg-time">${timeStr}${msg.is_edited ? ' <span class="edited-mark">ред.</span>' : ''} ${readStatusHtml}</div>
        </div>
    `;

    attachMessageContextMenu(divMsg, msg, isOwn);

    const msgAvatar = divMsg.querySelector('.msg-avatar');
    if (msgAvatar && typeof openProfileModal === 'function' && currentChat?.id !== SAVED_CHAT_ID) {
        if (isOwn) {
            msgAvatar.classList.add('clickable-avatar');
            msgAvatar.onclick = e => { 
                e.stopPropagation(); 
                openProfileModal(currentProfile, { readOnly: false });
            };
        }
        else if (isGroup && !isOwn && !isBot && msg.profiles) {
            msgAvatar.classList.add('clickable-avatar');
            msgAvatar.onclick = e => { 
                e.stopPropagation(); 
                openProfileModal(msg.profiles, { readOnly: true });
            };
        } 
        else if (!isGroup && !isOwn) {
            const profile = isBot ? BOT_PROFILE : (msg.profiles || currentChat?.other_user);
            if (profile) {
                msgAvatar.classList.add('clickable-avatar');
                msgAvatar.onclick = e => { 
                    e.stopPropagation(); 
                    openProfileModal(profile, { readOnly: profile.id !== currentUser?.id });
                };
            }
        }
    }
    container.appendChild(divMsg);

    if (isNewMessage) {
        setTimeout(() => container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' }), 50);
    } else {
        setTimeout(() => { container.scrollTop = container.scrollHeight; }, 10);
    }
}

function attachMessageContextMenu(el, msg, isOwn) {
    el.oncontextmenu = e => {
        if (typeof showMessageMenu === 'function') showMessageMenu(e, msg.id, msg.text, isOwn);
        return false;
    };

    let lt = null;
    
    el.addEventListener('touchstart', e => {
        lt = setTimeout(() => {
            if (window.navigator.vibrate) window.navigator.vibrate(40);
            if (typeof showMessageMenu === 'function') {
                const touch = e.touches[0];
                const fakeEvent = {
                    preventDefault: () => {},
                    stopPropagation: () => {},
                    clientX: touch.clientX,
                    clientY: touch.clientY
                };
                showMessageMenu(fakeEvent, msg.id, msg.text, isOwn);
            }
            lt = null;
        }, 500);
    }, { passive: true });
    
    el.addEventListener('touchend', () => { 
        if (lt) { 
            clearTimeout(lt); 
            lt = null; 
        } 
    }, { passive: true });
    
    el.addEventListener('touchmove', () => { 
        if (lt) { 
            clearTimeout(lt); 
            lt = null; 
        } 
    }, { passive: true });
}

function getReadIcon(isRead) {
    if (isRead) {
        return `<svg class="read-icon double-check" viewBox="0 0 20 14" fill="none"><path d="M1 7L5 11L10 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 7L12 11L19 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }
    return `<svg class="read-icon single-check" viewBox="0 0 12 10" fill="none"><path d="M1 5L4 8L11 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function setMessageReadStatus(readSpan, isRead) {
    if (!readSpan) return;
    readSpan.className = `read-status ${isRead ? 'read' : 'unread'}`;
    readSpan.innerHTML = getReadIcon(isRead);
}

function subscribeToMessages(chatId) {
    if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = supabaseClient.channel(`chat-${chatId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, async payload => {
            if (document.querySelector(`.message[data-id="${payload.new.id}"]`)) return;
            
            if (payload.new.is_system) {
                if (currentChat?.id === chatId) {
                    renderSystemMessage(payload.new.text, payload.new.created_at);
                }
                loadDialogs();
                return;
            }
            
            let profile = currentProfile;
            if (payload.new.user_id !== currentUser?.id) {
                if (payload.new.user_id === BOT_USER_ID) profile = BOT_PROFILE;
                else {
                    const { data } = await supabaseClient.from('profiles').select('full_name, username, bio').eq('id', payload.new.user_id).single();
                    if (data) profile = data;
                }
            }
            const isFromOther = payload.new.user_id !== currentUser?.id;
            const newMsg = { ...payload.new, profiles: profile, is_read: !isFromOther || chatId === SAVED_CHAT_ID };
            if (messagesCache.has(chatId)) messagesCache.get(chatId).push(newMsg);
            renderMessage(newMsg, true);
            if (currentChat?.id === chatId && isFromOther && chatId !== SAVED_CHAT_ID) {
                setTimeout(() => markChatMessagesAsRead(chatId), 100);
            }
            loadDialogs();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, payload => {
            const el = document.querySelector(`.message[data-id="${payload.new.id}"]`);
            if (el) {
                const textEl = el.querySelector('.text');
                if (textEl) textEl.textContent = payload.new.text;
                if (payload.new.is_edited) {
                    const timeEl = el.querySelector('.msg-time');
                    if (timeEl && !timeEl.querySelector('.edited-mark')) {
                        const em = document.createElement('span');
                        em.className = 'edited-mark';
                        em.textContent = 'ред.';
                        timeEl.insertBefore(em, timeEl.firstChild.nextSibling);
                    }
                }
                if (payload.new.is_read) {
                    const rs = el.querySelector('.read-status');
                    if (rs) setMessageReadStatus(rs, true);
                    el.classList.remove('unread-message');
                }
            }
            if (messagesCache.has(chatId)) {
                const idx = messagesCache.get(chatId).findIndex(m => m.id === payload.new.id);
                if (idx !== -1) Object.assign(messagesCache.get(chatId)[idx], payload.new);
            }
            loadDialogs();
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, payload => {
            document.querySelector(`.message[data-id="${payload.old.id}"]`)?.remove();
            if (messagesCache.has(chatId)) {
                messagesCache.set(chatId, messagesCache.get(chatId).filter(m => m.id !== payload.old.id));
            }
            loadDialogs();
        })
        .subscribe();
}

function setupTypingIndicator() {
    const input = document.getElementById('message-input');
    if (!input) return;
    input.addEventListener('input', () => {
        if (!currentChat || currentChat.other_user?.id === BOT_USER_ID || currentChat.id === SAVED_CHAT_ID) return;
        if (typingTimeout) clearTimeout(typingTimeout);
        if (!isTyping) { isTyping = true; sendTypingStatus(true); }
        typingTimeout = setTimeout(() => { isTyping = false; sendTypingStatus(false); }, 1000);
    });
}

async function sendTypingStatus(now) {
    if (!currentChat || !typingChannel) return;
    try { await typingChannel.send({ type: 'broadcast', event: 'typing', payload: { isTyping: now, userId: currentUser.id } }); } catch {}
}

function subscribeToTyping(chatId) {
    if (typingChannel) supabaseClient.removeChannel(typingChannel);
    typingChannel = supabaseClient.channel(`typing-${chatId}`)
        .on('broadcast', { event: 'typing' }, payload => {
            if (payload.payload.userId === currentUser.id) return;
            const ts = document.querySelector('.typing-status');
            if (!ts) return;
            if (payload.payload.isTyping) {
                ts.textContent = 'печатает...';
                ts.style.display = 'block';
                setTimeout(() => { if (ts.textContent === 'печатает...') ts.style.display = 'none'; }, 3000);
            } else {
                ts.style.display = 'none';
            }
        })
        .subscribe();
}

async function sendMsg() {
    const input = document.getElementById('message-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text || !currentUser || !currentChat) { if (!currentChat) showToast('Выберите чат', true); return; }
    if (currentChat.other_user?.id === BOT_USER_ID) { showToast('Нельзя писать боту', true); return; }

    const original = text;
    input.value = '';
    const sendBtn = document.getElementById('btn-send-msg');
    if (sendBtn) sendBtn.disabled = true;

    const tempId = `temp-${Date.now()}`;
    const tempMsg = { id: tempId, text, user_id: currentUser.id, chat_id: currentChat.id, created_at: new Date().toISOString(), is_read: currentChat.id === SAVED_CHAT_ID, profiles: currentProfile };
    renderMessage(tempMsg, true);

    try {
        const { data, error } = await supabaseClient.from('messages')
            .insert([{ text, user_id: currentUser.id, chat_id: currentChat.id, is_read: currentChat.id === SAVED_CHAT_ID, created_at: new Date().toISOString() }])
            .select().single();
        if (error) throw error;
        document.querySelector(`.message[data-id="${tempId}"]`)?.remove();
        renderMessage({ ...data, profiles: currentProfile }, true);
        await supabaseClient.from('chats').update({ updated_at: new Date().toISOString(), last_message: text.slice(0, 50) }).eq('id', currentChat.id);
        loadDialogs();
    } catch (err) {
        input.value = original;
        showToast('Ошибка отправки: ' + (err.message || ''), true);
        document.querySelector(`.message[data-id="${tempId}"]`)?.remove();
    } finally {
        if (sendBtn) sendBtn.disabled = false;
        input.focus();
    }
}

function updateDialogLastMessage(chatId, text, isOwn) {
    const item = document.querySelector(`.dialog-item[data-chat-id="${chatId}"]`);
    if (!item) return;
    const preview = item.querySelector('.dialog-preview');
    if (preview) preview.textContent = (isOwn ? 'Вы: ' : '') + (text.length > 50 ? text.slice(0, 47) + '...' : text);
    item.parentNode?.insertBefore(item, item.parentNode.firstChild);
}

function updateChatStatusFromProfile(profile) {
    const cs = document.querySelector('.chat-status');
    if (!cs) return;
    
    if (currentChat?.other_user?.id === BOT_USER_ID) {
        cs.textContent = 'бот';
        cs.className = 'chat-status status-bot';
        return;
    }
    
    if (currentChat?.id === SAVED_CHAT_ID) {
        cs.textContent = 'личное';
        cs.className = 'chat-status';
        return;
    }
    
    const status = getUserStatusFromProfile(profile);
    cs.textContent = status.text;
    cs.className = `chat-status ${status.class}`;
    
    // Добавляем стиль для онлайн статуса
    if (status.isOnline) {
        cs.style.color = '#22c55e';
    } else {
        cs.style.color = '';
    }
}

window.getOrCreatePrivateChat = getOrCreatePrivateChat;
window.markChatMessagesAsRead = markChatMessagesAsRead;
window.setupReadStatusObserver = setupReadStatusObserver;
window.loadMessages = loadMessages;
window.renderMessage = renderMessage;
window.renderMessagesList = renderMessagesList;
window.renderSystemMessage = renderSystemMessage;
window.subscribeToMessages = subscribeToMessages;
window.setupTypingIndicator = setupTypingIndicator;
window.sendTypingStatus = sendTypingStatus;
window.subscribeToTyping = subscribeToTyping;
window.sendMsg = sendMsg;
window.updateDialogLastMessage = updateDialogLastMessage;
window.setMessageReadStatus = setMessageReadStatus;
window.attachMessageContextMenu = attachMessageContextMenu;
window.updateChatStatusFromProfile = updateChatStatusFromProfile;
