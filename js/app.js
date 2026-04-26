// app.js — точка входа с загрузкой HTML страниц

(async function init() {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Загружаем HTML страницы
    await loadPage('auth-page', 'html/auth.html');
    await loadPage('chat-page', 'html/chat.html');

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
            showPage('auth-page');
            if (typeof showScreenInAuth === 'function') {
                showScreenInAuth('login');
            }
            hideLoader();
        }
    });

    // Инициализация компонентов после загрузки страниц
    setTimeout(() => {
        if (typeof initAuth === 'function') initAuth();
        if (typeof initEmojiPicker === 'function') initEmojiPicker();
        if (typeof initImprovedMessageMenu === 'function') initImprovedMessageMenu();
        if (typeof initProfileScreen === 'function') initProfileScreen();
        if (typeof initSearchDialogs === 'function') initSearchDialogs();
        if (typeof initSendButton === 'function') initSendButton();
        if (typeof initUserActivityTracking === 'function') initUserActivityTracking();
        if (typeof initSideMenu === 'function') initSideMenu();
    }, 100);

    window.addEventListener('resize', updateDvh);
    updateDvh();

    if (session) {
        await handleSuccessfulLogin(session.user);
    } else {
        hideLoader();
        showPage('auth-page');
        if (typeof showScreenInAuth === 'function') {
            showScreenInAuth('login');
        }
    }
})();

function loadPage(containerId, url) {
    return new Promise((resolve, reject) => {
        fetch(url)
            .then(response => response.text())
            .then(html => {
                const container = document.getElementById(containerId);
                if (container) {
                    container.innerHTML = html;
                    resolve();
                } else {
                    reject('Container not found');
                }
            })
            .catch(reject);
    });
}

function showPage(pageId) {
    document.querySelectorAll('.page-container').forEach(container => {
        container.classList.remove('active');
    });
    const page = document.getElementById(pageId);
    if (page) {
        page.classList.add('active');
        page.style.display = 'block';
    }
}

function showScreenInAuth(screen) {
    const regScreen = document.getElementById('step-register');
    const loginScreen = document.getElementById('step-login');
    if (regScreen && loginScreen) {
        if (screen === 'reg') {
            regScreen.style.display = 'block';
            loginScreen.style.display = 'none';
        } else {
            regScreen.style.display = 'none';
            loginScreen.style.display = 'block';
        }
    }
}

function hideLoader() {
    const loader = document.getElementById('app-loader');
    if (loader) {
        loader.classList.add('hidden');
        setTimeout(() => {
            if (loader.parentNode) loader.remove();
        }, 600);
    }
}

window.showPage = showPage;
window.showScreenInAuth = showScreenInAuth;
window.hideLoader = hideLoader;
