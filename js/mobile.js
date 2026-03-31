// mobile.js - Мобильная адаптация

function initMobileKeyboardHandler() {
    if (!isMobileDevice()) return;
    
    const messageInput = document.getElementById('message-input');
    const inputZone = document.querySelector('.input-zone');
    const messagesContainer = document.getElementById('messages');
    
    if (!messageInput || !inputZone) return;
    
    let originalHeight = window.innerHeight;
    let isKeyboardOpen = false;
    
    window.addEventListener('resize', () => {
        const currentHeight = window.innerHeight;
        
        if (currentHeight < originalHeight - 150) {
            if (!isKeyboardOpen) {
                isKeyboardOpen = true;
                setTimeout(() => {
                    if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    inputZone.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        } else if (currentHeight > originalHeight - 50) {
            isKeyboardOpen = false;
            if (typeof updateDvh === 'function') updateDvh();
        }
        originalHeight = currentHeight;
        if (typeof updateDvh === 'function') updateDvh();
    });
    
    messageInput.addEventListener('focus', () => {
        setTimeout(() => {
            if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
            inputZone.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
    });
}

function initMobileGestures() {
    if (!isMobileDevice()) return;
    
    const sidebar = document.querySelector('.glass-sidebar');
    const chatArea = document.querySelector('.glass-chat-area');
    let touchStartX = 0;
    
    if (!sidebar || !chatArea) return;
    
    chatArea.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    });
    
    chatArea.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const swipeDistance = touchEndX - touchStartX;
        
        if (swipeDistance > 50 && touchStartX < 50) {
            toggleMobileSidebar(true);
        } else if (swipeDistance < -50) {
            toggleMobileSidebar(false);
        }
    });
}

function toggleMobileSidebar(show) {
    if (!isMobileDevice()) return;
    
    const sidebar = document.querySelector('.glass-sidebar');
    const overlay = document.getElementById('mobile-sidebar-overlay');
    
    if (show) {
        if (sidebar) sidebar.classList.add('open');
        if (!overlay) {
            const newOverlay = document.createElement('div');
            newOverlay.id = 'mobile-sidebar-overlay';
            newOverlay.className = 'mobile-sidebar-overlay';
            newOverlay.onclick = () => toggleMobileSidebar(false);
            document.body.appendChild(newOverlay);
            setTimeout(() => newOverlay.classList.add('active'), 10);
        } else {
            overlay.classList.add('active');
        }
    } else {
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
        }
    }
}

function initMobilePerformance() {
    if (!isMobileDevice()) return;
    
    const MAX_CACHED_MESSAGES = window.MAX_CACHED_MESSAGES || 100;
    if (typeof messagesCache !== 'undefined' && messagesCache) {
        const originalSet = messagesCache.set;
        messagesCache.set = function(key, value) {
            if (value && value.length > MAX_CACHED_MESSAGES) {
                value = value.slice(-MAX_CACHED_MESSAGES);
            }
            return originalSet.call(this, key, value);
        };
    }
    
    if ('connection' in navigator && navigator.connection.saveData) {
        const style = document.createElement('style');
        style.textContent = `
            .message, .dialog-item, .glass-button, .glass-card {
                transition: none !important;
                animation: none !important;
            }
            .orb {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
    }
}

function initMobileInterface() {
    if (!isMobileDevice()) return;
    
    const chatHeader = document.querySelector('.chat-header');
    const chatInfo = document.querySelector('.chat-info');
    
    if (chatHeader && chatInfo && !document.getElementById('mobile-menu-btn')) {
        const menuBtn = document.createElement('button');
        menuBtn.id = 'mobile-menu-btn';
        menuBtn.className = 'mobile-menu-btn';
        menuBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
        menuBtn.onclick = (e) => {
            e.stopPropagation();
            toggleMobileSidebar(true);
        };
        
        // Вставляем кнопку в начало chat-info
        chatInfo.insertBefore(menuBtn, chatInfo.firstChild);
    }
}

function initMobileOptimizations() {
    if (!isMobileDevice()) return;
    initMobileKeyboardHandler();
    initMobileGestures();
    initMobilePerformance();
    initMobileInterface();
}

// Экспорт
window.initMobileOptimizations = initMobileOptimizations;
window.toggleMobileSidebar = toggleMobileSidebar;
