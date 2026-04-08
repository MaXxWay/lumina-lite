// app.js — точка входа

(async function init() {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Если нет сессии — скрываем загрузчик и показываем регистрацию
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        if (typeof hideLoader === 'function') hideLoader();
        showScreen('reg');
    } else {
        // Инициализируем UI пока проверяем сессию
        initAuth();
        initProfileFooter();
        initEmojiPicker();
        initImprovedMessageMenu();
        initProfileScreen();
        initSearchDialogs();
        initSendButton();
        initUserActivityTracking();

        if (typeof initMobileOptimizations === 'function') initMobileOptimizations();

        window.addEventListener('resize', updateDvh);
        updateDvh();

        await handleSuccessfulLogin(session.user);

        if (typeof initGroups === 'function') await initGroups();
    }

    // Для случая когда сессии нет — всё равно инициализируем обработчики форм
    if (!session) {
        initAuth();
    }
})();
