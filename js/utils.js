// Вспомогательные функции
export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function showToast(msg, isError = false, duration = 3000) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(() => { t.className = 'toast'; }, duration);
}

export function formatTime(date) {
    return new Date(date).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
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
    
    if (profile.is_online === true) {
        return { text: 'онлайн', class: 'status-online', isOnline: true };
    }
    
    if (!profile.last_seen) return { text: 'неизвестно', class: 'status-offline', isOnline: false };
    
    const lastSeenDate = new Date(profile.last_seen);
    const now = new Date();
    const diffMins = (now - lastSeenDate) / 60000;
    
    if (diffMins < 5) {
        return { text: 'онлайн', class: 'status-online', isOnline: true };
    }
    
    return { text: formatLastSeen(profile.last_seen), class: 'status-offline', isOnline: false };
}

export function updateDvh() {
    document.documentElement.style.setProperty('--dvh', `${window.innerHeight}px`);
}

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
