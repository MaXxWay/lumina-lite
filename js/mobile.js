// mobile.js - Полная мобильная навигация с плавными анимациями

let touchStartX = 0;
let touchStartY = 0;
let isSwiping = false;
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
    if (inputZone) {
        inputZone.style.display = 'none';
        inputZone.classList.add('hidden-input');
    }
    
    addBackButton();
    
    if (chatArea) {
        chatArea.addEventListener('touchstart', handleTouchStart);
        chatArea.addEventListener('touchmove', handleTouchMove);
        chatArea.addEventListener('touchend', handleTouchEnd);
    }
    
    document.addEventListener('backbutton', () => {
        if (isChatOpen) {
            closeChat();
        }
    });
    
    window.addEventListener('popstate', (event) => {
        if (isChatOpen) {
            closeChat();
            event.preventDefault();
        }
    });
}

function addBackButton() {
    const chatInfo = document.querySelector('.chat-info');
    if (!chatInfo) return;
    
    const oldBtn = document.getElementById('mobile-back-btn');
    if (oldBtn) oldBtn.remove();
    
    const backBtn = document.createElement('button');
    backBtn.id = 'mobile-back-btn';
    backBtn.className = 'mobile-back-btn';
    backBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6"/>
        </svg>
    `;
    backBtn.onclick = (e) => {
        e.stopPropagation();
        closeChat();
    };
    
    chatInfo.insertBefore(backBtn, chatInfo.firstChild);
}

function handleTouchStart(e) {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
    isSwiping = true;
}

function handleTouchMove(e) {
    if (!isSwiping || !isChatOpen) return;
    
    const touchX = e.changedTouches[0].screenX;
    const deltaX = touchX - touchStartX;
    const deltaY = e.changedTouches[0].screenY - touchStartY;
    
    if (deltaX < -30 && Math.abs(deltaX) > Math.abs(deltaY)) {
        e.preventDefault();
        closeChat();
        isSwiping = false;
    }
}

function handleTouchEnd(e) {
    if (!isSwiping || !isChatOpen) {
        isSwiping = false;
        return;
    }
    
    const touchEndX = e.changedTouches[0].screenX;
    const deltaX = touchEndX - touchStartX;
    const deltaY = e.changedTouches[0].screenY - touchStartY;
    
    if (deltaX < -50 && Math.abs(deltaX) > Math.abs(deltaY)) {
        closeChat();
    }
    
    isSwiping = false;
}

function openChatMobile(chatId) {
    const sidebar = document.querySelector('.glass-sidebar');
    const chatArea = document.querySelector('.glass-chat-area');
    const inputZone = document.querySelector('.input-zone');
    
    if (!sidebar || !chatArea) return;
    
    if (inputZone) {
        inputZone.style.display = 'block';
        inputZone.classList.remove('hidden-input');
        setTimeout(() => {
            inputZone.style.opacity = '1';
        }, 10);
    }
    
    sidebar.classList.add('chat-open');
    chatArea.classList.add('chat-open');
    isChatOpen = true;
    
    if (window.history && chatId) {
        const url = new URL(window.location);
        url.searchParams.set('chat', chatId);
        window.history.pushState({ chatId }, '', url);
    }
    
    setTimeout(() => {
        const input = document.getElementById('message-input');
        if (input && !input.disabled) {
            input.focus();
        }
    }, 350);
}

function closeChat() {
    const sidebar = document.querySelector('.glass-sidebar');
    const chatArea = document.querySelector('.glass-chat-area');
    const inputZone = document.querySelector('.input-zone');
    
    if (!sidebar || !chatArea) return;
    
    sidebar.classList.remove('chat-open');
    chatArea.classList.remove('chat-open');
    isChatOpen = false;
    
    if (inputZone) {
        inputZone.style.opacity = '0';
        setTimeout(() => {
            inputZone.style.display = 'none';
            inputZone.classList.add('hidden-input');
        }, 200);
    }
    
    if (window.history) {
        const url = new URL(window.location);
        url.searchParams.delete('chat');
        window.history.pushState({}, '', url);
    }
    
    document.querySelectorAll('.dialog-item').forEach(el => {
        el.classList.remove('active');
    });
    
    if (window.currentChat) {
        window.currentChat = null;
    }
    
    const messagesContainer = document.getElementById('messages');
    if (messagesContainer) {
        messagesContainer.innerHTML = `
            <div class="msg-stub">
                <svg width="48" height="48" style="margin-bottom: 16px; opacity: 0.3;"><use href="#icon-chat"/></svg>
                <p>Выберите диалог, чтобы начать общение</p>
            </div>
        `;
    }
    
    const chatTitle = document.getElementById('chat-title');
    if (chatTitle) chatTitle.textContent = 'Lumina Lite';
    
    const chatStatus = document.querySelector('.chat-status');
    if (chatStatus) chatStatus.textContent = 'выберите диалог';
    
    const typingStatus = document.querySelector('.typing-status');
    if (typingStatus) typingStatus.style.display = 'none';
}

function initMobileKeyboardHandler() {
    if (!isMobileDevice()) return;
    
    const messageInput = document.getElementById('message-input');
    const messagesContainer = document.getElementById('messages');
    
    if (!messageInput) return;
    
    let originalHeight = window.innerHeight;
    
    window.addEventListener('resize', () => {
        const currentHeight = window.innerHeight;
        
        if (currentHeight < originalHeight - 150 && isChatOpen) {
            setTimeout(() => {
                if (messagesContainer) {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }
            }, 100);
        }
        
        originalHeight = currentHeight;
        if (typeof updateDvh === 'function') updateDvh();
    });
    
    messageInput.addEventListener('focus', () => {
        if (!isChatOpen) return;
        setTimeout(() => {
            if (messagesContainer) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        }, 300);
    });
}

function initMobilePerformance() {
    if (!isMobileDevice()) return;
    
    const MAX_CACHED_MESSAGES = 100;
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

function initMobileOptimizations() {
    if (!isMobileDevice()) return;
    initMobileNavigation();
    initMobileKeyboardHandler();
    initMobilePerformance();
}

function patchOpenChat() {
    if (!isMobileDevice()) return;
    
    const originalOpenChat = window.openChat;
    if (originalOpenChat) {
        window.openChat = async function(chatId, otherUserId, otherUser) {
            const result = await originalOpenChat(chatId, otherUserId, otherUser);
            openChatMobile(chatId);
            return result;
        };
    }
    
    const originalOpenSavedChat = window.openSavedChat;
    if (originalOpenSavedChat) {
        window.openSavedChat = async function(chatId) {
            const result = await originalOpenSavedChat(chatId);
            openChatMobile(chatId);
            return result;
        };
    }
}

// Экспорт
window.initMobileOptimizations = initMobileOptimizations;
window.openChatMobile = openChatMobile;
window.closeChat = closeChat;
window.patchOpenChat = patchOpenChat;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initMobileOptimizations();
        patchOpenChat();
    });
} else {
    initMobileOptimizations();
    patchOpenChat();
}
