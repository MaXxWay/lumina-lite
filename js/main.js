import { _supabase, BOT_USER_ID, BOT_PROFILE } from './config.js';
import * as api from './api.js';
import * as ui from './ui.js';

let currentUser = null;
let currentChat = null;
let allUsers = [];

// Realtime подписка
function initRealtime() {
    _supabase
        .channel('messages-main')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            const msg = payload.new;
            if (currentChat === msg.sender_id || (currentChat === msg.receiver_id && msg.sender_id === currentUser.id)) {
                ui.appendMessage(msg, currentUser.id);
                if (msg.receiver_id === currentUser.id) api.markAsRead(currentUser.id, msg.sender_id);
            }
            loadDialogs();
        })
        .subscribe();
}

async function loadDialogs() {
    const { data: msgs } = await _supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .order('created_at', { ascending: false });

    const lastMsgs = new Map();
    const unreadCounts = new Map();

    msgs?.forEach(m => {
        const otherId = m.sender_id === currentUser.id ? m.receiver_id : m.sender_id;
        if (!lastMsgs.has(otherId)) lastMsgs.set(otherId, m);
        if (m.receiver_id === currentUser.id && !m.is_read) {
            unreadCounts.set(otherId, (unreadCounts.get(otherId) || 0) + 1);
        }
    });

    const list = document.getElementById('dialogs-list');
    list.innerHTML = '';
    lastMsgs.forEach((m, uid) => {
        const profile = allUsers.find(u => u.id === uid) || (uid === BOT_USER_ID ? BOT_PROFILE : null);
        if (!profile) return;
        
        const div = document.createElement('div');
        div.className = `dialog-item ${currentChat === uid ? 'active' : ''}`;
        div.onclick = () => selectChat(uid);
        const unread = unreadCounts.get(uid) || 0;
        div.innerHTML = `
            <div class="dialog-info">
                <span class="dialog-name">${profile.full_name}</span>
                <span class="dialog-last">${m.text.slice(0, 20)}</span>
                ${unread > 0 ? `<span class="unread-badge">${unread}</span>` : ''}
            </div>
        `;
        list.appendChild(div);
    });
}

async function selectChat(userId) {
    currentChat = userId;
    const profile = allUsers.find(u => u.id === userId) || (userId === BOT_USER_ID ? BOT_PROFILE : null);
    ui.updateChatHeader(profile);
    
    await api.markAsRead(currentUser.id, userId);
    loadDialogs();

    const { data: msgs } = await api.fetchMessages(currentUser.id, userId);
    const container = document.getElementById('messages');
    container.innerHTML = '';
    msgs?.forEach(m => ui.appendMessage(m, currentUser.id));
}

async function handleSendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (text && currentChat) {
        await api.sendMessage(currentUser.id, currentChat, text);
        input.value = '';
    }
}

async function initApp() {
    const { data: { user } } = await _supabase.auth.getUser();
    if (user) {
        currentUser = user;
        const { data: users } = await _supabase.from('profiles').select('*');
        allUsers = users || [];
        ui.showScreen('chat');
        loadDialogs();
        initRealtime();
    } else {
        ui.showScreen('login');
    }
}

// Привязка событий
document.getElementById('btn-login')?.addEventListener('click', async () => {
    const u = document.getElementById('login-username').value;
    const p = document.getElementById('login-password').value;
    const { data, error } = await api.signIn(u, p);
    if (!error) initApp();
});

document.getElementById('btn-send')?.addEventListener('click', handleSendMessage);

initApp();import { _supabase, BOT_USER_ID, BOT_PROFILE } from './config.js';
import * as api from './api.js';
import * as ui from './ui.js';

let currentUser = null;
let currentChat = null;
let allUsers = [];

// Realtime подписка
function initRealtime() {
    _supabase
        .channel('messages-main')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            const msg = payload.new;
            if (currentChat === msg.sender_id || (currentChat === msg.receiver_id && msg.sender_id === currentUser.id)) {
                ui.appendMessage(msg, currentUser.id);
                if (msg.receiver_id === currentUser.id) api.markAsRead(currentUser.id, msg.sender_id);
            }
            loadDialogs();
        })
        .subscribe();
}

async function loadDialogs() {
    const { data: msgs } = await _supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .order('created_at', { ascending: false });

    const lastMsgs = new Map();
    const unreadCounts = new Map();

    msgs?.forEach(m => {
        const otherId = m.sender_id === currentUser.id ? m.receiver_id : m.sender_id;
        if (!lastMsgs.has(otherId)) lastMsgs.set(otherId, m);
        if (m.receiver_id === currentUser.id && !m.is_read) {
            unreadCounts.set(otherId, (unreadCounts.get(otherId) || 0) + 1);
        }
    });

    const list = document.getElementById('dialogs-list');
    list.innerHTML = '';
    lastMsgs.forEach((m, uid) => {
        const profile = allUsers.find(u => u.id === uid) || (uid === BOT_USER_ID ? BOT_PROFILE : null);
        if (!profile) return;
        
        const div = document.createElement('div');
        div.className = `dialog-item ${currentChat === uid ? 'active' : ''}`;
        div.onclick = () => selectChat(uid);
        const unread = unreadCounts.get(uid) || 0;
        div.innerHTML = `
            <div class="dialog-info">
                <span class="dialog-name">${profile.full_name}</span>
                <span class="dialog-last">${m.text.slice(0, 20)}</span>
                ${unread > 0 ? `<span class="unread-badge">${unread}</span>` : ''}
            </div>
        `;
        list.appendChild(div);
    });
}

async function selectChat(userId) {
    currentChat = userId;
    const profile = allUsers.find(u => u.id === userId) || (userId === BOT_USER_ID ? BOT_PROFILE : null);
    ui.updateChatHeader(profile);
    
    await api.markAsRead(currentUser.id, userId);
    loadDialogs();

    const { data: msgs } = await api.fetchMessages(currentUser.id, userId);
    const container = document.getElementById('messages');
    container.innerHTML = '';
    msgs?.forEach(m => ui.appendMessage(m, currentUser.id));
}

async function handleSendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (text && currentChat) {
        await api.sendMessage(currentUser.id, currentChat, text);
        input.value = '';
    }
}

async function initApp() {
    const { data: { user } } = await _supabase.auth.getUser();
    if (user) {
        currentUser = user;
        const { data: users } = await _supabase.from('profiles').select('*');
        allUsers = users || [];
        ui.showScreen('chat');
        loadDialogs();
        initRealtime();
    } else {
        ui.showScreen('login');
    }
}

// Привязка событий
document.getElementById('btn-login')?.addEventListener('click', async () => {
    const u = document.getElementById('login-username').value;
    const p = document.getElementById('login-password').value;
    const { data, error } = await api.signIn(u, p);
    if (!error) initApp();
});

document.getElementById('btn-send')?.addEventListener('click', handleSendMessage);

initApp();
