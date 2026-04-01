(async function init() {
    // Ждем загрузки всех скриптов
    await new Promise(resolve => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', resolve);
        } else {
            resolve();
        }
    });
    
    // Небольшая задержка для уверенности
    await new Promise(resolve => setTimeout(resolve, 50));
    
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Проверяем и вызываем функции с задержкой
    const initFunctions = [
        'initAuth',
        'initProfileFooter', 
        'initEmojiPicker',
        'initMessageMenu',
        'initProfileScreen',
        'initSearchDialogs',
        'initSendButton',
        'initUserActivityTracking'
    ];
    
    for (const funcName of initFunctions) {
        if (typeof window[funcName] === 'function') {
            try {
                window[funcName]();
            } catch (err) {
                console.warn(`Ошибка при вызове ${funcName}:`, err);
            }
        } else {
            console.warn(`Функция ${funcName} не найдена`);
        }
    }
    
    // Инициализация мобильных оптимизаций
    if (typeof initMobileOptimizations === 'function') {
        try {
            initMobileOptimizations();
        } catch (err) {
            console.warn('Ошибка мобильных оптимизаций:', err);
        }
    }
    
    window.addEventListener('resize', updateDvh);
    updateDvh();
    
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
        updateDvh();
    });
    
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        if (typeof handleSuccessfulLogin === 'function') {
            await handleSuccessfulLogin(session.user);
        } else {
            console.error('handleSuccessfulLogin не определена');
        }
    } else {
        if (typeof showScreen === 'function') {
            showScreen('reg');
        } else {
            console.error('showScreen не определена');
        }
    }
})();
