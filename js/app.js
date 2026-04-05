(async function init() {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Инициализация модальных окон (до других инициализаций)
    if (typeof modal !== 'undefined') {
        console.log('Modal system initialized');
    }
    
    initAuth();
    initProfileFooter();
    initEmojiPicker();
    initImprovedMessageMenu(); // Используем улучшенную версию
    initProfileScreen();
    initSearchDialogs();
    initSendButton();
    initUserActivityTracking();
    
    // Инициализация мобильных оптимизаций
    if (typeof initMobileOptimizations === 'function') {
        initMobileOptimizations();
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
        await handleSuccessfulLogin(session.user);
    } else {
        showScreen('reg');
    }
})();
