import { store } from './store.js';

class UIManager {
    constructor() {
        this.screens = {
            reg: document.getElementById('step-register'),
            login: document.getElementById('step-login'),
            chat: document.getElementById('chat-screen'),
            profile: document.getElementById('profile-screen')
        };
    }
    
    showScreen(key) {
        Object.values(this.screens).forEach(screen => {
            if (!screen) return;
            screen.style.display = 'none';
            screen.classList.remove('active', 'visible');
        });
        
        const el = this.screens[key];
        if (!el) return;
        
        el.style.display = 'flex';
        el.classList.add(key === 'chat' || key === 'profile' ? 'visible' : 'active');
    }
    
    updateChatInterface(chat) {
        const chatTitle = document.getElementById('chat-title');
        const chatStatus = document.querySelector('.chat-status');
        const inputZone = document.querySelector('.input-zone');
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('btn-send-msg');
        
        if (!chat) {
            if (chatTitle) chatTitle.textContent = 'Lumina Lite';
            if (chatStatus) chatStatus.textContent = 'выберите диалог';
            if (inputZone) inputZone.style.display = 'none';
            if (messageInput) messageInput.disabled = true;
            if (sendButton) sendButton.disabled = true;
            return;
        }
        
        const isBot = chat.other_user?.id === '00000000-0000-0000-0000-000000000000';
        const name = chat.other_user?.full_name || chat.other_user?.username || (isBot ? 'Lumina Bot' : 'Чат');
        
        if (chatTitle) {
            chatTitle.innerHTML = `${this.escapeHtml(name)} ${isBot ? '<span class="bot-badge">Бот</span>' : ''}`;
        }
        
        if (isBot) {
            if (inputZone) inputZone.style.display = 'none';
            if (messageInput) messageInput.disabled = true;
            if (sendButton) sendButton.disabled = true;
            if (chatStatus) {
                chatStatus.textContent = 'бот';
                chatStatus.className = 'chat-status status-bot';
            }
        } else {
            if (inputZone) inputZone.style.display = 'block';
            if (messageInput) {
                messageInput.disabled = false;
                messageInput.placeholder = 'Написать сообщение...';
                setTimeout(() => messageInput.focus(), 100);
            }
            if (sendButton) sendButton.disabled = false;
        }
    }
    
    updateProfileFooter(profile) {
        if (!profile) return;
        
        const footerAvatar = document.getElementById('footer-avatar');
        const footerName = document.getElementById('footer-name');
        const footerUsername = document.getElementById('footer-username');
        
        if (footerAvatar) {
            footerAvatar.textContent = (profile.full_name || '?')[0].toUpperCase();
        }
        if (footerName) {
            footerName.textContent = profile.full_name || profile.username || 'Пользователь';
        }
        if (footerUsername) {
            footerUsername.textContent = `@${profile.username || 'username'}`;
        }
    }
    
    showLoadingMessages() {
        const container = document.getElementById('messages');
        if (container) {
            container.innerHTML = '<div class="loading-messages">Загрузка сообщений...</div>';
        }
    }
    
    showEmptyMessages() {
        const container = document.getElementById('messages');
        if (container) {
            container.innerHTML = `
                <div class="msg-stub">
                    <svg width="48" height="48" style="margin-bottom: 16px; opacity: 0.3;"><use href="#icon-chat"/></svg>
                    <p>Начните переписку</p>
                </div>
            `;
        }
    }
    
    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
    
    updateActiveDialog(chatId) {
        document.querySelectorAll('.dialog-item').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.chatId === chatId) el.classList.add('active');
        });
    }
}

export const uiManager = new UIManager();
