// utils.js — полный файл

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(() => { t.className = 'toast'; }, 3000);
}

function getEmail(username) {
    return `${username.toLowerCase().trim().replace(/^@/, '')}@lumina.local`;
}

function formatLastSeen(lastSeen) {
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

function getUserStatusFromProfile(profile) {
    if (!profile) return { text: 'неизвестно', class: 'status-offline', isOnline: false };
    
    if (profile.id === BOT_USER_ID) return { text: 'бот', class: 'status-bot', isOnline: false };
    
    if (profile.is_online === true) {
        return { text: 'онлайн', class: 'status-online', isOnline: true };
    }
    
    if (profile.last_seen) {
        const lastSeenDate = new Date(profile.last_seen);
        const now = new Date();
        const diffMins = (now - lastSeenDate) / 60000;
        const onlineTimeout = window.ONLINE_TIMEOUT_MINUTES || 5;
        if (diffMins < onlineTimeout) {
            return { text: 'онлайн', class: 'status-online', isOnline: true };
        }
        return { text: formatLastSeen(profile.last_seen), class: 'status-offline', isOnline: false };
    }
    
    return { text: 'неизвестно', class: 'status-offline', isOnline: false };
}

function formatDateDivider(date) {
    const msgDate = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
    const msgDateStart = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate());
    
    if (msgDateStart.getTime() === todayStart.getTime()) return 'Сегодня';
    else if (msgDateStart.getTime() === yesterdayStart.getTime()) return 'Вчера';
    else return msgDate.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' });
}

function updateDvh() {
    document.documentElement.style.setProperty('--dvh', `${window.innerHeight}px`);
}

function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
        || window.innerWidth <= 768;
}

function debounce(fn, wait) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

function formatSystemMessage(text, type = 'info') {
    const icons = {
        info: 'ℹ️',
        warning: '⚠️',
        success: '✅',
        danger: '❌'
    };
    const cleanText = text.replace(/[🎉✅⚠️❌👑🛡️👤➕👋✏️📝📢ℹ️💾👥]/g, '').trim();
    return `<div class="system-message ${type}">${icons[type] || '📢'} ${escapeHtml(cleanText)}</div>`;
}

// Экспорт
window.escapeHtml = escapeHtml;
window.showToast = showToast;
window.getEmail = getEmail;
window.formatLastSeen = formatLastSeen;
window.getUserStatusFromProfile = getUserStatusFromProfile;
window.formatDateDivider = formatDateDivider;
window.updateDvh = updateDvh;
window.isMobileDevice = isMobileDevice;
window.debounce = debounce;
window.formatSystemMessage = formatSystemMessage;
