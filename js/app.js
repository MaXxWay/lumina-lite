// app.js

(async function init() {
    if (typeof supabase === 'undefined') return;
    
    window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (!window.supabaseClient) return;
    
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
            try { item.fn(); } catch (err) { console.warn(item.name, err); }
        }
    }
    
    setTimeout(() => {
        if (typeof initMobileOptimizations === 'function') {
            try { initMobileOptimizations(); } catch (err) {}
        }
        if (typeof patchOpenChat === 'function') {
            try { patchOpenChat(); } catch (err) {}
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
    
    setTimeout(async () => {
        try {
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            if (session && typeof handleSuccessfulLogin === 'function') {
                await handleSuccessfulLogin(session.user);
            } else if (typeof showScreen === 'function') {
                showScreen('reg');
            }
        } catch (err) {
            if (typeof showScreen === 'function') showScreen('reg');
        }
    }, 200);
})();
