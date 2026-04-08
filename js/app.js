// app.js — точка входа

(async function init() {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        if (typeof hideLoader === 'function') hideLoader();
        showScreen('reg');
        initAuth();
    } else {
        // Сначала инициализируем базовый UI
        initAuth();
        initProfileFooter();
        initEmojiPicker();
        initImprovedMessageMenu();
        initProfileScreen();
        initSearchDialogs();
        initSendButton();
        initUserActivityTracking();

        window.addEventListener('resize', updateDvh);
        updateDvh();

        await handleSuccessfulLogin(session.user);

        // Инициализируем группы ПОСЛЕ загрузки пользователя
        if (typeof initGroups === 'function') {
            await initGroups();
            console.log('Groups initialized after login');
        }
        
        // Инициализируем мобильные оптимизации ПОСЛЕ загрузки всего
        if (typeof initMobileOptimizations === 'function') {
            initMobileOptimizations();
        }
        if (typeof initMobileGroupContextMenu === 'function') {
            initMobileGroupContextMenu();
        }
    }
})();
