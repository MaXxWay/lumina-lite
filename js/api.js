// api.js
import { _supabase, getEmail, BOT_USER_ID } from './config.js';

export const api = {
    // --- Сессии ---
    async getSession() {
        return _supabase.auth.getSession();
    },
    async signUp(username, password, full_name) {
        const email = getEmail(username);
        const { data, error } = await _supabase.auth.signUp({
            email,
            password,
            options: { data: { username, full_name } }
        });
        return { data, error };
    },
    async signIn(username, password) {
        const email = getEmail(username);
        const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
        return { data, error };
    },
    async signOut() {
        return _supabase.auth.signOut();
    },

    // --- Профили ---
    async getProfile(user_id) {
        const { data, error } = await _supabase.from('profiles').select('*').eq('id', user_id).single();
        return { data, error };
    },
    async createProfile(user_id, username) {
        const { data, error } = await _supabase.from('profiles').insert([{ id: user_id, username }]).select().single();
        return { data, error };
    },
    async updateProfile(user_id, updates) {
        const { data, error } = await _supabase.from('profiles').update(updates).eq('id', user_id).select().single();
        return { data, error };
    },
    async getProfilesByIds(ids) {
        const { data, error } = await _supabase.from('profiles').select('*').in('id', ids);
        return data || [];
    },
    async loadAllUsers(currentUserId) {
        const { data, error } = await _supabase.from('profiles').select('id, username, full_name').neq('id', currentUserId);
        return data || [];
    },

    // --- Чаты ---
    async getChats(user_id) {
        const { data: chats, error } = await _supabase.rpc('get_chats', { user_id });
        return { data: chats, error };
    },
    async getOrCreateChat(user_id1, user_id2) {
        const { data: [chat], error } = await _supabase.rpc('get_or_create_chat', { user_id1, user_id2 });
        if (error && !chat) throw error;
        return chat.id;
    },

    // --- Сообщения ---
    async getMessages(chat_id) {
        const { data: messages, error } = await _supabase.from('messages')
            .select('*')
            .eq('chat_id', chat_id)
            .order('created_at', { ascending: true });
        return { data: messages || [], error };
    },
    async sendMessage(text, user_id, chat_id) {
        if (!text.trim()) throw new Error('Сообщение не может быть пустым');
        const { data: [msg], error } = await _supabase.from('messages').insert([{ text, user_id, chat_id }]).select().single();
        if (error) throw error;
        return { data: msg };
    },
    async editMessage(message_id, new_text) {
        if (!new_text.trim()) throw new Error('Сообщение не может быть пустым');
        const { data, error } = await _supabase.from('messages').update({ text: new_text }).eq('id', message_id).select();
        return { data, error };
    },
    async deleteMessage(message_id) {
        const { data, error } = await _supabase.from('messages').delete().eq('id', message_id);
        return { data, error };
    },

    // --- Статусы ---
    async updateOnlineStatus(user_id, is_online) {
        await _supabase.from('profiles').update({ is_online }).eq('id', user_id);
    },

    // --- Прочие ---
    async markAsRead(chat_id, user_id) {
        await _supabase.rpc('mark_as_read', { chat_id, user_id });
    },
    async updateChatTimestamp(chat_id, last_message_text) {
        await _supabase.from('chats').update({ updated_at: 'now()' }).eq('id', chat_id);
    },

    // --- Бот ---
    async ensureBotChat(user_id) {
        await this.getOrCreateChat(user_id, BOT_USER_ID);
    },
};
