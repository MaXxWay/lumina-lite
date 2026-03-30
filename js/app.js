// Главный файл инициализации
let supabaseClient = null;

(async function init() {
    // Инициализация Supabase
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.supabase = supabaseClient;
    
    // Инициализация всех модулей
    initAuth();
    initProfileFooter();
    initEmojiPicker();
    initMessageMenu();
    initProfileScreen();
    initSearchDialogs();
    initSendButton();
    initUserActivityTracking();
    
    // DVH фикс
    window.addEventListener('resize', updateDvh);
    updateDvh();
    
    let originalHeight = window.innerHeight;
    window.addEventListener('resize', () => {
        const newHeight = window.innerHeight;
        if (newHeight < originalHeight - 100) {
            setTimeout(() => {
                const inputZone = document.querySelector('.input-zone');
                if (inputZone && inputZone.style.display !== 'none') {
                    const input = document.getElementById('message-input');
                    if (input) input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }
        originalHeight = newHeight;
        updateDvh();
    });
    
    // Проверка существующей сессии
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session) {
        await handleSuccessfulLogin(session.user);
    } else {
        showScreen('reg');
    }
})();
