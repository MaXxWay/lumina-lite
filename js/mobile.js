// mobile.js — мобильная навигация

let touchStartX = 0, touchStartY = 0, isSwiping = false;
let isChatOpen = false;

function initMobileNavigation() {
    if (!isMobileDevice()) return;

    const sidebar = document.querySelector('.glass-sidebar');
    const chatArea = document.querySelector('.glass-chat-area');
    if (!sidebar || !chatArea) return;

    sidebar.classList.remove('chat-open');
    chatArea.classList.remove('chat-open');
    isChatOpen = false;

    const inputZone = document.querySelector('.input-zone');
    if (inputZone) inputZone.style.display = 'none';

    addBackButton();

    chatArea.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
        isSwiping = true;
    }, { passive: true });

    chatArea.addEventListener('touchmove', e => {
        if (!isSwiping || !isChatOpen) return;
        const dx = e.changedTouches[0].screenX - touchStartX;
        const dy = e.changedTouches[0].screenY - touchStartY;
        if (dx > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            closeChat();
            isSwiping = false;
        }
    }, { passive: true });

    chatArea.addEventListener('touchend', () => { isSwiping = false; });

    document.addEventListener('backbutton', () => { if (isChatOpen) closeChat(); });
    window.addEventListener('popstate', e => { if (isChatOpen) { closeChat(); } });
}

function addBackButton() {
    const chatInfo = document.querySelector('.chat-info');
    if (!chatInfo) return;
    document.getElementById('mobile-back-btn')?.remove();

    const btn = document.createElement('button');
    btn.id = 'mobile-back-btn';
    btn.className = 'mobile-back-btn';
    btn.setAttribute('aria-label', 'Назад');
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 18l-6-6 6-6"/></svg>`;
    btn.onclick = e => { e.stopPropagation(); closeChat(); };
    chatInfo.insertBefore(btn, chatInfo.firstChild);
}

function openChatMobile(chatId) {
    if (!isMobileDevice()) return;
    const sidebar = document.querySelector('.glass-sidebar');
    const chatArea = document.querySelector('.glass-chat-area');
    if (!sidebar || !chatArea) return;

    sidebar.classList.add('chat-open');
    chatArea.classList.add('chat-open');
    isChatOpen = true;

    const inputZone = document.querySelector('.input-zone');
    const isBot = currentChat?.other_user?.id === BOT_USER_ID;
    if (inputZone) inputZone.style.display = isBot ? 'none' : 'block';

    if (chatId && !window.location.search.includes(`chat=${chatId}`)) {
        const url = new URL(window.location);
        url.searchParams.set('chat', chatId);
        window.history.pushState({ chatId }, '', url);
    }

    setTimeout(() => {
        const input = document.getElementById('message-input');
        if (input && !input.disabled) input.focus();
    }, 350);
}

function closeChat() {
    const sidebar = document.querySelector('.glass-sidebar');
    const chatArea = document.querySelector('.glass-chat-area');
    if (!sidebar || !chatArea) return;

    sidebar.classList.remove('chat-open');
    chatArea.classList.remove('chat-open');
    isChatOpen = false;

    const inputZone = document.querySelector('.input-zone');
    if (inputZone) inputZone.style.display = 'none';

    const url = new URL(window.location);
    url.searchParams.delete('chat');
    window.history.pushState({}, '', url);

    document.querySelectorAll('.dialog-item').forEach(el => el.classList.remove('active'));

    const sheet = document.getElementById('msg-bottom-sheet');
    if (sheet) { sheet.classList.remove('sheet-open'); setTimeout(() => sheet.style.display = 'none', 280); }

    currentChat = null;

    const messages = document.getElementById('messages');
    if (messages) {
        messages.innerHTML = `<div class="msg-stub"><svg width="48" height="48" style="margin-bottom:16px;opacity:.3"><use href="#icon-chat"/></svg><p>Выберите диалог</p></div>`;
    }
    const chatTitle = document.getElementById('chat-title');
    if (chatTitle) chatTitle.textContent = 'Lumina Lite';
    const chatAvatar = document.getElementById('chat-user-avatar');
    if (chatAvatar) chatAvatar.style.display = 'none';
    const chatStatus = document.querySelector('.chat-status');
    if (chatStatus) chatStatus.textContent = 'выберите диалог';
}

function initMobileKeyboardHandler() {
    if (!isMobileDevice()) return;
    const messagesContainer = document.getElementById('messages');
    let origH = window.innerHeight;

    window.addEventListener('resize', () => {
        const newH = window.innerHeight;
        if (newH < origH - 150 && isChatOpen && messagesContainer) {
            setTimeout(() => messagesContainer.scrollTop = messagesContainer.scrollHeight, 100);
        }
        origH = newH;
        if (typeof updateDvh === 'function') updateDvh();
    });

    document.getElementById('message-input')?.addEventListener('focus', () => {
        if (!isChatOpen || !messagesContainer) return;
        setTimeout(() => messagesContainer.scrollTop = messagesContainer.scrollHeight, 300);
    });
}

function initMobilePerformance() {
    if (!isMobileDevice()) return;
    if ('connection' in navigator && navigator.connection?.saveData) {
        const style = document.createElement('style');
        style.textContent = `.orb { display:none!important; } .message, .dialog-item { transition:none!important; animation:none!important; }`;
        document.head.appendChild(style);
    }
}

function initMobileOptimizations() {
    if (!isMobileDevice()) return;
    initMobileNavigation();
    initMobileKeyboardHandler();
    initMobilePerformance();
}

function initMobileGroupContextMenu() {
    if (!isMobileDevice()) return;
    const menu = document.getElementById('member-context-menu');
    if (!menu) return;
    menu.style.position = 'fixed';
    menu.style.bottom = '0';
    menu.style.left = '0';
    menu.style.right = '0';
    menu.style.top = 'auto';
    menu.style.transform = 'translateY(100%)';
    menu.style.borderRadius = '20px 20px 0 0';
    menu.style.maxWidth = 'none';
    menu.style.width = '100%';
}

// Функция для обновления списка диалогов на мобильных
function refreshDialogsMobile() {
    if (isMobileDevice() && typeof loadDialogs === 'function') {
        loadDialogs();
    }
}

window.initMobileOptimizations = initMobileOptimizations;
window.openChatMobile = openChatMobile;
window.closeChat = closeChat;
window.isChatOpen = isChatOpen;
window.initMobileGroupContextMenu = initMobileGroupContextMenu;
window.refreshDialogsMobile = refreshDialogsMobile;
