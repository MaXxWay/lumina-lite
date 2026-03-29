import { _supabase, BOT_USER_ID, BOT_PROFILE } from './config.js';
import * as api from './api.js';
import * as ui from './ui.js';

// ПЕРЕМЕННЫЕ СОСТОЯНИЯ
let currentUser = null;
let currentChat = null;
let allUsers = [];

// ВНИМАНИЕ: Если ниже в этом файле (main.js) есть строка 
// const _supabase = ... или const SUPABASE_URL = ... 
// УДАЛИ ЕЁ! Она уже импортирована сверху.

async function initApp() {
    const { data: { user } } = await _supabase.auth.getUser();
    if (user) {
        currentUser = user;
        const { data: profiles } = await _supabase.from('profiles').select('*');
        allUsers = profiles || [];
        ui.showScreen('chat');
        initRealtime();
        loadDialogs();
    } else {
        ui.showScreen('login');
    }
}

// ... остальной код (initRealtime, loadDialogs и т.д.)
// Вызови в конце:
initApp();
