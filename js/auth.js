import { store } from './store.js';
import { getEmail, showToast } from './utils.js';
import { uiManager } from './ui.js';
import { loadDialogs } from './dialogs.js';
import { ensureBotChat } from './chat.js';
import { startOnlineHeartbeat, updateLastSeen } from './realtime.js';

let supabase;

export function initAuth(supabaseClient) {
    supabase = supabaseClient;
    store.setSupabase(supabase);
    attachAuthEventListeners();
}

function attachAuthEventListeners() {
    // Регистрация
    const regBtn = document.getElementById('btn-do-reg');
    if (regBtn) {
        regBtn.onclick = handleRegister;
    }
    
    // Вход
    const loginBtn = document.getElementById('btn-do-login');
    if (loginBtn) {
        loginBtn.onclick = handleLogin;
    }
    
    // Переключение между формами
    const toLogin = document.getElementById('to-login');
    const toRegister = document.getElementById('to-register');
    if (toLogin) toLogin.onclick = () => uiManager.showScreen('login');
    if (toRegister) toRegister.onclick = () => uiManager.showScreen('reg');
}

async function handleRegister() {
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value.trim();
    const fullName = document.getElementById('reg-full-name').value.trim();
    
    if (!username || !password) {
        return showToast('Заполните все поля', true);
    }

    const { data, error } = await supabase.auth.signUp({ 
        email: getEmail(username), 
        password: password 
    });
    
    if (error) return showToast(error.message, true);

    if (data.user) {
        await supabase.from('profiles').upsert({
            id: data.user.id,
            username: username.replace(/^@/, ''),
            full_name: fullName || username,
            last_seen: new Date().toISOString()
        });
        showToast('Аккаунт создан! Войдите.');
        setTimeout(() => uiManager.showScreen('login'), 1000);
    }
}

async function handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    
    const { data, error } = await supabase.auth.signInWithPassword({ 
        email: getEmail(username), 
        password: password 
    });
    
    if (error) return showToast('Ошибка входа: ' + error.message, true);

    await initializeUserSession(data.user, username);
}

async function initializeUserSession(user, username) {
    store.setCurrentUser(user);
    
    // Загружаем профиль
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
    
    if (!profile) {
        const cleanUsername = username.replace(/^@/, '');
        const { data: newProfile } = await supabase
            .from('profiles')
            .insert({
                id: user.id,
                username: cleanUsername,
                full_name: cleanUsername,
                last_seen: new Date().toISOString()
            })
            .select()
            .maybeSingle();
        store.setCurrentProfile(newProfile);
    } else {
        store.setCurrentProfile(profile);
    }
    
    // Обновляем UI
    const badge = document.getElementById('current-user-badge');
    if (badge && store.getState().currentProfile) {
        badge.textContent = store.getState().currentProfile.full_name;
    }
    
    // Инициализируем чат
    await ensureBotChat(supabase, store);
    await loadDialogs(supabase, store);
    
    uiManager.showScreen('chat');
    uiManager.updateChatInterface(null);
    
    // Запускаем отслеживание активности
    document.addEventListener('click', () => updateLastSeen(supabase, store));
    document.addEventListener('keypress', () => updateLastSeen(supabase, store));
    setInterval(() => updateLastSeen(supabase, store), 30000);
    updateLastSeen(supabase, store);
    
    startOnlineHeartbeat(supabase, store);
}

export async function handleLogout() {
    const state = store.getState();
    
    // Останавливаем все подписки
    if (state.onlineInterval) clearInterval(state.onlineInterval);
    if (state.realtimeChannel) await supabase.removeChannel(state.realtimeChannel);
    if (state.statusSubscription) await supabase.removeChannel(state.statusSubscription);
    if (state.typingChannel) await supabase.removeChannel(state.typingChannel);
    
    // Очищаем кеш
    store.clearCache();
    
    await supabase.auth.signOut();
    
    // Сбрасываем состояние
    store.setCurrentUser(null);
    store.setCurrentProfile(null);
    store.setCurrentChat(null);
    
    uiManager.showScreen('reg');
}
