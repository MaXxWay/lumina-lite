// Конфигурация Supabase
export const SUPABASE_URL = 'https://ofxvazqurjgnxxuozjlr.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9meHZhenF1cmpnbnh4dW96amxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTg4ODEsImV4cCI6MjA5MDE5NDg4MX0.Zf2pwQNmxe9wBt7tlZed-ntnLPzm7JGOuqkLuBkv0GE';

// ID официального бота
export const BOT_USER_ID = '00000000-0000-0000-0000-000000000000';

export const BOT_PROFILE = {
    id: BOT_USER_ID,
    username: 'lumina_bot',
    full_name: 'Lumina Bot',
    bio: 'Официальный бот мессенджера Lumina Lite',
    is_bot: true
};

export const getEmail = (username) => `${username.toLowerCase().trim().replace(/^@/, '')}@lumina.local`;
