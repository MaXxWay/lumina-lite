export const SUPABASE_URL = 'https://ofxvazqurjgnxxuozjlr.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9meHZhenF1cmpnbnh4dW96amxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTg4ODEsImV4cCI6MjA5MDE5NDg4MX0.Zf2pwQNmxe9wBt7tlZed-ntnLPzm7JGOuqkLuBkv0GE';

export const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const BOT_USER_ID = '00000000-0000-0000-0000-000000000000';
export const SAVED_MESSAGES_ID = '00000000-0000-0000-0000-111111111111';

export const BOT_PROFILE = {
    id: BOT_USER_ID,
    username: 'lumina_bot',
    full_name: 'Lumina Bot',
    bio: 'Официальный бот мессенджера Lumina Lite',
    is_bot: true
};

export const SAVED_PROFILE = {
    id: SAVED_MESSAGES_ID,
    username: 'saved',
    full_name: 'Избранное',
    bio: 'Ваши сохранённые сообщения',
    is_saved: true
};

export const getEmail = (u) => `${u.toLowerCase().trim()}@lumina.local`;
