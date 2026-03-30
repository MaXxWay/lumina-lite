// Логика чата и сообщений
async function getOrCreatePrivateChat(otherUserId) {
    try {
        if (otherUserId === BOT_USER_ID) {
            const { data: existing } = await supabase
                .from('chats')
                .select('id')
                .eq('type', 'private')
                .contains('participants', [currentUser.id, BOT_USER_ID])
                .maybeSingle();
            return existing?.id;
        }
        
        const { data: existing } = await supabase
            .from('chats')
            .select('id')
            .eq('type', 'private')
            .contains('participants', [currentUser.id, otherUserId])
            .maybeSingle();
        
        if (existing) return existing.id;
        
        const { data: newChat } = await supabase
            .from('chats')
            .insert({
                type: 'private',
                participants: [currentUser.id, otherUserId],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();
        
        return newChat.id;
    } catch (err) {
        throw err;
    }
}

async function markChatMessagesAsRead(chatId) {
    if (!chatId || !currentUser || chatId === SAVED_CHAT_ID) return;
    
    try {
        const { error } = await supabase
            .from('messages')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('chat_id', chatId)
            .neq('user_id', currentUser.id)
            .eq('is_read', false);
        
        if (error) throw error;
        
        if (messagesCache.has(chatId)) {
            const cachedMessages = messagesCache.get(chatId);
            cachedMessages.forEach(msg => {
                if (msg.user_id !== currentUser.id) {
                    msg.is_read = true;
                }
            });
            messagesCache.set(chatId, cachedMessages);
        }
        
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer && currentChat?.id === chatId) {
            const allMessages = messagesContainer.querySelectorAll('.message:not(.own)');
            allMessages.forEach(msgDiv => {
                const readSpan = msgDiv.querySelector('.read-status');
                if (readSpan && !msgDiv.classList.contains('bot-message')) {
                    readSpan.className = 'read-status read';
                    readSpan.innerHTML = '✓✓';
                }
                msgDiv.classList.remove('unread-message');
            });
        }
        
        await loadDialogs();
        
        console.log(`✅ Чат ${chatId} отмечен как прочитанный`);
        
    } catch (err) {
        console.error('Ошибка отметки прочитанных:', err);
    }
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
                    const { error } = await supabase
                        .from('messages')
                        .update({ is_read: true, read_at: new Date().toISOString() })
                        .in('id', visibleMessages);
                    
                    if (!error && currentChat) {
                        visibleMessages.forEach(msgId => {
                            const msgDiv = document.querySelector(`.message[data-id="${msgId}"]`);
                            if (msgDiv) {
                                const readSpan = msgDiv.querySelector('.read-status');
                                if (readSpan) {
                                    readSpan.className = 'read-status read';
                                    readSpan.innerHTML = '✓✓';
                                }
                                msgDiv.classList.remove('unread-message');
                            }
                        });
                        
                        if (messagesCache.has(currentChat.id)) {
                            const cached = messagesCache.get(currentChat.id);
                            cached.forEach(msg => {
                                if (visibleMessages.includes(msg.id)) msg.is_read = true;
                            });
                            messagesCache.set(currentChat.id, cached);
                        }
                        
                        await loadDialogs();
                    }
                } catch (err) {}
                readCheckTimeout = null;
            }, 500);
        }
    }, { threshold: 0.5 });
    
    const observeNewMessages = () => {
        const messages = container.querySelectorAll('.message:not(.own):not(.bot-message)');
        messages.forEach(msg => observer.observe(msg));
    };
    
    observeNewMessages();
    
    const mutationObserver = new MutationObserver(() => {
        observeNewMessages();
    });
    
    mutationObserver.observe(container, { childList: true, subtree: true });
    
    return { observer, mutationObserver };
}

async function loadMessages(chatId) {
    const container = document.getElementById('messages');
    if (!container) return;
    
    if (messagesCache.has(chatId) && messagesCache.get(chatId).length > 0) {
        const cachedMessages = messagesCache.get(chatId);
        container.innerHTML = '';
        let lastDate = null;
        cachedMessages.forEach(msg => {
            const currentDate = new Date(msg.created_at).toDateString();
            if (!lastDate || lastDate !== currentDate) {
                const dateDivider = document.createElement('div');
                dateDivider.className = 'date-divider';
                dateDivider.innerHTML = `
                    <div class="date-divider-line"></div>
                    <div class="date-divider-text">${formatDateDivider(msg.created_at)}</div>
                    <div class="date-divider-line"></div>
                `;
                container.appendChild(dateDivider);
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
        const { data: msgs, error } = await supabase
            .from('messages')
            .select('*')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: true })
            .limit(200);
        
        if (error) throw error;
        
        const userIds = [...new Set(msgs?.map(m => m.user_id) || [])];
        const profilesMap = new Map();
        
        if (userIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, full_name, username')
                .in('id', userIds);
            if (profiles) profiles.forEach(p => profilesMap.set(p.id, p));
        }
        profilesMap.set(BOT_USER_ID, BOT_PROFILE);
        
        const messagesWithProfiles = (msgs || []).map(msg => ({
            ...msg,
            profiles: profilesMap.get(msg.user_id),
            is_read: msg.is_read || false
        }));
        
        messagesCache.set(chatId, messagesWithProfiles);
        container.innerHTML = '';
        
        if (messagesWithProfiles.length > 0) {
            let lastDate = null;
            messagesWithProfiles.forEach(msg => {
                const currentDate = new Date(msg.created_at).toDateString();
                if (!lastDate || lastDate !== currentDate) {
                    const dateDivider = document.createElement('div');
                    dateDivider.className = 'date-divider';
                    dateDivider.innerHTML = `
                        <div class="date-divider-line"></div>
                        <div class="date-divider-text">${formatDateDivider(msg.created_at)}</div>
                        <div class="date-divider-line"></div>
                    `;
                    container.appendChild(dateDivider);
                    lastDate = currentDate;
                }
                renderMessage(msg, false);
            });
        } else {
            container.innerHTML = '<div class="msg-stub">Начните переписку</div>';
        }
        
        container.scrollTop = container.scrollHeight;
    } catch (err) {
        console.error(err);
        container.innerHTML = '<div class="loading-messages">Ошибка загрузки</div>';
    } finally {
        isLoadingMessages = false;
    }
}

function renderMessage(msg, isNewMessage = false) {
    const container = document.getElementById('messages');
    if (!container) return;
    
    const stub = container.querySelector('.msg-stub');
    if (stub) stub.remove();
    
    const isOwn = currentUser && msg.user_id === currentUser.id;
    const isBot = msg.user_id === BOT_USER_ID;
    let name = 'Пользователь';
    
    if (msg.profiles && msg.profiles.full_name) name = msg.profiles.full_name;
    else if (isOwn && currentProfile && currentProfile.full_name) name = currentProfile.full_name;
    else if (isBot) name = 'Lumina Bot';
    
    const timeStr = new Date(msg.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
    const isRead = msg.is_read === true;
    
    const lastMessageDiv = container.querySelector('.message:last-child');
    let lastDate = null;
    
    if (lastMessageDiv && lastMessageDiv.dataset.date) {
        lastDate = lastMessageDiv.dataset.date;
    }
    
    const currentDate = new Date(msg.created_at).toDateString();
    
    if (!lastDate || lastDate !== currentDate) {
        const dateDivider = document.createElement('div');
        dateDivider.className = 'date-divider';
        dateDivider.innerHTML = `
            <div class="date-divider-line"></div>
            <div class="date-divider-text">${formatDateDivider(msg.created_at)}</div>
            <div class="date-divider-line"></div>
        `;
        container.appendChild(dateDivider);
    }
    
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'own' : 'other'} ${isBot ? 'bot-message' : ''} ${!isOwn && !isRead && currentChat?.id !== SAVED_CHAT_ID ? 'unread-message' : ''}`; 
    div.dataset.id = msg.id;
    div.dataset.text = msg.text;
    div.dataset.date = currentDate;
    
    const readStatusHtml = (isOwn && !isBot && currentChat?.id !== SAVED_CHAT_ID) ? `
        <span class="read-status ${isRead ? 'read' : 'unread'}">
            ${isRead ? '✓✓' : '✓'}
        </span>
    ` : '';
    
    div.innerHTML = `
        <div class="msg-avatar ${isBot ? 'bot-avatar' : ''}">
            ${isBot ? '<img src="lumina.svg" alt="Bot">' : `<div class="avatar-letter">${escapeHtml(name.charAt(0))}</div>`}
            ${isBot ? '<div class="verified-badge-small"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' : ''}
        </div>
        <div class="msg-bubble">
            ${!isOwn ? `<div class="msg-sender">${escapeHtml(name)} ${isBot ? '<span class="bot-badge-small">Бот</span>' : ''}</div>` : ''}
            <div class="text">${escapeHtml(msg.text)}</div>
            <div class="msg-time">
                ${timeStr}
                ${readStatusHtml}
            </div>
        </div>
    `;
    
    const textDiv = div.querySelector('.text');
    if (textDiv && msg.text && msg.text.length > 100) {
        textDiv.title = msg.text;
        textDiv.style.cursor = 'help';
    }
    
    div.oncontextmenu = (e) => {
        if (typeof showMessageMenu === 'function') {
            showMessageMenu(e, msg.id, msg.text, isOwn);
        }
        return false;
    };
    
    container.appendChild(div);
    
    if (isNewMessage) {
        setTimeout(() => {
            container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        }, 50);
    } else {
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 50);
    }
}

function subscribeToMessages(chatId) {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    
    realtimeChannel = supabase
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
                        const { data: userProfile } = await supabase
                            .from('profiles')
                            .select('full_name, username')
                            .eq('id', payload.new.user_id)
                            .single();
                        if (userProfile) profile = userProfile;
                    }
                }
                
                const isFromOther = payload.new.user_id !== currentUser?.id;
                
                const newMessage = { 
                    ...payload.new, 
                    profiles: profile,
                    is_read: !isFromOther || chatId === SAVED_CHAT_ID
                };
                
                if (messagesCache.has(chatId)) {
                    const cached = messagesCache.get(chatId);
                    cached.push(newMessage);
                    messagesCache.set(chatId, cached);
                }
                
                renderMessage(newMessage, true);
                updateDialogLastMessage(chatId, payload.new.text, !isFromOther);
                
                if (currentChat?.id === chatId && isFromOther && chatId !== SAVED_CHAT_ID) {
                    setTimeout(() => markChatMessagesAsRead(chatId), 100);
                }
                
                await loadDialogs();
            }
        )
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
            async (payload) => {
                const messageDiv = document.querySelector(`.message[data-id="${payload.new.id}"]`);
                if (messageDiv) {
                    const textDiv = messageDiv.querySelector('.text');
                    if (textDiv) textDiv.textContent = payload.new.text;
                    const timeDiv = messageDiv.querySelector('.msg-time');
                    if (timeDiv && !timeDiv.textContent.includes('(изм)')) {
                        timeDiv.textContent = timeDiv.textContent + ' (изм)';
                    }
                    
                    if (payload.new.is_read && !messageDiv.classList.contains('own') && !messageDiv.classList.contains('bot-message')) {
                        messageDiv.classList.remove('unread-message');
                        const readSpan = messageDiv.querySelector('.read-status');
                        if (readSpan) {
                            readSpan.className = 'read-status read';
                            readSpan.innerHTML = '✓✓';
                        }
                    }
                }
                
                if (messagesCache.has(chatId)) {
                    const cached = messagesCache.get(chatId);
                    const idx = cached.findIndex(m => m.id === payload.new.id);
                    if (idx !== -1) {
                        cached[idx].text = payload.new.text;
                        cached[idx].is_read = payload.new.is_read;
                    }
                    messagesCache.set(chatId, cached);
                }
                
                if (currentChat?.id !== chatId) {
                    updateDialogLastMessage(chatId, payload.new.text, false);
                }
                await loadDialogs();
            }
        )
        .on('postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
            (payload) => {
                const messageDiv = document.querySelector(`.message[data-id="${payload.old.id}"]`);
                if (messageDiv) messageDiv.remove();
                
                if (messagesCache.has(chatId)) {
                    const cached = messagesCache.get(chatId);
                    const filtered = cached.filter(m => m.id !== payload.old.id);
                    messagesCache.set(chatId, filtered);
                }
                loadDialogs();
            }
        )
        .subscribe();
}

function setupTypingIndicator() {
    const messageInput = document.getElementById('message-input');
    if (!messageInput) return;
    
    messageInput.addEventListener('input', () => {
        if (!currentChat || currentChat.other_user?.id === BOT_USER_ID || currentChat.id === SAVED_CHAT_ID) return;
        
        if (typingTimeout) clearTimeout(typingTimeout);
        
        if (!isTyping) {
            isTyping = true;
            sendTypingStatus(true);
        }
        
        typingTimeout = setTimeout(() => {
            isTyping = false;
            sendTypingStatus(false);
        }, 1000);
    });
}

async function sendTypingStatus(isTypingNow) {
    if (!currentChat || !typingChannel) return;
    
    try {
        await typingChannel.send({
            type: 'broadcast',
            event: 'typing',
            payload: { isTyping: isTypingNow, userId: currentUser.id }
        });
    } catch (err) {}
}

function subscribeToTyping(chatId, otherUserId) {
    if (typingChannel) {
        supabase.removeChannel(typingChannel);
    }
    
    typingChannel = supabase
        .channel(`typing-${chatId}`)
        .on('broadcast', { event: 'typing' }, (payload) => {
            if (payload.payload.userId === currentUser.id) return;
            
            const typingStatus = document.querySelector('.typing-status');
            if (!typingStatus) return;
            
            if (payload.payload.isTyping) {
                typingStatus.textContent = 'печатает...';
                typingStatus.style.display = 'block';
                setTimeout(() => {
                    if (typingStatus.textContent === 'печатает...') {
                        typingStatus.style.display = 'none';
                    }
                }, 3000);
            } else {
                typingStatus.style.display = 'none';
            }
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
    
    if (currentChat.other_user?.id === BOT_USER_ID) {
        showToast('Нельзя отправлять сообщения боту', true);
        return;
    }
    
    const originalText = text;
    input.value = '';
    
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const tempMessage = {
        id: tempId,
        text: text,
        user_id: currentUser.id,
        chat_id: currentChat.id,
        created_at: new Date().toISOString(),
        is_read: currentChat.id === SAVED_CHAT_ID,
        is_sending: true,
        profiles: currentProfile
    };
    
    renderMessage(tempMessage, true);
    
    const sendButton = document.getElementById('btn-send-msg');
    if (sendButton) sendButton.disabled = true;
    
    try {
        const { data, error } = await supabase
            .from('messages')
            .insert([{ 
                text, 
                user_id: currentUser.id,
                chat_id: currentChat.id,
                is_read: currentChat.id === SAVED_CHAT_ID,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();
        
        if (error) throw error;
        
        const tempMsgElement = document.querySelector(`.message[data-id="${tempId}"]`);
        if (tempMsgElement) tempMsgElement.remove();
        
        renderMessage({ ...data, profiles: currentProfile }, true);
        
        await supabase
            .from('chats')
            .update({ 
                updated_at: new Date().toISOString(),
                last_message: text.slice(0, 50)
            })
            .eq('id', currentChat.id);
        
        loadDialogs();
        
    } catch (error) {
        input.value = originalText;
        showToast('Ошибка отправки: ' + (error.message || 'Неизвестная ошибка'), true);
        
        const tempMsgElement = document.querySelector(`.message[data-id="${tempId}"]`);
        if (tempMsgElement) tempMsgElement.remove();
    } finally {
        if (sendButton) sendButton.disabled = false;
        input.focus();
    }
}

function updateDialogLastMessage(chatId, text, isOwn) {
    const dialogItem = document.querySelector(`.dialog-item[data-chat-id="${chatId}"]`);
    if (dialogItem) {
        const previewSpan = dialogItem.querySelector('.dialog-preview');
        if (previewSpan) {
            let shortText = text.length > 50 ? text.slice(0, 47) + '...' : text;
            const prefix = isOwn ? 'Вы: ' : '';
            previewSpan.textContent = prefix + shortText;
        }
        const parent = dialogItem.parentNode;
        parent.removeChild(dialogItem);
        parent.insertBefore(dialogItem, parent.firstChild);
    }
}
