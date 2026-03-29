import { _supabase, BOT_USER_ID, BOT_PROFILE, getEmail } from './config.js';

export const api = {
    // ─── Auth ───────────────────────────────────────────
    async signIn(username, password) {
        return await _supabase.auth.signInWithPassword({ email: getEmail(username), password });
    },

    async signUp(username, password, fullName) {
        const { data, error } = await _supabase.auth.signUp({ email: getEmail(username), password });
        if (error) return { error };
        if (data.user) {
            await _supabase.from('profiles').upsert({
                id: data.user.id,
                username: username.replace(/^@/, ''),
                full_name: fullName || username,
                last_seen: new Date().toISOString()
            });
        }
        return { data, error: null };
    },

    async signOut() {
        return await _supabase.auth.signOut();
    },

    async getSession() {
        return await _supabase.auth.getSession();
    },

    // ─── Profiles ───────────────────────────────────────
    async getProfile(userId) {
        return await _supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    },

    async createProfile(userId, username) {
        return await _supabase.from('profiles').insert({
            id: userId,
            username,
            full_name: username,
            last_seen: new Date().toISOString()
        }).select().maybeSingle();
    },

    async updateProfile(userId, updates) {
        return await _supabase.from('profiles').update(updates).eq('id', userId);
    },

    async updateOnlineStatus(userId, isOnline) {
        return await _supabase.from('profiles').update({
            is_online: isOnline,
            last_seen: new Date().toISOString()
        }).eq('id', userId);
    },

    async loadAllUsers(excludeId) {
        const { data, error } = await _supabase
            .from('profiles')
            .select('id, username, full_name')
            .neq('id', excludeId);
        return error ? [] : (data || []);
    },

    async searchUsers(query, excludeId) {
        let clean = query.startsWith('@') ? query.substring(1) : query;
        const { data } = await _supabase
            .from('profiles')
            .select('id, username, full_name')
            .ilike('username', `%${clean}%`)
            .neq('id', excludeId)
            .limit(10);
        return data || [];
    },

    async getProfilesByIds(ids) {
        if (!ids.length) return [];
        const { data } = await _supabase
            .from('profiles')
            .select('id, full_name, username, last_seen, is_online')
            .in('id', ids);
        return data || [];
    },

    // ─── Chats ──────────────────────────────────────────
    async getChats(userId) {
        return await _supabase
            .from('chats')
            .select('*')
            .contains('participants', [userId])
            .order('updated_at', { ascending: false });
    },

    async getOrCreateChat(userId, otherUserId) {
        const { data: existing } = await _supabase
            .from('chats')
            .select('id')
            .eq('type', 'private')
            .contains('participants', [userId, otherUserId])
            .maybeSingle();
        if (existing) return existing.id;

        const { data: newChat } = await _supabase
            .from('chats')
            .insert({
                type: 'private',
                participants: [userId, otherUserId],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();
        return newChat.id;
    },

    async updateChatTimestamp(chatId, lastMessage) {
        return await _supabase.from('chats').update({
            updated_at: new Date().toISOString(),
            last_message: lastMessage.slice(0, 50)
        }).eq('id', chatId);
    },

    async ensureBotChat(userId) {
        const { data: existing } = await _supabase
            .from('chats')
            .select('id')
            .eq('type', 'private')
            .contains('participants', [userId, BOT_USER_ID])
            .maybeSingle();

        let chatId;
        if (existing) {
            chatId = existing.id;
        } else {
            const { data: newChat } = await _supabase
                .from('chats')
                .insert({
                    type: 'private',
                    participants: [userId, BOT_USER_ID],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    is_bot_chat: true
                })
                .select()
                .single();
            chatId = newChat?.id;
        }

        if (!chatId) return;

        // Приветственное сообщение
        const { data: welcomeMsg } = await _supabase
            .from('messages')
            .select('id')
            .eq('chat_id', chatId)
            .eq('is_welcome', true)
            .maybeSingle();

        if (!welcomeMsg) {
            await _supabase.from('messages').insert({
                text: 'Добро пожаловать в Lumina Lite!\n\nЗдесь можно:\n• Найти друзей по @username\n• Общаться в реальном времени\n• Настраивать профиль\n\nПриятного общения! 🚀',
                user_id: BOT_USER_ID,
                chat_id: chatId,
                is_welcome: true,
                is_system: true,
                is_read: false
            });
        }
    },

    // ─── Messages ───────────────────────────────────────
    async getMessages(chatId) {
        return await _supabase
            .from('messages')
            .select('*')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: true })
            .limit(200);
    },

    async sendMessage(text, userId, chatId) {
        return await _supabase
            .from('messages')
            .insert([{ text, user_id: userId, chat_id: chatId, is_read: false, created_at: new Date().toISOString() }])
            .select()
            .single();
    },

    async editMessage(messageId, newText) {
        return await _supabase
            .from('messages')
            .update({ text: newText.trim(), is_edited: true })
            .eq('id', messageId);
    },

    async deleteMessage(messageId) {
        return await _supabase.from('messages').delete().eq('id', messageId);
    },

    async getUnreadCount(chatId, userId) {
        const { count } = await _supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('chat_id', chatId)
            .eq('is_read', false)
            .neq('user_id', userId);
        return count || 0;
    },

    async getLastMessage(chatId, userId) {
        const { data } = await _supabase
            .from('messages')
            .select('text, user_id')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (!data) return null;
        const prefix = data.user_id === userId ? 'Вы: ' : '';
        const text = data.text.length > 50 ? data.text.slice(0, 47) + '...' : data.text;
        return prefix + text;
    },

    async markAsRead(chatId, userId) {
        return await _supabase
            .from('messages')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('chat_id', chatId)
            .neq('user_id', userId)
            .eq('is_read', false);
    }
};
