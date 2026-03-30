// Конфигурация Supabase
const SUPABASE_URL = 'https://ofxvazqurjgnxxuozjlr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9meHZhenF1cmpnbnh4dW96amxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTg4ODEsImV4cCI6MjA5MDE5NDg4MX0.Zf2pwQNmxe9wBt7tlZed-ntnLPzm7JGOuqkLuBkv0GE';

const BOT_USER_ID = '00000000-0000-0000-0000-000000000000';
const SAVED_CHAT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

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

// Глобальные переменные
let supabaseClient = null;
let currentUser = null;
let currentProfile = null;
let currentChat = null;
let realtimeChannel = null;
let allUsers = [];
let messagesCache = new Map();
let observedMessages = new Set();
let readCheckTimeout = null;
let typingChannel = null;
let typingTimeout = null;
let isTyping = false;
let isLoadingMessages = false;
let isOpeningChat = false;
let pendingChatId = null;
let isUpdatingDialogs = false;
let dialogCache = new Map();
let onlineInterval = null;
let isUserOnline = true;
let lastActivityUpdate = 0;
let statusSubscription = null;

// Экспорт
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
window.BOT_USER_ID = BOT_USER_ID;
window.SAVED_CHAT_ID = SAVED_CHAT_ID;
window.BOT_PROFILE = BOT_PROFILE;
window.SAVED_CHAT = SAVED_CHAT;
