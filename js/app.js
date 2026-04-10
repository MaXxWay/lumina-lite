// app.js — точка входа

(async function init() {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { data: { session } } = await supabaseClient.auth.getSession();

    // Слушатель изменений авторизации
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user && !window.currentUser) {
            await handleSuccessfulLogin(session.user);
        }
    });

    if (!session) {
        if (typeof hideLoader === 'function') hideLoader();
        showScreen('reg');
        initAuth();
    } else {
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

        if (typeof initGroups === 'function') {
            await initGroups();
            console.log('Groups initialized after login');
        }
        
        if (typeof initMobileOptimizations === 'function') {
            initMobileOptimizations();
        }
        if (typeof initMobileGroupContextMenu === 'function') {
            initMobileGroupContextMenu();
        }
    }
})();
