// modal.js - Кастомные модальные окна

class CustomModal {
    constructor() {
        this.createModalElements();
        this.currentCallback = null;
    }

    createModalElements() {
        // Создаем основной контейнер модального окна
        const modalHTML = `
            <div id="custom-modal" class="custom-modal" style="display: none;">
                <div class="custom-modal-overlay"></div>
                <div class="custom-modal-container glass-card">
                    <div class="custom-modal-header">
                        <h3 id="modal-title" class="custom-modal-title"></h3>
                        <button class="custom-modal-close" id="modal-close">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                    <div class="custom-modal-body">
                        <p id="modal-message" class="custom-modal-message"></p>
                        <div id="modal-input-container" style="display: none;">
                            <input type="text" id="modal-input" class="glass-input" placeholder="">
                        </div>
                    </div>
                    <div class="custom-modal-footer">
                        <button id="modal-cancel" class="glass-button">Отмена</button>
                        <button id="modal-confirm" class="glass-button primary">OK</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        this.modal = document.getElementById('custom-modal');
        this.overlay = document.querySelector('.custom-modal-overlay');
        this.title = document.getElementById('modal-title');
        this.message = document.getElementById('modal-message');
        this.inputContainer = document.getElementById('modal-input-container');
        this.input = document.getElementById('modal-input');
        this.confirmBtn = document.getElementById('modal-confirm');
        this.cancelBtn = document.getElementById('modal-cancel');
        this.closeBtn = document.getElementById('modal-close');
        
        this.bindEvents();
    }
    
    bindEvents() {
        const closeModal = () => this.hide();
        
        this.confirmBtn.onclick = () => {
            if (this.currentCallback) {
                const value = this.inputContainer.style.display === 'block' ? this.input.value : true;
                this.currentCallback(value);
                this.currentCallback = null;
            }
            this.hide();
        };
        
        this.cancelBtn.onclick = () => {
            if (this.currentCallback) {
                this.currentCallback(null);
                this.currentCallback = null;
            }
            this.hide();
        };
        
        this.closeBtn.onclick = closeModal;
        this.overlay.onclick = closeModal;
        
        // Закрытие по Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display === 'flex') {
                closeModal();
            }
        });
    }
    
    show(options) {
        const { title = 'Подтверждение', message = '', confirmText = 'OK', cancelText = 'Отмена', type = 'confirm', defaultValue = '' } = options;
        
        this.title.textContent = title;
        this.message.textContent = message;
        this.confirmBtn.textContent = confirmText;
        this.cancelBtn.textContent = cancelText;
        
        // Настройка для prompt
        if (type === 'prompt') {
            this.inputContainer.style.display = 'block';
            this.input.value = defaultValue;
            this.input.placeholder = options.placeholder || '';
            setTimeout(() => this.input.focus(), 100);
        } else {
            this.inputContainer.style.display = 'none';
        }
        
        this.modal.style.display = 'flex';
        
        return new Promise((resolve) => {
            this.currentCallback = resolve;
        });
    }
    
    hide() {
        this.modal.style.display = 'none';
        this.input.value = '';
    }
    
    async alert(message, title = 'Уведомление') {
        return this.show({ title, message, type: 'confirm', confirmText: 'OK', cancelText: null });
    }
    
    async confirm(message, title = 'Подтверждение') {
        const result = await this.show({ title, message, type: 'confirm' });
        return result === true;
    }
    
    async prompt(message, title = 'Ввод', defaultValue = '', placeholder = '') {
        const result = await this.show({ 
            title, 
            message, 
            type: 'prompt', 
            defaultValue, 
            placeholder,
            confirmText: 'Сохранить',
            cancelText: 'Отмена'
        });
        return result;
    }
}

// Создаем глобальный экземпляр
const modal = new CustomModal();

// Переопределяем стандартные функции
window.alert = (message) => modal.alert(message);
window.confirm = (message) => modal.confirm(message);
window.prompt = (message, defaultValue) => modal.prompt(message, 'Ввод', defaultValue);

// Экспорт
window.CustomModal = CustomModal;
window.modal = modal;
