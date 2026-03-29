import { _supabase, getEmail } from './config.js';

export async function signIn(username, password) {
    const email = getEmail(username);
    return await _supabase.auth.signInWithPassword({ email, password });
}

export async function fetchMessages(myId, userId) {
    return await _supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${myId},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${myId})`)
        .order('created_at', { ascending: true });
}

export async function sendMessage(senderId, receiverId, text) {
    return await _supabase.from('messages').insert([{
        sender_id: senderId,
        receiver_id: receiverId,
        text: text
    }]);
}

export async function markAsRead(myId, senderId) {
    return await _supabase
        .from('messages')
        .update({ is_read: true })
        .eq('receiver_id', myId)
        .eq('sender_id', senderId)
        .eq('is_read', false);
}

export async function updateLastSeen(userId) {
    return await _supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', userId);
}
