import { store } from './store.js';
import { supabase } from './config.js';
import { escapeHtml, getUserStatusFromProfile, debounce } from './utils.js';
import { openChat, getOrCreatePrivateChat } from './chat.js';
import { BOT_USER_ID, BOT_PROFILE } from './config.js';

export async function loadDialogs(searchTerm = '') {
    const container = document.getElementById('dialogs-list');
    if (!container) return;
    
    const isUserSearch = searchTerm.startsWith('@');
    const state = store.getState();
    
    if (isUserSearch && searchTerm.length > 1) {
        await showUserSearchResults(container, searchTerm);
        return;
    }
    
    if (state.isUpdatingDialogs) return;
    store.setState({ isUpdatingDialogs: true });
    
    try {
        const { data: chats, error } = await supabase
            .from('chats')
            .select('*')
            .contains('participants', [state.currentUser.id])
            .order('updated_at', { ascending: false });
        
        if (error) throw error;
        
        const allParticipantIds = chats ? chats.flatMap(c => c.participants) : [];
        const profileMap = new Map();
        
        if (allParticipantIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, full_name, username, last_seen, is_online')
                .in('id', allParticipantIds);
            
            if (profiles) profiles.forEach(p => profileMap.set(p.id, p));
        }
        profileMap.set(BOT_USER_ID, BOT_PROFILE);
        
        const chatData = await Promise.all((chats || []).map(async (chat) => {
            const otherId = chat.participants.find(id => id !== state.currentUser.id);
            const otherUser = profileMap.get(otherId);
            const name = otherUser?.full_name || otherUser?.username || 'Пользователь';
            const isBot = otherId === BOT_USER_ID;
            const unreadCount = await getUnreadCount(chat.id);
            const lastMessage = await getLastMessage(chat.id);
            const status = otherUser ? getUserStatusFromProfile(otherUser) : { text: '', class: '' };
            
            return {
                id: chat.id,
                otherId,
                otherUser,
                name,
                isBot,
                unreadCount,
                lastMessage: lastMessage || 'Нет сообщений',
                updatedAt: chat.updated_at,
                statusText: status.text,
                statusClass: status.class
            };
        }));
        
        chatData.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        
        let filteredData = chatData;
        if (searchTerm && !isUserSearch) {
            filteredData = chatData.filter(chat => 
                chat.name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        
        renderDialogsList(container, filteredData);
        
    } catch (err) {
        console.error(err);
        if (container.children.length === 0) {
            container.innerHTML = '<div class="dialogs-loading">Ошибка загрузки диалогов</div>';
        }
    } finally {
        store.setState({ isUpdatingDialogs: false });
    }
}

async function showUserSearchResults(container, searchTerm) {
    const users = await searchUsersByUsername(searchTerm);
    
    container.innerHTML = `
        <div class="search-header">
            <span class="search-title">👥 Найдено пользователей: ${users.length}</span>
        </div>
    `;
    
    if (users.length === 0) {
        container.innerHTML += '<div class="dialogs-loading">Пользователи не найдены</div>';
    } else {
        users.forEach(user => {
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
        });
    }
}

function renderDialogsList(container, dialogs) {
    const state = store.getState();
    const currentChatId = state.currentChat?.id;
    
    if (dialogs.length === 0) {
        container.innerHTML = '<div class="dialogs-loading">Нет диалогов. Введите @username для поиска</div>';
        return;
    }
    
    container.innerHTML = '';
    
    dialogs.forEach(chat => {
        const div = document.createElement('div');
        div.className = `dialog-item ${currentChatId === chat.id ? 'active' : ''} ${chat.unreadCount > 0 ? 'unread-dialog' : ''}`;
        div.dataset.chatId = chat.id;
        div.dataset.otherUserId = chat.otherId;
        div.innerHTML = `
            <div class="dialog-avatar ${chat.isBot ? 'bot-avatar' : ''}">
                ${chat.isBot ? '<img src="lumina.svg" alt="Bot" width="32" height="32">' : `<div class="avatar-letter">${escapeHtml(chat.name.charAt(0))}</div>`}
                ${chat.isBot ? '<div class="verified-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' : ''}
            </div>
            <div class="dialog-info">
                <div class="dialog-name">
                    ${escapeHtml(chat.name)}
                    ${chat.isBot ? '<span class="bot-badge">Бот</span>' : ''}
                    ${chat.unreadCount > 0 ? `<span class="unread-badge-count">${chat.unreadCount}</span>` : ''}
                </div>
                <div class="dialog-preview">${escapeHtml(chat.lastMessage)}</div>
                ${!chat.isBot && chat.statusText ? `<div class="dialog-status ${chat.statusClass === 'status-online' ? 'dialog-status-online' : 'dialog-status-offline'}">${chat.statusText}</div>` : ''}
            </div>
        `;
        div.onclick = async () => {
            await openChat(chat.id, chat.otherId, chat.otherUser);
            if (chat.unreadCount > 0) {
                await markChatMessagesAsRead(chat.id);
            }
        };
        container.appendChild(div);
    });
}

async function getUnreadCount(chatId) {
    const state = store.getState();
    try {
        const { count, error } = await supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('chat_id', chatId)
            .eq('is_read', false)
            .neq('user_id', state.currentUser.id);
        
        if (error) throw error;
        return count || 0;
    } catch (err) {
        return 0;
    }
}

async function getLastMessage(chatId) {
    try {
        const { data, error } = await supabase
            .from('messages')
            .select('text, user_id')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        if (error) throw error;
        
        if (data) {
            const state = store.getState();
            const isOwn = data.user_id === state.currentUser?.id;
            const prefix = isOwn ? 'Вы: ' : '';
            let text = data.text;
            if (text.length > 50) text = text.slice(0, 47) + '...';
            return prefix + text;
        }
        return null;
    } catch (err) {
        return null;
    }
}

async function searchUsersByUsername(username) {
    const state = store.getState();
    if (!username || username.length < 1) return [];
    
    let cleanUsername = username;
    if (cleanUsername.startsWith('@')) cleanUsername = cleanUsername.substring(1);
    
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, username, full_name')
            .ilike('username', `%${cleanUsername}%`)
            .neq('id', state.currentUser.id)
            .limit(10);
        
        if (error) return [];
        return data || [];
    } catch (err) {
        return [];
    }
}

export function updateDialogLastMessage(chatId, text, isOwn) {
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

export async function subscribeToMessages(chatId) {
    const state = store.getState();
    
    if (state.realtimeChannel) {
        await supabase.removeChannel(state.realtimeChannel);
    }
    
    const channel = supabase
        .channel(`chat-${chatId}`)
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, 
            async (payload) => {
                if (document.querySelector(`.message[data-id="${payload.new.id}"]`)) return;
                
                let profile = state.currentProfile;
                if (payload.new.user_id !== state.currentUser?.id) {
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
                
                const newMessage = { 
                    ...payload.new, 
                    profiles: profile,
                    is_read: payload.new.user_id === state.currentUser?.id
                };
                
                const cached = store.getFromMessagesCache(chatId);
                if (cached) {
                    cached.push(newMessage);
                    store.addToMessagesCache(chatId, cached);
                }
                
                renderMessage(newMessage);
                updateDialogLastMessage(chatId, payload.new.text, payload.new.user_id === state.currentUser?.id);
                
                if (state.currentChat?.id === chatId && payload.new.user_id !== state.currentUser?.id) {
                    await markChatMessagesAsRead(chatId);
                }
            }
        )
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
            async (payload) => {
                const messageDiv = document.querySelector(`.message[data-id="${payload.new.id}"]`);
                if (messageDiv) {
                    const textDiv = messageDiv.querySelector('.text');
                    if (textDiv) textDiv.textContent = payload.new.text;
                }
                
                const cached = store.getFromMessagesCache(chatId);
                if (cached) {
                    const idx = cached.findIndex(m => m.id === payload.new.id);
                    if (idx !== -1) {
                        cached[idx].text = payload.new.text;
                        cached[idx].is_read = payload.new.is_read;
                    }
                    store.addToMessagesCache(chatId, cached);
                }
                
                if (state.currentChat?.id !== chatId) {
                    updateDialogLastMessage(chatId, payload.new.text, false);
                }
            }
        )
        .on('postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
            (payload) => {
                const messageDiv = document.querySelector(`.message[data-id="${payload.old.id}"]`);
                if (messageDiv) messageDiv.remove();
                
                const cached = store.getFromMessagesCache(chatId);
                if (cached) {
                    const filtered = cached.filter(m => m.id !== payload.old.id);
                    store.addToMessagesCache(chatId, filtered);
                }
            }
        )
        .subscribe();
    
    store.setState({ realtimeChannel: channel });
}

// Импорты для функций, используемых в этом файле
import { renderMessage, markChatMessagesAsRead } from './messages.js';
import { showToast } from './utils.js';

// Настройка поиска
const searchInput = document.getElementById('search-dialogs');
if (searchInput) {
    const debouncedSearch = debounce((e) => {
        loadDialogs(e.target.value);
    }, 300);
    searchInput.oninput = debouncedSearch;
}
