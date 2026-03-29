export const ui = {
    showScreen(id) {
        document.querySelectorAll('.auth-container, .glass-main-container, .profile-screen')
            .forEach(s => s.classList.remove('active'));

        if (id === 'chat') {
            document.querySelector('.glass-main-container')?.classList.add('active');
        } else if (id === 'profile-modal') {
            document.getElementById('profile-modal')?.classList.add('active');
        } else {
            const target = document.getElementById('step-' + id) || document.getElementById(id);
            if (target) target.classList.add('active');
        }
    },

    hideProfileModal() {
        document.getElementById('profile-modal')?.classList.remove('active');
    },

    appendMessage(msg, myId) {
        const container = document.getElementById('messages');
        if (!container) return;

        // Убираем заглушку при первом сообщении
        const stub = container.querySelector('.msg-stub');
        if (stub) stub.remove();

        const isOut = msg.sender_id === myId;
        const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const safeText = String(msg.text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        const div = document.createElement('div');
        div.className = `message ${isOut ? 'out' : 'in'}`;
        div.dataset.id = msg.id || '';
        div.innerHTML = `
            <div class="msg-bubble">
                <div class="msg-text">${safeText}</div>
                <div class="msg-time">${time}</div>
            </div>`;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    },

    clearMessages() {
        const container = document.getElementById('messages');
        if (container) container.innerHTML = '<div class="msg-stub"><p>Загрузка сообщений...</p></div>';
    },

    setDialogActive(id) {
        document.querySelectorAll('.dialog-item').forEach(d => {
            d.classList.toggle('active', d.dataset.uid === id);
        });
    },

    showToast(text, type = '') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = text;
        toast.className = `toast${type ? ' ' + type : ''} show`;
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
    }
};
