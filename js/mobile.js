// mobile.js - Полная мобильная навигация

let touchStartX = 0;
let touchStartY = 0;
let isSwiping = false;
let isChatOpen = false;
let longPressTimer = null;
let longPressTarget = null;

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
    
    // Добавляем обработчик для обновления URL при открытии чата
    window.addEventListener('load', () => {
        const urlParams = new URLSearchParams(window.location.search);
        const chatId = urlParams.get('chat');
        if (chatId) {
            // Если есть chat в URL, но чат не открыт - закрываем его
            if (!isChatOpen) {
                closeChat();
            }
        }
    });
}

function initLongPressHandler() {
    const messagesContainer = document.getElementById('messages');
    if (!messagesContainer) return;
    
    // Используем делегирование событий для всех сообщений
    messagesContainer.addEventListener('touchstart', (e) => {
        // Ищем элемент сообщения
        const messageDiv = e.target.closest('.message');
        if (!messageDiv) return;
        
        // Сохраняем целевое сообщение
        longPressTarget = messageDiv;
        
        // Устанавливаем таймер на долгое нажатие (500ms)
        longPressTimer = setTimeout(() => {
            if (longPressTarget) {
                // Получаем данные сообщения
                const msgId = longPressTarget.dataset.id;
                const msgText = longPressTarget.dataset.text;
                const isOwn = longPressTarget.classList.contains('own');
                
                // Показываем контекстное меню
                if (typeof showMessageMenu === 'function') {
                    // Создаем искусственное событие с координатами касания
                    const touch = e.touches[0];
                    const fakeEvent = {
                        clientX: touch.clientX,
                        clientY: touch.clientY,
                        preventDefault: () => {}
                    };
                    showMessageMenu(fakeEvent, msgId, msgText, isOwn);
                }
                
                // Добавляем визуальный фидбек
                longPressTarget.style.transform = 'scale(0.98)';
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
        // Если палец двигается - отменяем долгое нажатие
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
            longPressTarget = null;
        }
    });
    
    messagesContainer.addEventListener('touchend', (e) => {
        // Если палец поднят до окончания таймера - отменяем
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
            longPressTarget = null;
        }
    });
    
    messagesContainer.addEventListener('touchcancel', (e) => {
        // Если касание прервано - отменяем
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
    
    // Вставляем в начало chat-info
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
    const touchY = e.changedTouches[0].screenY;
    const deltaX = touchX - touchStartX;
    const deltaY = touchY - touchStartY;
    
    // Если свайп влево и больше горизонтальный, чем вертикальный
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
    const touchEndY = e.changedTouches[0].screenY;
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    
    // Свайп влево для закрытия чата
    if (deltaX < -50 && Math.abs(deltaX) > Math.abs(deltaY)) {
        closeChat();
    }
    
    isSwiping = false;
}

function openChatMobile(chatId) {
    const sidebar = document.querySelector('.glass-sidebar');
    const chatArea = document.querySelector('.glass-chat-area');
    
    if (!sidebar || !chatArea) return;
    
    // Открываем чат
    sidebar.classList.add('chat-open');
    chatArea.classList.add('chat-open');
    isChatOpen = true;
    
    // Показываем поле ввода
    const inputZone = document.querySelector('.input-zone');
    if (inputZone) inputZone.style.display = 'block';
    
    // Обновляем URL без перезагрузки
    if (window.history && chatId) {
        const url = new URL(window.location);
        url.searchParams.set('chat', chatId);
        window.history.pushState({ chatId }, '', url);
    }
    
    // Фокусируем на поле ввода через небольшую задержку
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
    
    // Закрываем чат
    sidebar.classList.remove('chat-open');
    chatArea.classList.remove('chat-open');
    isChatOpen = false;
    
    // Скрываем поле ввода
    const inputZone = document.querySelector('.input-zone');
    if (inputZone) inputZone.style.display = 'none';
    
    // Обновляем URL
    if (window.history) {
        const url = new URL(window.location);
        url.searchParams.delete('chat');
        window.history.pushState({}, '', url);
    }
    
    // Снимаем выделение с диалога
    document.querySelectorAll('.dialog-item').forEach(el => {
        el.classList.remove('active');
    });
    
    // Очищаем текущий чат
    if (window.currentChat) {
        window.currentChat = null;
    }
    
    // Очищаем сообщения
    const messagesContainer = document.getElementById('messages');
    if (messagesContainer) {
        messagesContainer.innerHTML = `
            <div class="msg-stub">
                <svg width="48" height="48" style="margin-bottom: 16px; opacity: 0.3;"><use href="#icon-chat"/></svg>
                <p>Выберите диалог, чтобы начать общение</p>
            </div>
        `;
    }
    
    // Обновляем заголовок
    const chatTitle = document.getElementById('chat-title');
    if (chatTitle) chatTitle.textContent = 'Lumina Lite';
    
    const chatStatus = document.querySelector('.chat-status');
    if (chatStatus) chatStatus.textContent = 'выберите диалог';
    
    // Отключаем индикатор печати
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
    
    // Отключаем анимации при включенном энергосбережении
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

// Переопределяем функции открытия чата
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
