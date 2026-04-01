// app.js - главный файл инициализации с проверкой функций

(async function init() {
    console.log('🚀 Инициализация приложения...');
    
    // Инициализация Supabase
    if (typeof supabase === 'undefined') {
        console.error('❌ Supabase не загружен!');
        return;
    }
    
    window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Функции для инициализации с проверкой
    const initFunctions = [
        { name: 'initAuth', fn: initAuth },
        { name: 'initProfileFooter', fn: initProfileFooter },
        { name: 'initEmojiPicker', fn: initEmojiPicker },
        { name: 'initMessageMenu', fn: initMessageMenu },
        { name: 'initProfileScreen', fn: initProfileScreen },
        { name: 'initSearchDialogs', fn: initSearchDialogs },
        { name: 'initSendButton', fn: initSendButton },
        { name: 'initUserActivityTracking', fn: initUserActivityTracking }
    ];
    
    // Вызываем функции инициализации
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
    
    // Инициализация мобильных оптимизаций
    if (typeof initMobileOptimizations === 'function') {
        try {
            initMobileOptimizations();
            console.log('✅ mobileOptimizations инициализирован');
        } catch (err) {
            console.warn('⚠️ Ошибка mobileOptimizations:', err);
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
                    document.getElementById('message-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }
        origH = newH;
        if (typeof updateDvh === 'function') updateDvh();
    });
    
    // Проверка сессии
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (session) {
        if (typeof handleSuccessfulLogin === 'function') {
            await handleSuccessfulLogin(session.user);
            console.log('✅ Пользователь авторизован');
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
})();
