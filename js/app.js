// app.js - исправленный главный файл инициализации

(async function init() {
    console.log('🚀 Инициализация приложения...');
    
    if (typeof supabase === 'undefined') {
        console.error('❌ Supabase не загружен!');
        return;
    }
    
    // Инициализируем supabaseClient ГЛОБАЛЬНО
    window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Также создаем глобальную переменную supabaseClient для доступа из других файлов
    // Это важно, так как в auth.js используется просто supabaseClient
    window.supabaseClient = window.supabaseClient;
    
    // Ждем немного, чтобы supabaseClient точно был доступен
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Проверяем, что supabaseClient доступен
    if (!window.supabaseClient) {
        console.error('❌ supabaseClient не инициализирован!');
        return;
    }
    
    console.log('✅ supabaseClient инициализирован');
    
    // Функции для инициализации с проверкой
    const initFunctions = [
        { name: 'initAuth', fn: initAuth },
        { name: 'initProfileFooter', fn: initProfileFooter },
        { name: 'initProfileScreen', fn: initProfileScreen },
        { name: 'initEmojiPicker', fn: initEmojiPicker },
        { name: 'initMessageMenu', fn: initMessageMenu },
        { name: 'initSearchDialogs', fn: initSearchDialogs },
        { name: 'initSendButton', fn: initSendButton },
        { name: 'initUserActivityTracking', fn: initUserActivityTracking }
    ];
    
    for (const item of initFunctions) {
        if (typeof item.fn === 'function') {
            try {
                item.fn();
                console.log(`✅ ${item.name} инициализирован`);
            } catch (err) {
                console.warn(`⚠️ Ошибка в ${item.name}:`, err);
            }
        } else {
            console.warn(`⚠️ Функция ${item.name} не найдена`);
        }
    }
    
    // Инициализация мобильных оптимизаций (только после загрузки всех функций)
    setTimeout(() => {
        if (typeof initMobileOptimizations === 'function') {
            try {
                initMobileOptimizations();
                console.log('✅ mobileOptimizations инициализирован');
            } catch (err) {
                console.warn('⚠️ Ошибка mobileOptimizations:', err);
            }
        }
        
        if (typeof patchOpenChat === 'function') {
            try {
                patchOpenChat();
            } catch (err) {
                console.warn('⚠️ Ошибка patchOpenChat:', err);
            }
        }
    }, 500);
    
    if (typeof updateDvh === 'function') {
        window.addEventListener('resize', updateDvh);
        updateDvh();
    }
    
    let origH = window.innerHeight;
    window.addEventListener('resize', () => {
        const newH = window.innerHeight;
        if (newH < origH - 100) {
            setTimeout(() => { 
                const zone = document.querySelector('.input-zone'); 
                const chatArea = document.querySelector('.glass-chat-area');
                if (zone && chatArea && chatArea.classList.contains('chat-open')) {
                    document.getElementById('message-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }
        origH = newH;
        if (typeof updateDvh === 'function') updateDvh();
    });
    
    // Проверка сессии с задержкой, чтобы все инициализировалось
    setTimeout(async () => {
        try {
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            if (session) {
                if (typeof handleSuccessfulLogin === 'function') {
                    await handleSuccessfulLogin(session.user);
                    console.log('✅ Пользователь авторизован');
                } else {
                    console.error('❌ handleSuccessfulLogin не определена');
                    if (typeof showScreen === 'function') {
                        showScreen('reg');
                    }
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
            console.error('Ошибка при проверке сессии:', err);
            if (typeof showScreen === 'function') {
                showScreen('reg');
            }
        }
    }, 200);
})();
