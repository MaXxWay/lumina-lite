export function showScreen(screenId) {
    document.querySelectorAll('.auth-container, .glass-main-container, .profile-screen').forEach(s => s.classList.remove('active'));
    if (screenId === 'chat') {
        document.querySelector('.glass-main-container').classList.add('active');
    } else {
        const target = document.getElementById('step-' + screenId) || document.getElementById(screenId);
        if (target) target.classList.add('active');
    }
}

export function appendMessage(msg, currentUserId) {
    const container = document.getElementById('messages');
    const stub = container.querySelector('.msg-stub');
    if (stub) stub.remove();

    const isOut = msg.sender_id === currentUserId;
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const div = document.createElement('div');
    div.className = `message ${isOut ? 'out' : 'in'}`;
    div.innerHTML = `
        <div class="msg-bubble">
            <div class="msg-text">${msg.text}</div>
            <div class="msg-time">${time}</div>
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

export function updateChatHeader(profile) {
    document.getElementById('chat-title').textContent = profile.full_name;
    const inputZone = document.querySelector('.input-zone');
    if (inputZone) inputZone.style.display = 'flex';
}
