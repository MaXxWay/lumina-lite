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
            const cached = messagesCache.get(chatId);
            cached.forEach(msg => { if (msg.user_id !== currentUser.id) msg.is_read = true; });
            messagesCache.set(chatId, cached);
        }
        
        const container = document.getElementById('messages');
        if (container && currentChat?.id === chatId) {
            container.querySelectorAll('.message:not(.own)').forEach(msgDiv => {
                const readSpan = msgDiv.querySelector('.read-status');
                if (readSpan && !msgDiv.classList.contains('bot-message')) {
                    readSpan.className = 'read-status read';
                    readSpan.innerHTML = '✓✓';
                }
                msgDiv.classList.remove('unread-message');
            });
        }
        if (typeof loadDialogs === 'function') await loadDialogs();
    } catch (err) { console.error('Ошибка отметки прочитанных:', err); }
}

function setupReadStatusObserver() {
    const container = document.getElementById('messages');
    if (!container) return;
    const observer = new IntersectionObserver((entries) => {
        const visibleMessages = [];
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const msgDiv = entry.target;
                const msgId = msgDiv.dataset.id;
                const isOwn = msgDiv.classList.contains('own');
                const isBot = msgDiv.classList.contains('bot-message');
                const isRead = msgDiv.querySelector('.read-status')?.classList.contains('read');
                if (!isOwn && !isBot && msgId && !isRead && !observedMessages.has(msgId)) {
                    visibleMessages.push(msgId);
                    observedMessages.add(msgId);
                }
            }
        });
        if (visibleMessages.length > 0 && currentChat && currentChat.id !== SAVED_CHAT_ID) {
            if (readCheckTimeout) clearTimeout(readCheckTimeout);
            readCheckTimeout = setTimeout(async () => {
                try {
                    await supabaseClient.from('messages').update({ is_read: true }).in('id', visibleMessages);
                    visibleMessages.forEach(msgId => {
                        const msgDiv = document.querySelector(`.message[data-id="${msgId}"]`);
                        if (msgDiv) {
                            const readSpan = msgDiv.querySelector('.read-status');
                            if (readSpan) { readSpan.className = 'read-status read'; readSpan.innerHTML = '✓✓'; }
                            msgDiv.classList.remove('unread-message');
                        }
                    });
                    if (messagesCache.has(currentChat.id)) {
                        const cached = messagesCache.get(currentChat.id);
                        cached.forEach(msg => { if (visibleMessages.includes(msg.id)) msg.is_read = true; });
                        messagesCache.set(currentChat.id, cached);
                    }
                    if (typeof loadDialogs === 'function') await loadDialogs();
                } catch (err) {}
                readCheckTimeout = null;
            }, 500);
        }
    }, { threshold: 0.5 });
    
    const observeNewMessages = () => {
        container.querySelectorAll('.message:not(.own):not(.bot-message)').forEach(msg => observer.observe(msg));
    };
    observeNewMessages();
    const mutationObserver = new MutationObserver(() => observeNewMessages());
    mutationObserver.observe(container, { childList: true, subtree: true });
    return { observer, mutationObserver };
}

async function loadMessages(chatId) {
    const container = document.getElementById('messages');
    if (!container) return;
    if (messagesCache.has(chatId) && messagesCache.get(chatId).length > 0) {
        const cached = messagesCache.get(chatId);
        container.innerHTML = '';
        let lastDate = null;
        cached.forEach(msg => {
            const currentDate = formatDateDivider(msg.created_at);
            if (lastDate !== currentDate) {
                const div = document.createElement('div');
                div.className = 'date-divider';
                div.innerHTML = `<div class="date-divider-line"></div><div class="date-divider-text">${currentDate}</div><div class="date-divider-line"></div>`;
                container.appendChild(div);
                lastDate = currentDate;
            }
            renderMessage(msg, false);
        });
        container.scrollTop = container.scrollHeight;
        return;
    }
    if (isLoadingMessages) return;
    isLoadingMessages = true;
    try {
        const { data: msgs } = await supabaseClient.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true }).limit(200);
        const userIds = [...new Set(msgs?.map(m => m.user_id) || [])];
        const profilesMap = new Map();
        if (userIds.length > 0) {
            const { data: profiles } = await supabaseClient.from('profiles').select('id, full_name, username').in('id', userIds);
            if (profiles) profiles.forEach(p => profilesMap.set(p.id, p));
        }
        profilesMap.set(BOT_USER_ID, BOT_PROFILE);
        const messagesWithProfiles = (msgs || []).map(msg => ({ ...msg, profiles: profilesMap.get(msg.user_id), is_read: msg.is_read || false }));
        messagesCache.set(chatId, messagesWithProfiles);
        container.innerHTML = '';
        if (messagesWithProfiles.length > 0) {
            let lastDate = null;
            messagesWithProfiles.forEach(msg => {
                const currentDate = formatDateDivider(msg.created_at);
                if (lastDate !== currentDate) {
                    const div = document.createElement('div');
                    div.className = 'date-divider';
                    div.innerHTML = `<div class="date-divider-line"></div><div class="date-divider-text">${currentDate}</div><div class="date-divider-line"></div>`;
                    container.appendChild(div);
                    lastDate = currentDate;
                }
                renderMessage(msg, false);
            });
        } else {
            container.innerHTML = '<div class="msg-stub">Начните переписку</div>';
        }
        container.scrollTop = container.scrollHeight;
    } catch (err) {
        container.innerHTML = '<div class="loading-messages">Ошибка загрузки</div>';
    } finally { isLoadingMessages = false; }
}

function renderMessage(msg, isNewMessage = false) {
    const container = document.getElementById('messages');
    if (!container) return;
    
    const stub = container.querySelector('.msg-stub');
    if (stub) stub.remove();
    
    const isOwn = currentUser && msg.user_id === currentUser.id;
    const isBot = msg.user_id === BOT_USER_ID;
    let name = 'Пользователь';
    
    if (msg.profiles?.full_name) name = msg.profiles.full_name;
    else if (isOwn && currentProfile?.full_name) name = currentProfile.full_name;
    else if (isBot) name = 'Lumina Bot';
    
    const timeStr = new Date(msg.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
    const isRead = msg.is_read === true;
    
    const lastChild = container.lastChild;
    let lastDate = null;
    
    if (lastChild) {
        if (lastChild.classList && lastChild.classList.contains('date-divider')) {
            const dateText = lastChild.querySelector('.date-divider-text')?.textContent;
            lastDate = dateText;
        } else if (lastChild.dataset && lastChild.dataset.date) {
            lastDate = lastChild.dataset.date;
        }
    }
    
    const formattedCurrentDate = formatDateDivider(msg.created_at);
    
    if (lastDate && lastDate !== formattedCurrentDate && !(lastChild && lastChild.classList && lastChild.classList.contains('date-divider') && lastDate === formattedCurrentDate)) {
        const dateDivider = document.createElement('div');
        dateDivider.className = 'date-divider';
        dateDivider.innerHTML = `
            <div class="date-divider-line"></div>
            <div class="date-divider-text">${formattedCurrentDate}</div>
            <div class="date-divider-line"></div>
        `;
        container.appendChild(dateDivider);
    }
    
    const divMsg = document.createElement('div');
    divMsg.className = `message ${isOwn ? 'own' : 'other'} ${isBot ? 'bot-message' : ''} ${!isOwn && !isRead && currentChat?.id !== SAVED_CHAT_ID ? 'unread-message' : ''}`;
    divMsg.dataset.id = msg.id;
    divMsg.dataset.text = msg.text;
    divMsg.dataset.date = formattedCurrentDate;
    
    const readStatusHtml = (isOwn && !isBot && currentChat?.id !== SAVED_CHAT_ID) ? 
        `<span class="read-status ${isRead ? 'read' : 'unread'}">${isRead ? '✓✓' : '✓'}</span>` : '';
    
    const botVerifiedBadge = isBot ? `
        <div class="verified-badge-small">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        </div>
    ` : '';
    
    divMsg.innerHTML = `
        <div class="msg-avatar ${isBot ? 'bot-avatar' : ''}">
            ${isBot ? '<img src="lumina.svg" alt="Bot">' : `<div class="avatar-letter">${escapeHtml(name.charAt(0))}</div>`}
            ${botVerifiedBadge}
        </div>
        <div class="msg-bubble">
            ${!isOwn ? `<div class="msg-sender">${escapeHtml(name)} ${isBot ? '<span class="bot-badge-small">Бот</span>' : ''}</div>` : ''}
            <div class="text">${escapeHtml(msg.text)}</div>
            <div class="msg-time">${timeStr} ${readStatusHtml}</div>
        </div>
    `;
    
    divMsg.oncontextmenu = (e) => {
        if (typeof showMessageMenu === 'function') showMessageMenu(e, msg.id, msg.text, isOwn);
        return false;
    };
    
    container.appendChild(divMsg);
    
    if (isNewMessage) {
        setTimeout(() => container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' }), 50);
    } else {
        setTimeout(() => container.scrollTop = container.scrollHeight, 50);
    }
}

function subscribeToMessages(chatId) {
    if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = supabaseClient.channel(`chat-${chatId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, async (payload) => {
            if (document.querySelector(`.message[data-id="${payload.new.id}"]`)) return;
            let profile = currentProfile;
            if (payload.new.user_id !== currentUser?.id) {
                if (payload.new.user_id === BOT_USER_ID) profile = BOT_PROFILE;
                else {
                    const { data: userProfile } = await supabaseClient.from('profiles').select('full_name, username').eq('id', payload.new.user_id).single();
                    if (userProfile) profile = userProfile;
                }
            }
            const isFromOther = payload.new.user_id !== currentUser?.id;
            const newMsg = { ...payload.new, profiles: profile, is_read: !isFromOther || chatId === SAVED_CHAT_ID };
            if (messagesCache.has(chatId)) messagesCache.get(chatId).push(newMsg);
            renderMessage(newMsg, true);
            if (typeof updateDialogLastMessage === 'function') updateDialogLastMessage(chatId, payload.new.text, !isFromOther);
            if (currentChat?.id === chatId && isFromOther && chatId !== SAVED_CHAT_ID) setTimeout(() => markChatMessagesAsRead(chatId), 100);
            if (typeof loadDialogs === 'function') await loadDialogs();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, async (payload) => {
            const msgDiv = document.querySelector(`.message[data-id="${payload.new.id}"]`);
            if (msgDiv) {
                msgDiv.querySelector('.text').textContent = payload.new.text;
                if (payload.new.is_read && !msgDiv.classList.contains('own') && !msgDiv.classList.contains('bot-message')) {
                    msgDiv.classList.remove('unread-message');
                    const rs = msgDiv.querySelector('.read-status');
                    if (rs) { rs.className = 'read-status read'; rs.innerHTML = '✓✓'; }
                }
            }
            if (messagesCache.has(chatId)) {
                const idx = messagesCache.get(chatId).findIndex(m => m.id === payload.new.id);
                if (idx !== -1) { messagesCache.get(chatId)[idx].text = payload.new.text; messagesCache.get(chatId)[idx].is_read = payload.new.is_read; }
            }
            if (currentChat?.id !== chatId && typeof updateDialogLastMessage === 'function') updateDialogLastMessage(chatId, payload.new.text, false);
            if (typeof loadDialogs === 'function') await loadDialogs();
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, (payload) => {
            document.querySelector(`.message[data-id="${payload.old.id}"]`)?.remove();
            if (messagesCache.has(chatId)) messagesCache.set(chatId, messagesCache.get(chatId).filter(m => m.id !== payload.old.id));
            if (typeof loadDialogs === 'function') loadDialogs();
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
    try { await typingChannel.send({ type: 'broadcast', event: 'typing', payload: { isTyping: now, userId: currentUser.id } }); } catch (err) {}
}

function subscribeToTyping(chatId) {
    if (typingChannel) supabaseClient.removeChannel(typingChannel);
    typingChannel = supabaseClient.channel(`typing-${chatId}`)
        .on('broadcast', { event: 'typing' }, (payload) => {
            if (payload.payload.userId === currentUser.id) return;
            const ts = document.querySelector('.typing-status');
            if (!ts) return;
            if (payload.payload.isTyping) {
                ts.textContent = 'печатает...';
                ts.style.display = 'block';
                setTimeout(() => { if (ts.textContent === 'печатает...') ts.style.display = 'none'; }, 3000);
            } else ts.style.display = 'none';
        })
        .subscribe();
}

async function sendMsg() {
    const input = document.getElementById('message-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text || !currentUser || !currentChat) {
        if (!currentChat) showToast('Выберите чат', true);
        return;
    }
    if (currentChat.other_user?.id === BOT_USER_ID) { showToast('Нельзя отправлять сообщения боту', true); return; }
    const original = text;
    input.value = '';
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const tempMsg = { id: tempId, text, user_id: currentUser.id, chat_id: currentChat.id, created_at: new Date().toISOString(), is_read: currentChat.id === SAVED_CHAT_ID, is_sending: true, profiles: currentProfile };
    renderMessage(tempMsg, true);
    const sendBtn = document.getElementById('btn-send-msg');
    if (sendBtn) sendBtn.disabled = true;
    try {
        const { data, error } = await supabaseClient.from('messages').insert([{ text, user_id: currentUser.id, chat_id: currentChat.id, is_read: currentChat.id === SAVED_CHAT_ID, created_at: new Date().toISOString() }]).select().single();
        if (error) throw error;
        document.querySelector(`.message[data-id="${tempId}"]`)?.remove();
        renderMessage({ ...data, profiles: currentProfile }, true);
        await supabaseClient.from('chats').update({ updated_at: new Date().toISOString(), last_message: text.slice(0, 50) }).eq('id', currentChat.id);
        if (typeof loadDialogs === 'function') loadDialogs();
    } catch (error) {
        input.value = original;
        showToast('Ошибка отправки: ' + (error.message || 'Неизвестная ошибка'), true);
        document.querySelector(`.message[data-id="${tempId}"]`)?.remove();
    } finally { if (sendBtn) sendBtn.disabled = false; input.focus(); }
}

function updateDialogLastMessage(chatId, text, isOwn) {
    const item = document.querySelector(`.dialog-item[data-chat-id="${chatId}"]`);
    if (item) {
        const preview = item.querySelector('.dialog-preview');
        if (preview) preview.textContent = (isOwn ? 'Вы: ' : '') + (text.length > 50 ? text.slice(0, 47) + '...' : text);
        item.parentNode.insertBefore(item, item.parentNode.firstChild);
    }
}

// Экспорт
window.getOrCreatePrivateChat = getOrCreatePrivateChat;
window.markChatMessagesAsRead = markChatMessagesAsRead;
window.setupReadStatusObserver = setupReadStatusObserver;
window.loadMessages = loadMessages;
window.renderMessage = renderMessage;
window.subscribeToMessages = subscribeToMessages;
window.setupTypingIndicator = setupTypingIndicator;
window.sendTypingStatus = sendTypingStatus;
window.subscribeToTyping = subscribeToTyping;
window.sendMsg = sendMsg;
window.updateDialogLastMessage = updateDialogLastMessage;
