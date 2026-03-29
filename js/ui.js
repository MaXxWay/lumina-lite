export const ui = {
    showScreen(id) {
        document.querySelectorAll('.auth-container, .glass-main-container, .profile-screen').forEach(s => s.classList.remove('active'));
        if (id === 'chat') {
            document.querySelector('.glass-main-container').classList.add('active');
        } else {
            const target = document.getElementById('step-' + id) || document.getElementById(id);
            if (target) target.classList.add('active');
        }
    },

    appendMessage(msg, myId) {
        const container = document.getElementById('messages');
        const isOut = msg.sender_id === myId;
        const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const html = `
            <div class="message ${isOut ? 'out' : 'in'}">
                <div class="msg-bubble">
                    <div class="msg-text">${msg.text}</div>
                    <div class="msg-time">${time}</div>
                </div>
            </div>`;
        container.insertAdjacentHTML('beforeend', html);
        container.scrollTop = container.scrollHeight;
    }
};
