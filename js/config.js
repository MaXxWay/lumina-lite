// Конфигурация Supabase
const SUPABASE_URL = 'https://ofxvazqurjgnxxuozjlr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9meHZhenF1cmpnbnh4dW96amxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTg4ODEsImV4cCI6MjA5MDE5NDg4MX0.Zf2pwQNmxe9wBt7tlZed-ntnLPzm7JGOuqkLuBkv0GE';

// ID специальных чатов
const BOT_USER_ID = '00000000-0000-0000-0000-000000000000';
const SAVED_CHAT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// Профили специальных пользователей
const BOT_PROFILE = {
    id: BOT_USER_ID,
    username: 'lumina_bot',
    full_name: 'Lumina Bot',
    bio: 'Официальный бот мессенджера Lumina Lite',
    is_bot: true
};

const SAVED_CHAT = {
    id: SAVED_CHAT_ID,
    username: 'saved',
    full_name: 'Избранное',
    bio: 'Сохраненные сообщения',
    is_saved: true
};

// Глобальные переменные (без объявления supabase здесь)
let currentUser = null;
let currentProfile = null;
let currentChat = null;
let realtimeChannel = null;
let allUsers = [];
