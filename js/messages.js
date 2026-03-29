import { store } from './store.js';
import { supabase } from './config.js';
import { escapeHtml, formatTime, showToast } from './utils.js';
import { uiManager } from './ui.js';
import { BOT_USER_ID, BOT_PROFILE } from './config.js';

let messageMenu = null;
let activeMessage = null;

export function initMessages() {
    messageMenu = document.getElementById('message-menu');
    attachMessageEventListeners();
}

function attachMessageEventListeners() {
    const sendButton = document.getElementById('btn-send-msg');
    if (sendButton) sendButton.onclick = sendMessage;
    
    const messageInput = document.getElementById('message-input');
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
    
    // Эмодзи
    const emojiBtn = document.getElementById('btn-emoji');
    const emojiPicker = document.getElementById('emoji-picker');
    if (emojiBtn && emojiPicker) {
        emojiBtn.onclick = (e) => {
            e.stopPropagation();
            const isVisible = emojiPicker.style.display === 'flex';
            emojiPicker.style.display = isVisible ? 'none' : 'flex';
        };
        
        document.querySelectorAll('.emoji-item').forEach(emoji => {
            emoji.onclick = () => {
                const input = document.getElementById('message-input');
                if (input) {
                    input.value += emoji.textContent;
                    input.focus();
                }
                emojiPicker.style.display = 'none';
            };
        });
        
        document.addEventListener('click', (e) => {
            if (emojiPicker && !emojiPicker.contains(e.target) && e.target !== emojiBtn) {
                emojiPicker.style.display = 'none';
            }
        });
    }
}

export async function sendMessage() {
    const input = document.getElementById('message-input');
    if (!input) return;
    
    const text = input.value.trim();
    const state = store.getState();
    
    if (!text || !state.currentUser || !state.currentChat) {
        if (!state.currentChat) showToast('Выберите чат', true);
        return;
    }
    
    const isBot = state.currentChat.other_user?.id === BOT_USER_ID;
    if (isBot) {
        showToast('Нельзя отправлять сообщения боту', true);
        return;
    }
    
    input.value = '';
    
    const { data, error } = await supabase
        .from('messages')
        .insert([{ 
            text, 
            user_id: state.currentUser.id,
            chat_id: state.currentChat.id,
            is_read: false,
            created_at: new Date().toISOString()
        }])
        .select()
        .single();
    
    if (error) {
        showToast('Ошибка отправки', true);
        input.value = text;
    } else {
        const newMessage = { 
            ...data, 
            profiles: state.currentProfile,
            is_read: true
        };
        renderMessage(newMessage);
        
        await supabase
            .from('chats')
            .update({ 
                updated_at: new Date().toISOString(),
                last_message: text.slice(0, 50)
            })
            .eq('id', state.currentChat.id);
        
        input.focus();
    }
}

export function renderMessage(msg) {
    const container = document.getElementById('messages');
    if (!container) return;
    
    const stub = container.querySelector('.msg-stub');
    if (stub) stub.remove();
    
    const state = store.getState();
    const isOwn = state.currentUser && msg.user_id === state.currentUser.id;
    const isBot = msg.user_id === BOT_USER_ID;
    
    let name = 'Пользователь';
    if (msg.profiles && msg.profiles.full_name) name = msg.profiles.full_name;
    else if (isOwn && state.currentProfile && state.currentProfile.full_name) name = state.currentProfile.full_name;
    else if (isBot) name = 'Lumina Bot';
    
    const timeStr = formatTime(msg.created_at);
    
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'own' : 'other'} ${isBot ? 'bot-message' : ''}`;
    div.dataset.id = msg.id;
    div.dataset.text = msg.text;
    
    div.innerHTML = `
        <div class="msg-avatar ${isBot ? 'bot-avatar' : ''}">
            ${isBot ? '<img src="lumina.svg" alt="Bot" width="28" height="28">' : `<div class="avatar-letter">${escapeHtml(name.charAt(0))}</div>`}
            ${isBot ? '<div class="verified-badge-small"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' : ''}
        </div>
        <div class="msg-bubble">
            ${!isOwn ? `<div class="msg-sender">${escapeHtml(name)} ${isBot ? '<span class="bot-badge-small">Бот</span>' : ''}</div>` : ''}
            <div class="text">${escapeHtml(msg.text)}</div>
            <div class="msg-time">${timeStr}</div>
        </div>
    `;
    
    div.oncontextmenu = (e) => {
        showMessageMenu(e, msg.id, msg.text, isOwn);
        return false;
    };
    
    container.appendChild(div);
    setTimeout(() => {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }, 50);
}

export async function loadMessages(chatId) {
    const container = document.getElementById('messages');
    if (!container) return;
    
    const state = store.getState();
    
    // Проверяем кеш
    const cached = store.getFromMessagesCache(chatId);
    if (cached && cached.length > 0) {
        container.innerHTML = '';
        cached.forEach(msg => renderMessage(msg));
        container.scrollTop = container.scrollHeight;
        return;
    }
    
    if (state.isLoadingMessages) return;
    store.setState({ isLoadingMessages: true });
    
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
        
        store.addToMessagesCache(chatId, messagesWithProfiles);
        container.innerHTML = '';
        
        if (messagesWithProfiles.length > 0) {
            messagesWithProfiles.forEach(msg => renderMessage(msg));
        } else {
            uiManager.showEmptyMessages();
        }
        
        container.scrollTop = container.scrollHeight;
    } catch (err) {
        console.error(err);
        container.innerHTML = '<div class="loading-messages">Ошибка загрузки</div>';
    } finally {
        store.setState({ isLoadingMessages: false });
    }
}

export async function markChatMessagesAsRead(chatId) {
    if (!chatId || !store.getState().currentUser) return;
    
    try {
        const { error } = await supabase
            .from('messages')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('chat_id', chatId)
            .neq('user_id', store.getState().currentUser.id)
            .eq('is_read', false);
        
        if (error) throw error;
        
        // Обновляем кеш
        const cached = store.getFromMessagesCache(chatId);
        if (cached) {
            cached.forEach(msg => {
                if (msg.user_id !== store.getState().currentUser?.id) {
                    msg.is_read = true;
                }
            });
            store.addToMessagesCache(chatId, cached);
        }
    } catch (err) {
        console.error('Ошибка отметки прочитанных:', err);
    }
}

function showMessageMenu(e, messageId, messageText, isOwn) {
    e.preventDefault();
    e.stopPropagation();
    
    if (messageMenu) {
        messageMenu.style.display = 'block';
        messageMenu.style.left = `${e.clientX}px`;
        messageMenu.style.top = `${e.clientY}px`;
        
        const menuItems = messageMenu.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            const action = item.dataset.action;
            item.onclick = () => handleMessageAction(action, messageId, messageText, isOwn);
        });
        
        setTimeout(() => {
            document.addEventListener('click', hideMessageMenu);
        }, 0);
    }
}

function hideMessageMenu() {
    if (messageMenu) {
        messageMenu.style.display = 'none';
    }
    document.removeEventListener('click', hideMessageMenu);
}

async function handleMessageAction(action, messageId, messageText, isOwn) {
    hideMessageMenu();
    
    switch (action) {
        case 'reply':
            const input = document.getElementById('message-input');
            if (input) {
                input.value = `> ${messageText}\n\n`;
                input.focus();
            }
            break;
        case 'copy':
            await navigator.clipboard.writeText(messageText);
            showToast('Текст скопирован');
            break;
        case 'edit':
            if (isOwn) {
                const newText = prompt('Изменить сообщение:', messageText);
                if (newText && newText.trim()) {
                    const { error } = await supabase
                        .from('messages')
                        .update({ text: newText.trim(), is_edited: true })
                        .eq('id', messageId);
                    if (error) {
                        showToast('Ошибка редактирования', true);
                    } else {
                        showToast('Сообщение изменено');
                    }
                }
            } else {
                showToast('Можно редактировать только свои сообщения', true);
            }
            break;
        case 'pin':
            showToast('Функция закрепления в разработке');
            break;
        case 'forward':
            showToast('Функция пересылки в разработке');
            break;
        case 'delete':
            if (isOwn) {
                const confirm = window.confirm('Удалить сообщение?');
                if (confirm) {
                    const { error } = await supabase
                        .from('messages')
                        .delete()
                        .eq('id', messageId);
                    if (error) {
                        showToast('Ошибка удаления', true);
                    } else {
                        showToast('Сообщение удалено');
                    }
                }
            } else {
                showToast('Можно удалять только свои сообщения', true);
            }
            break;
    }
}
