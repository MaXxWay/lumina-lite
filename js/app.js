// app.js - главный файл инициализации

(async function init() {
    console.log('🚀 Инициализация приложения...');
    
    // Инициализация Supabase
    if (typeof supabase === 'undefined') {
        console.error('❌ Supabase не загружен!');
        return;
    }
    
    // Создаем глобальный клиент Supabase
    window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    // Также создаем локальную переменную для совместимости с другими файлами
    window.supabase = window.supabaseClient;
    
    // Ждем небольшую задержку для уверенности
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Инициализация всех компонентов с проверкой
    const initComponents = [
        { name: 'initAuth', fn: initAuth },
        { name: 'initProfileFooter', fn: initProfileFooter },
        { name: 'initEmojiPicker', fn: initEmojiPicker },
        { name: 'initMessageMenu', fn: initMessageMenu },
        { name: 'initProfileScreen', fn: initProfileScreen },
        { name: 'initSearchDialogs', fn: initSearchDialogs },
        { name: 'initSendButton', fn: initSendButton },
        { name: 'initUserActivityTracking', fn: initUserActivityTracking }
    ];
    
    for (const component of initComponents) {
        if (typeof component.fn === 'function') {
            try {
                component.fn();
                console.log(`✅ ${component.name} инициализирован`);
            } catch (err) {
                console.warn(`⚠️ Ошибка в ${component.name}:`, err.message);
            }
        } else {
            console.warn(`⚠️ Функция ${component.name} не найдена`);
        }
    }
    
    // Инициализация мобильных оптимизаций
    if (typeof initMobileOptimizations === 'function') {
        try {
            initMobileOptimizations();
            console.log('✅ mobileOptimizations инициализирован');
        } catch (err) {
            console.warn('⚠️ Ошибка mobileOptimizations:', err.message);
        }
    }
    
    // Обновление высоты окна
    if (typeof updateDvh === 'function') {
        window.addEventListener('resize', updateDvh);
        updateDvh();
    }
    
    // Обработка изменения высоты для клавиатуры
    let origH = window.innerHeight;
    window.addEventListener('resize', () => {
        const newH = window.innerHeight;
        if (newH < origH - 100) {
            setTimeout(() => { 
                const zone = document.querySelector('.input-zone'); 
                const chatArea = document.querySelector('.glass-chat-area');
                if (zone && chatArea && chatArea.classList.contains('chat-open')) {
                    const input = document.getElementById('message-input');
                    if (input) input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }
        origH = newH;
        if (typeof updateDvh === 'function') updateDvh();
    });
    
    // Проверка сессии и авторизация
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (session) {
            if (typeof handleSuccessfulLogin === 'function') {
                await handleSuccessfulLogin(session.user);
                console.log('✅ Пользователь авторизован:', session.user.email);
            } else {
                console.error('❌ handleSuccessfulLogin не определена');
            }
        } else {
            if (typeof showScreen === 'function') {
                showScreen('reg');
                console.log('📱 Показан экран регистрации');
            } else {
                console.error('❌ showScreen не определена');
            }
        }
    } catch (err) {
        console.error('❌ Ошибка при проверке сессии:', err);
        if (typeof showScreen === 'function') showScreen('reg');
    }
})();
