// app.js — точка входа (ИСПРАВЛЕННАЯ)

(async function init() {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { data: { session } } = await supabaseClient.auth.getSession();

    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user && !window.currentUser) {
            await handleSuccessfulLogin(session.user);
        }
        if (event === 'SIGNED_OUT') {
            window.currentUser = null;
            window.currentProfile = null;
            window.currentChat = null;
            window.groupsInitialized = false;
            showScreen('login');
            hideLoader();
        }
    });

    // Инициализация всех компонентов
    initAuth();
    initEmojiPicker();
    initImprovedMessageMenu();
    initProfileScreen();
    initSearchDialogs();
    initSendButton();
    initUserActivityTracking();
    if (typeof initSideMenu === 'function') initSideMenu();

    window.addEventListener('resize', updateDvh);
    updateDvh();

    // Если есть сессия, загружаем данные
    if (session) {
        await handleSuccessfulLogin(session.user);
    } else {
        hideLoader();
        showScreen('login');
    }
})();
