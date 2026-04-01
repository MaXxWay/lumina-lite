// mobile.js - Мобильная адаптация

let touchStartX = 0;
let touchStartY = 0;
let isSwiping = false;
let isChatOpen = false;
let longPressTimer = null;
let longPressTarget = null;
let pressStartX = 0;
let pressStartY = 0;

function initMobileNavigation() {
    if (!isMobileDevice()) return;
    
    const sidebar = document.querySelector('.glass-sidebar');
    const chatArea = document.querySelector('.glass-chat-area');
    
    if (!sidebar || !chatArea) return;
    
    // Изначально чат закрыт
    sidebar.classList.remove('chat-open');
    chatArea.classList.remove('chat-open');
    isChatOpen = false;
    
    // Скрываем поле ввода изначально
    const inputZone = document.querySelector('.input-zone');
    if (inputZone) inputZone.style.display = 'none';
    
    // Добавляем кнопку "Назад" в хедер чата
    addBackButton();
    
    // Настройка свайпов на области чата
    if (chatArea) {
        chatArea.addEventListener('touchstart', handleTouchStart);
        chatArea.addEventListener('touchmove', handleTouchMove);
        chatArea.addEventListener('touchend', handleTouchEnd);
    }
    
    // Добавляем обработку долгого нажатия на сообщения
    initLongPressHandler();
    
    // Запрещаем свайп на сообщениях, чтобы не мешать скроллу
    const messagesContainer = document.getElementById('messages');
    if (messagesContainer) {
        messagesContainer.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        });
    }
    
    // Обработка аппаратной кнопки "Назад" на Android
    document.addEventListener('backbutton', () => {
        if (isChatOpen) {
            closeChat();
        }
    });
    
    // Обработка popstate (для браузерной кнопки назад)
    window.addEventListener('popstate', (event) => {
        if (isChatOpen) {
            closeChat();
            event.preventDefault();
        }
    });
    
    console.log('✅ mobileNavigation инициализирован');
}

function initLongPressHandler() {
    const messagesContainer = document.getElementById('messages');
    if (!messagesContainer) return;
    
    messagesContainer.addEventListener('touchstart', (e) => {
        const messageDiv = e.target.closest('.message');
        if (!messageDiv) return;
        
        const touch = e.touches[0];
        pressStartX = touch.clientX;
        pressStartY = touch.clientY;
        
        longPressTarget = messageDiv;
        
        longPressTimer = setTimeout(() => {
            if (longPressTarget) {
                // Вибрация (если поддерживается)
                if (window.navigator && window.navigator.vibrate) {
                    window.navigator.vibrate(50);
                }
                
                const msgId = longPressTarget.dataset.id;
                const msgText = longPressTarget.dataset.text;
                const isOwn = longPressTarget.classList.contains('own');
                
                if (typeof showMessageMenu === 'function') {
                    const fakeEvent = {
                        clientX: pressStartX,
                        clientY: pressStartY,
                        preventDefault: () => {}
                    };
                    showMessageMenu(fakeEvent, msgId, msgText, isOwn);
                }
                
                // Визуальный фидбек
                longPressTarget.style.transform = 'scale(0.98)';
                longPressTarget.style.transition = 'transform 0.1s ease';
                setTimeout(() => {
                    if (longPressTarget) {
                        longPressTarget.style.transform = '';
                    }
                }, 150);
            }
            longPressTimer = null;
        }, 500);
    });
    
    messagesContainer.addEventListener('touchmove', (e) => {
        if (longPressTimer && longPressTarget) {
            const touch = e.touches[0];
            const deltaX = Math.abs(touch.clientX - pressStartX);
            const deltaY = Math.abs(touch.clientY - pressStartY);
            
            if (deltaX > 10 || deltaY > 10) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
                longPressTarget = null;
            }
        }
    });
    
    messagesContainer.addEventListener('touchend', () => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
            longPressTarget = null;
        }
    });
    
    messagesContainer.addEventListener('touchcancel', () => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
            longPressTarget = null;
        }
    });
}

function addBackButton() {
    const chatInfo = document.querySelector('.chat-info');
    if (!chatInfo) return;
    
    // Удаляем старую кнопку если есть
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
    
    if (!sidebar || !chatArea) return;
    
    sidebar.classList.add('chat-open');
    chatArea.classList.add('chat-open');
    isChatOpen = true;
    
    const inputZone = document.querySelector('.input-zone');
    if (inputZone) inputZone.style.display = 'block';
    
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
    
    if (!sidebar || !chatArea) return;
    
    sidebar.classList.remove('chat-open');
    chatArea.classList.remove('chat-open');
    isChatOpen = false;
    
    const inputZone = document.querySelector('.input-zone');
    if (inputZone) inputZone.style.display = 'none';
    
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

// Автоматическая инициализация
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initMobileOptimizations();
        patchOpenChat();
    });
} else {
    initMobileOptimizations();
    patchOpenChat();
}

console.log('✅ mobile.js загружен');
