// mobile.js - Мобильная адаптация

function initMobileKeyboardHandler() {
    if (!window.matchMedia("(max-width: 768px)").matches) return;
    
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
            updateDvh();
        }
        originalHeight = currentHeight;
        updateDvh();
    });
    
    messageInput.addEventListener('focus', () => {
        setTimeout(() => {
            if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
            inputZone.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
    });
}

function initMobileInterface() {
    if (!window.matchMedia("(max-width: 768px)").matches) return;
    
    const chatHeader = document.querySelector('.chat-header');
    const sidebar = document.querySelector('.glass-sidebar');
    
    if (chatHeader && sidebar && !document.getElementById('mobile-menu-btn')) {
        sidebar.style.transform = 'translateX(-100%)';
        sidebar.style.transition = 'transform 0.3s ease';
        sidebar.style.position = 'absolute';
        sidebar.style.zIndex = '100';
        sidebar.style.height = '100%';
        sidebar.style.width = '280px';
        sidebar.style.background = 'rgba(3, 8, 26, 0.95)';
        sidebar.style.backdropFilter = 'blur(20px)';
        
        const menuBtn = document.createElement('button');
        menuBtn.id = 'mobile-menu-btn';
        menuBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
        menuBtn.style.cssText = `
            background: rgba(255,255,255,0.1);
            border: none;
            color: white;
            cursor: pointer;
            padding: 8px;
            margin-right: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            width: 36px;
            height: 36px;
            transition: background 0.2s;
        `;
        menuBtn.onclick = () => {
            const isVisible = sidebar.style.transform === 'translateX(0)';
            sidebar.style.transform = isVisible ? 'translateX(-100%)' : 'translateX(0)';
        };
        
        const chatInfo = chatHeader.querySelector('.chat-info');
        if (chatInfo) {
            chatInfo.insertBefore(menuBtn, chatInfo.firstChild);
        }
        
        document.addEventListener('click', (e) => {
            if (sidebar.style.transform === 'translateX(0)' && !sidebar.contains(e.target) && !menuBtn.contains(e.target)) {
                sidebar.style.transform = 'translateX(-100%)';
            }
        });
    }
}

function initMobileOptimizations() {
    initMobileKeyboardHandler();
    initMobileInterface();
}

window.initMobileOptimizations = initMobileOptimizations;
