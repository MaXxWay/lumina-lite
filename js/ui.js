import { _supabase, BOT_USER_ID, BOT_PROFILE } from './config.js';

// ─── Экраны ─────────────────────────────────────────────
export function showScreen(key) {
    const screens = {
        reg:     document.getElementById('step-register'),
        login:   document.getElementById('step-login'),
        chat:    document.getElementById('chat-screen'),
        profile: document.getElementById('profile-screen')
    };
    Object.values(screens).forEach(s => {
        if (!s) return;
        s.style.display = 'none';
        s.classList.remove('active', 'visible');
    });
    const el = screens[key];
    if (!el) return;
    el.style.display = 'flex';
    el.classList.add(key === 'chat' || key === 'profile' ? 'visible' : 'active');
}

// ─── Тост ───────────────────────────────────────────────
export function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(() => { t.className = 'toast'; }, 3000);
}

// ─── Утилиты ────────────────────────────────────────────
export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function formatLastSeen(lastSeen) {
    if (!lastSeen) return 'неизвестно';
    const lastSeenDate = new Date(lastSeen);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (lastSeenDate >= today) {
        return `сегодня в ${lastSeenDate.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (lastSeenDate >= yesterday) {
        return `вчера в ${lastSeenDate.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
        return lastSeenDate.toLocaleDateString('ru', { day: 'numeric', month: 'short' }) +
               ` в ${lastSeenDate.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`;
    }
}

export function getUserStatusFromProfile(profile) {
    if (!profile) return { text: 'неизвестно', class: 'status-offline', isOnline: false };
    if (profile.is_online === true) return { text: 'онлайн', class: 'status-online', isOnline: true };
    if (!profile.last_seen) return { text: 'неизвестно', class: 'status-offline', isOnline: false };

    const diffMins = (new Date() - new Date(profile.last_seen)) / 60000;
    if (diffMins < 5) return { text: 'онлайн', class: 'status-online', isOnline: true };
    return { text: formatLastSeen(profile.last_seen), class: 'status-offline', isOnline: false };
}

// ─── Рендер сообщения ────────────────────────────────────
export function renderMessage(msg, currentUser, currentProfile) {
    const container = document.getElementById('messages');
    if (!container) return;

    const stub = container.querySelector('.msg-stub');
    if (stub) stub.remove();

    const isOwn = currentUser && msg.user_id === currentUser.id;
    const isBot = msg.user_id === BOT_USER_ID;
    let name = 'Пользователь';

    if (msg.profiles && msg.profiles.full_name) name = msg.profiles.full_name;
    else if (isOwn && currentProfile && currentProfile.full_name) name = currentProfile.full_name;
    else if (isBot) name = 'Lumina Bot';

    const timeStr = new Date(msg.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });

    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'own' : 'other'} ${isBot ? 'bot-message' : ''}`;
    div.dataset.id = msg.id;
    div.dataset.text = msg.text;

    div.innerHTML = `
        <div class="msg-avatar ${isBot ? 'bot-avatar' : ''}">
            ${isBot
                ? '<img src="lumina.svg" alt="Bot" width="28" height="28"><div class="verified-badge-small"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>'
                : `<div class="avatar-letter">${escapeHtml(name.charAt(0))}</div>`}
        </div>
        <div class="msg-bubble">
            ${!isOwn ? `<div class="msg-sender">${escapeHtml(name)}${isBot ? ' <span class="bot-badge-small">Бот</span>' : ''}</div>` : ''}
            <div class="text">${escapeHtml(msg.text)}</div>
            <div class="msg-time">${timeStr}</div>
        </div>
    `;

    container.appendChild(div);
    setTimeout(() => {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }, 50);

    return div;
}
