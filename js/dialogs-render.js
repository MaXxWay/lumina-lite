// dialogs-render.js — рендер списка диалогов

function renderDialogsList(container, filteredData) {
    container.innerHTML = '';

    if (filteredData.length === 0) {
        container.innerHTML = `
            <div class="dialogs-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <p>Нет диалогов.<br>Введите @username для поиска</p>
            </div>
        `;
        return;
    }

    filteredData.forEach((chat, i) => {
        const div = document.createElement('div');
        div.className = [
            'dialog-item',
            currentChat?.id === chat.id ? 'active' : '',
            chat.unreadCount > 0 ? 'unread-dialog' : '',
            chat.isSaved ? 'saved-dialog' : '',
            chat.isGroup ? 'group-dialog' : ''
        ].filter(Boolean).join(' ');
        div.dataset.chatId = chat.id;
        div.dataset.otherUserId = chat.otherId || '';
        div.style.animationDelay = `${i * 30}ms`;

        const unreadBadge = chat.unreadCount > 0
            ? `<span class="unread-badge-count">${chat.unreadCount > 99 ? '99+' : chat.unreadCount}</span>` : '';

        let avatarHtml = '';
        if (chat.isBot) {
            avatarHtml = '<img src="lumina.svg" alt="Bot" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
        } else if (chat.isSaved) {
            avatarHtml = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
        } else if (chat.isGroup) {
            avatarHtml = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>`;
        } else if (chat.otherUser?.avatar_url) {
            avatarHtml = `<img src="${escapeHtml(chat.otherUser.avatar_url)}" alt="${escapeHtml(chat.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            avatarHtml = `<div class="avatar-letter">${escapeHtml(chat.name.charAt(0))}</div>`;
        }

        const isOnline = chat.isOnline === true && !chat.isGroup && !chat.isBot && !chat.isSaved;

        const groupBadgeHtml = chat.isGroup ? `
            <span class="group-badge">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
            </span>
        ` : '';

        const verifiedBadge = (!chat.isBot && !chat.isGroup && !chat.isSaved && chat.otherUser?.is_verified === true) 
            ? '<span class="verified-user-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span>' 
            : '';

        div.innerHTML = `
            <div class="dialog-avatar ${chat.isBot ? 'bot-avatar' : ''} ${chat.isSaved ? 'saved-avatar' : ''} ${chat.isGroup ? 'group-avatar' : ''}">
                ${avatarHtml}
                ${isOnline ? '<div class="online-dot"></div>' : ''}
            </div>
            <div class="dialog-info">
                <div class="dialog-name">
                    ${chat.isBot ? '<span class="bot-badge left-badge">Бот</span>' : ''}
                    ${groupBadgeHtml}
                    ${escapeHtml(chat.name)}
                    ${verifiedBadge}
                    ${chat.isBot ? '<span class="bot-verify-inline"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span>' : ''}
                    ${unreadBadge}
                </div>
                <div class="dialog-preview">${escapeHtml(chat.lastMessage || '')}</div>
            </div>
        `;

        if (typeof attachDialogContextMenu === 'function') {
            attachDialogContextMenu(div, chat.id, chat);
        }
        
        div.onclick = async () => {
            document.querySelectorAll('.dialog-item').forEach(el => el.classList.remove('active'));
            div.classList.add('active');

            if (chat.isSaved) {
                if (typeof openSavedChat === 'function') await openSavedChat(chat.id);
            } else if (chat.isGroup) {
                if (typeof openGroupChat === 'function') await openGroupChat(chat.id, chat.groupInfo);
            } else {
                if (typeof openChat === 'function') await openChat(chat.id, chat.otherId, chat.otherUser);
            }

            if (chat.unreadCount > 0 && !chat.isSaved) {
                if (typeof markChatMessagesAsRead === 'function') await markChatMessagesAsRead(chat.id);
            }
        };

        container.appendChild(div);
    });
}

window.renderDialogsList = renderDialogsList;
