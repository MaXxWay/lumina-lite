import { store } from './store.js';
import { getUserStatusFromProfile, showToast } from './utils.js';
import { uiManager } from './ui.js';
import { renderMessage, markChatMessagesAsRead } from './messages.js';
import { updateDialogLastMessage } from './dialogs.js';

let supabase;

export function initRealtime(supabaseClient) {
    supabase = supabaseClient;
}

export async function startOnlineHeartbeat() {
    const state = store.getState();
    if (state.onlineInterval) clearInterval(state.onlineInterval);
    
    await setUserOnlineStatus(true);
    
    state.onlineInterval = setInterval(async () => {
        const currentState = store.getState();
        if (currentState.currentUser && currentState.isUserOnline) {
            await setUserOnlineStatus(true);
        }
    }, 30000);
    
    store.setState({ onlineInterval: state.onlineInterval });
}

export async function stopOnlineHeartbeat() {
    const state = store.getState();
    if (state.onlineInterval) {
        clearInterval(state.onlineInterval);
        store.setState({ onlineInterval: null });
    }
    if (store.getState().currentUser) {
        await setUserOnlineStatus(false);
    }
}

async function setUserOnlineStatus(isOnline) {
    const state = store.getState();
    if (!state.currentUser) return;
    
    store.setState({ isUserOnline: isOnline });
    try {
        await supabase
            .from('profiles')
            .update({ is_online: isOnline, last_seen: new Date().toISOString() })
            .eq('id', state.currentUser.id);
    } catch (err) {
        console.error('Ошибка обновления статуса:', err);
    }
}

export async function updateLastSeen() {
    const state = store.getState();
    if (!state.currentUser) return;
    
    const now = Date.now();
    if (now - state.lastActivityUpdate < 30000) return;
    
    store.setState({ lastActivityUpdate: now });
    
    try {
        await supabase
            .from('profiles')
            .update({ last_seen: new Date().toISOString() })
            .eq('id', state.currentUser.id);
    } catch (err) {}
}

export function subscribeToUserStatus(userId, onStatusUpdate) {
    const state = store.getState();
    
    if (state.statusSubscription) {
        supabase.removeChannel(state.statusSubscription);
    }
    
    const subscription = supabase
        .channel(`status-${userId}`)
        .on('postgres_changes', 
            { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
            async (payload) => {
                if (payload.new && onStatusUpdate) {
                    onStatusUpdate(payload.new);
                }
            }
        )
        .subscribe();
    
    store.setState({ statusSubscription: subscription });
}

export function subscribeToTyping(chatId, onTyping) {
    const state = store.getState();
    
    if (state.typingChannel) {
        supabase.removeChannel(state.typingChannel);
    }
    
    const channel = supabase
        .channel(`typing-${chatId}`)
        .on('broadcast', { event: 'typing' }, (payload) => {
            if (onTyping && payload.payload.userId !== state.currentUser?.id) {
                onTyping(payload.payload.isTyping);
            }
        })
        .subscribe();
    
    store.setState({ typingChannel: channel });
    return channel;
}

export async function sendTypingStatus(chatId, isTypingNow) {
    const state = store.getState();
    if (!state.typingChannel) return;
    
    try {
        await state.typingChannel.send({
            type: 'broadcast',
            event: 'typing',
            payload: { isTyping: isTypingNow, userId: state.currentUser.id }
        });
    } catch (err) {
        console.error('Ошибка отправки статуса печатания:', err);
    }
}

export function setupTypingIndicator(chatId) {
    const messageInput = document.getElementById('message-input');
    if (!messageInput) return;
    
    let typingTimeout = null;
    let isTyping = false;
    
    const sendTyping = (isTypingNow) => {
        sendTypingStatus(chatId, isTypingNow);
    };
    
    messageInput.addEventListener('input', () => {
        if (typingTimeout) clearTimeout(typingTimeout);
        
        if (!isTyping) {
            isTyping = true;
            sendTyping(true);
        }
        
        typingTimeout = setTimeout(() => {
            isTyping = false;
            sendTyping(false);
        }, 1000);
    });
}

// Обработка видимости страницы
document.addEventListener('visibilitychange', () => {
    const state = store.getState();
    if (!state.currentUser) return;
    
    if (document.hidden) {
        setUserOnlineStatus(false);
    } else {
        setUserOnlineStatus(true);
    }
});

window.addEventListener('beforeunload', () => {
    setUserOnlineStatus(false);
});
