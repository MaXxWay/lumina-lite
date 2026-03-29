import { _supabase, getEmail } from './config.js';

export const api = {
    async signIn(u, p) { return await _supabase.auth.signInWithPassword({ email: getEmail(u), password: p }); },
    
    async signUp(u, p, name) {
        const { data, error } = await _supabase.auth.signUp({ email: getEmail(u), password: p });
        if (error) return { error };
        return await _supabase.from('profiles').insert([{ id: data.user.id, username: u, full_name: name }]);
    },

    async fetchMessages(myId, otherId) {
        return await _supabase.from('messages').select('*')
            .or(`and(sender_id.eq.${myId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${myId})`)
            .order('created_at', { ascending: true });
    },

    async sendMessage(sId, rId, text) {
        return await _supabase.from('messages').insert([{ sender_id: sId, receiver_id: rId, text }]);
    },

    async updateProfile(id, updates) {
        return await _supabase.from('profiles').update(updates).eq('id', id);
    },

    async updateLastSeen(id) {
        if (!id) return;
        await _supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', id);
    }
};
