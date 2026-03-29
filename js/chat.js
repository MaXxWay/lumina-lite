import { store } from './store.js';
import { supabase } from './config.js';
import { uiManager } from './ui.js';
import { loadMessages, markChatMessagesAsRead } from './messages.js';
import { subscribeToMessages } from './dialogs.js';
import { subscribeToUserStatus, subscribeToTyping, setupTypingIndicator } from './realtime.js';
import { BOT_USER_ID, BOT_PROFILE } from './config.js';

export async function ensureBotChat() {
    const state = store.getState();
    
    try {
        const { data: existing } = await supabase
            .from('chats')
            .select('id')
            .eq('type', 'private')
            .contains('participants', [state.currentUser.id, BOT_USER_ID])
            .maybeSingle();
        
        if (existing) {
            const { data: welcomeMsg } = await supabase
                .from('messages')
                .select('id')
                .eq('chat_id', existing.id)
                .eq('is_welcome', true)
                .maybeSingle();
            
            if (!welcomeMsg) {
                await supabase.from('messages').insert({
                    text: 'Добро пожаловать в мессенджер Lumina Lite!\n\nЭто бот-помощник. Здесь можно:\n• Найти друзей по @username\n• Общаться в реальном времени\n• Настраивать профиль\n\nПриятного общения! 🚀',
                    user_id: BOT_USER_ID,
                    chat_id: existing.id,
                    is_welcome: true,
                    is_system: true,
                    is_read: false
                });
            }
            return;
        }
        
        const { data: newChat } = await supabase
            .from('chats')
            .insert({
                type: 'private',
                participants: [state.currentUser.id, BOT_USER_ID],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                is_bot_chat: true
            })
            .select()
            .single();
        
        if (newChat) {
            await supabase.from('messages').insert({
                text: 'Добро пожаловать в мессенджер Lumina Lite!\n\nЭто бот-помощник. Здесь можно:\n• Найти друзей по @username\n• Общаться в реальном времени\n• Настраивать профиль\n\nПриятного общения! 🚀',
                user_id: BOT_USER_ID,
                chat_id: newChat.id,
                is_welcome: true,
                is_system: true,
                is_read: false
            });
        }
    } catch (err) {
        console.error('Ошибка создания чата с ботом:', err);
    }
}

export async function getOrCreatePrivateChat(otherUserId) {
    const state = store.getState();
    
    try {
        if (otherUserId === BOT_USER_ID) {
            const { data: existing } = await supabase
                .from('chats')
                .select('id')
                .eq('type', 'private')
                .contains('participants', [state.currentUser.id, BOT_USER_ID])
                .maybeSingle();
            return existing?.id;
        }
        
        const { data: existing } = await supabase
            .from('chats')
            .select('id')
            .eq('type', 'private')
            .contains('participants', [state.currentUser.id, otherUserId])
            .maybeSingle();
        
        if (existing) return existing.id;
        
        const { data: newChat } = await supabase
            .from('chats')
            .insert({
                type: 'private',
                participants: [state.currentUser.id, otherUserId],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();
        
        return newChat.id;
    } catch (err) {
        console.error('Ошибка создания чата:', err);
        throw err;
    }
}

export async function openChat(chatId, otherUserId, otherUser) {
    const state = store.getState();
    
    if (state.isOpeningChat) {
        store.setState({ pendingChatId: chatId });
        return;
    }
    if (state.currentChat?.id === chatId) return;
    
    store.setState({ isOpeningChat: true });
    
    try {
        const isBot = otherUserId === BOT_USER_ID;
        
        uiManager.showLoadingMessages();
        
        const newChat = {
            id: chatId,
            type: 'private',
            other_user: otherUser || (isBot ? BOT_PROFILE : null)
        };
        
        store.setCurrentChat(newChat);
        uiManager.updateChatInterface(newChat);
        
        if (!isBot && otherUserId) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', otherUserId)
                .maybeSingle();
            
            if (profile) {
                updateChatStatus(profile);
                subscribeToUserStatus(otherUserId, updateChatStatus);
                subscribeToTyping(chatId, (isTyping) => {
                    const typingStatus = document.querySelector('.typing-status');
                    if (typingStatus) {
                        if (isTyping) {
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
                    }
                });
                setupTypingIndicator(chatId);
            }
        } else if (isBot) {
            const chatStatus = document.querySelector('.chat-status');
            if (chatStatus) {
                chatStatus.textContent = 'бот';
                chatStatus.className = 'chat-status status-bot';
            }
        }
        
        await loadMessages(chatId);
        await subscribeToMessages(chatId, supabase, store);
        
        uiManager.updateActiveDialog(chatId);
        await markChatMessagesAsRead(chatId);
        
    } finally {
        store.setState({ isOpeningChat: false });
        
        if (state.pendingChatId && state.pendingChatId !== chatId) {
            const pending = state.pendingChatId;
            store.setState({ pendingChatId: null });
            await openChat(pending, null, null);
        }
    }
}

function updateChatStatus(profile) {
    const chatStatus = document.querySelector('.chat-status');
    if (!chatStatus) return;
    
    const isBot = store.getState().currentChat?.other_user?.id === BOT_USER_ID;
    if (isBot) {
        chatStatus.textContent = 'бот';
        chatStatus.className = 'chat-status status-bot';
        return;
    }
    
    const isOnline = profile.is_online === true;
    if (isOnline) {
        chatStatus.textContent = 'онлайн';
        chatStatus.className = 'chat-status status-online';
    } else {
        chatStatus.textContent = 'офлайн';
        chatStatus.className = 'chat-status status-offline';
    }
}
