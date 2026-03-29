// Главный файл приложения - точка входа
import { supabase } from './js/config.js';
import { store } from './js/store.js';
import { initAuth } from './js/auth.js';
import { initMessages } from './js/messages.js';
import { initProfile } from './js/profile.js';
import { initRealtime } from './js/realtime.js';
import { uiManager } from './js/ui.js';
import { loadDialogs } from './js/dialogs.js';
import { ensureBotChat } from './js/chat.js';
import { updateDvh } from './js/utils.js';

// Делаем supabase доступным глобально (для отладки)
window.supabase = supabase;

// Инициализация всех модулей
initAuth(supabase);
initRealtime(supabase);
initMessages();
initProfile();

// Обработчик изменения размера окна (адаптация под клавиатуру)
let originalHeight = window.innerHeight;

window.addEventListener('resize', () => {
    updateDvh();
    
    const newHeight = window.innerHeight;
    if (newHeight < originalHeight - 100) {
        setTimeout(() => {
            const inputZone = document.querySelector('.input-zone');
            if (inputZone && inputZone.style.display !== 'none') {
                const input = document.getElementById('message-input');
                if (input) input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }
    originalHeight = newHeight;
});

// Проверка существующей сессии при загрузке
(async () => {
    updateDvh();
    
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
        // Пользователь уже авторизован
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();
        
        if (profile) {
            store.setCurrentUser(session.user);
            store.setCurrentProfile(profile);
            
            uiManager.updateProfileFooter(profile);
            
            await ensureBotChat(supabase, store);
            await loadDialogs(supabase, store);
            
            uiManager.showScreen('chat');
            uiManager.updateChatInterface(null);
            
            // Обновляем бейдж с именем пользователя
            const badge = document.getElementById('current-user-badge');
            if (badge) badge.textContent = profile.full_name;
        } else {
            uiManager.showScreen('reg');
        }
    } else {
        // Нет активной сессии - показываем регистрацию
        uiManager.showScreen('reg');
    }
})();
