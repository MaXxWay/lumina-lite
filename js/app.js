(async function init() {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    initAuth();
    initProfileFooter();
    initEmojiPicker();
    initMessageMenu();
    initProfileScreen();
    initSearchDialogs();
    initSendButton();
    initUserActivityTracking();
    initMobileOptimizations();
    
    window.addEventListener('resize', updateDvh);
    updateDvh();
    
    let origH = window.innerHeight;
    window.addEventListener('resize', () => {
        const newH = window.innerHeight;
        if (newH < origH - 100) {
            setTimeout(() => { 
                const zone = document.querySelector('.input-zone'); 
                if (zone?.style.display !== 'none') {
                    document.getElementById('message-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }
        origH = newH;
        updateDvh();
    });
    
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        await handleSuccessfulLogin(session.user);
    } else {
        showScreen('reg');
    }
})();
