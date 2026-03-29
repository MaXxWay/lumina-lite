import { _supabase, BOT_USER_ID, BOT_PROFILE, SAVED_MESSAGES_ID } from './config.js';
import { api } from './api.js';
import { ui } from './ui.js';

let currentUser = null;
let currentChat = null;
let allUsers = [];

async function initApp() {
    const { data: { user } } = await _supabase.auth.getUser();
    if (user) {
        currentUser = user;
        const { data: profiles } = await _supabase.from('profiles').select('*');
        allUsers = profiles || [];
        
        const myProf = allUsers.find(u => u.id === user.id);
        if (myProf) document.getElementById('current-user-badge').textContent = myProf.full_name;

        ui.showScreen('chat');
        initRealtime();
        loadDialogs();
        
        setInterval(() => api.updateLastSeen(user.id), 30000);
    } else {
        ui.showScreen('login');
    }
}

function initRealtime() {
    _supabase.channel('global').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new;
        if (currentChat === m.sender_id || (currentChat === m.receiver_id && m.sender_id === currentUser.id)) {
            ui.appendMessage(m, currentUser.id);
        }
        loadDialogs();
    }).subscribe();
}

async function loadDialogs() {
    const { data: msgs } = await _supabase.from('messages').select('*')
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .order('created_at', { ascending: false });

    const list = document.getElementById('dialogs-list');
    list.innerHTML = '';
    
    const lastMsgs = new Map();
    msgs?.forEach(m => {
        const otherId = m.sender_id === currentUser.id ? m.receiver_id : m.sender_id;
        if (!lastMsgs.has(otherId)) lastMsgs.set(otherId, m);
    });

    lastMsgs.forEach((m, uid) => {
        const prof = allUsers.find(u => u.id === uid) || (uid === BOT_USER_ID ? BOT_PROFILE : {full_name: 'Избранное'});
        const div = document.createElement('div');
        div.className = `dialog-item ${currentChat === uid ? 'active' : ''}`;
        div.innerHTML = `<div class="dialog-info"><b>${prof.full_name}</b><br><small>${m.text.slice(0,25)}</small></div>`;
        div.onclick = () => selectChat(uid, prof.full_name);
        list.appendChild(div);
    });
}

async function selectChat(id, name) {
    currentChat = id;
    document.getElementById('chat-title').textContent = name;
    document.querySelector('.input-zone').style.display = 'flex';
    const { data: msgs } = await api.fetchMessages(currentUser.id, id);
    document.getElementById('messages').innerHTML = '';
    msgs?.forEach(m => ui.appendMessage(m, currentUser.id));
}

// КНОПКИ
document.getElementById('btn-send')?.addEventListener('click', async () => {
    const inp = document.getElementById('message-input');
    if (inp.value && currentChat) {
        await api.sendMessage(currentUser.id, currentChat, inp.value);
        inp.value = '';
    }
});

document.getElementById('btn-login')?.addEventListener('click', async () => {
    const u = document.getElementById('login-username').value;
    const p = document.getElementById('login-password').value;
    const { error } = await api.signIn(u, p);
    if (!error) initApp(); else alert("Ошибка входа");
});

document.getElementById('btn-go-to-register')?.addEventListener('click', () => ui.showScreen('register'));
document.getElementById('btn-go-to-login')?.addEventListener('click', () => ui.showScreen('login'));

initApp();
