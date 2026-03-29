// Глобальное состояние приложения
import { BOT_PROFILE, BOT_USER_ID } from './config.js';

class Store {
    constructor() {
        this.state = {
            supabase: null,
            currentUser: null,
            currentProfile: null,
            currentChat: null,
            realtimeChannel: null,
            statusSubscription: null,
            typingChannel: null,
            allUsers: [],
            messagesCache: new Map(),
            dialogCache: new Map(),
            isUpdatingDialogs: false,
            isLoadingMessages: false,
            isOpeningChat: false,
            pendingChatId: null,
            isUserOnline: true,
            onlineInterval: null,
            lastActivityUpdate: 0,
            typingTimeout: null,
            isTyping: false
        };
        
        this.subscribers = new Set();
    }
    
    subscribe(callback) {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }
    
    setState(updates) {
        Object.assign(this.state, updates);
        this.subscribers.forEach(cb => cb(this.state));
    }
    
    getState() {
        return this.state;
    }
    
    // Специализированные методы
    setSupabase(supabase) {
        this.state.supabase = supabase;
    }
    
    setCurrentUser(user) {
        this.state.currentUser = user;
    }
    
    setCurrentProfile(profile) {
        this.state.currentProfile = profile;
    }
    
    setCurrentChat(chat) {
        this.state.currentChat = chat;
    }
    
    addToMessagesCache(chatId, messages) {
        this.state.messagesCache.set(chatId, messages);
    }
    
    getFromMessagesCache(chatId) {
        return this.state.messagesCache.get(chatId);
    }
    
    clearCache() {
        this.state.messagesCache.clear();
        this.state.dialogCache.clear();
    }
}

export const store = new Store();
