// ui.js — UI компоненты, контекстное меню, профиль
function updateProfileFooter() {
    const profile = window.currentProfile;
    if (!profile) {
        console.log('updateProfileFooter: profile не найден');
        return;
    }
    
    const avatar = document.getElementById('footer-avatar');
    const name = document.getElementById('footer-name');
    const uname = document.getElementById('footer-username');
    
    console.log('updateProfileFooter: обновляем футер с профилем:', profile.full_name, profile.username);
    
    if (avatar) {
        if (profile.avatar_url) {
            avatar.innerHTML = `<img src="${escapeHtml(profile.avatar_url)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            avatar.textContent = (profile.full_name || profile.username || '?').charAt(0).toUpperCase();
            avatar.style.background = 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))';
        }
    }
    
    if (name) {
        name.textContent = profile.full_name || profile.username || 'Пользователь';
    }
    
    if (uname) {
        uname.textContent = `@${profile.username || 'username'}`;
    }
}
function initProfileFooter() {
    const footer = document.getElementById('profile-footer');
    if (!footer) return;
    const info = footer.querySelector('.profile-footer-info');
    if (info) info.onclick = () => { if (window.currentProfile) openProfileModal(); };
    document.getElementById('footer-settings')?.addEventListener('click', () => { if (window.currentProfile) openProfileModal(); });
    
    const logoutBtn = document.getElementById('footer-logout');
    if (logoutBtn) {
        logoutBtn.style.display = 'flex';
        logoutBtn.onclick = async () => {
            const confirmed = await modal.confirm('Выйти из аккаунта?', 'Выход');
            if (confirmed) {
                if (typeof stopOnlineHeartbeat === 'function') stopOnlineHeartbeat();
                if (window.realtimeChannel) await supabaseClient.removeChannel(window.realtimeChannel);
                await supabaseClient.auth.signOut();
                window.currentUser = null; window.currentProfile = null; window.currentChat = null;
                showScreen('login');
                showToast('Вы вышли из аккаунта');
            }
        };
    }
    
    if (window.currentProfile) updateProfileFooter();
}

function openProfileModal(profile = window.currentProfile, options = {}) {
    if (!profile) {
        profile = window.currentProfile;
        if (!profile) return;
    }
    
    const isOwnProfile = profile.id === window.currentUser?.id;
    const readOnly = options.readOnly === true || !isOwnProfile;
    const fromGroup = options.fromGroup === true;
    const groupId = options.groupId;
    const groupName = options.groupName;
    const letter = (profile.full_name || profile.username || '?').charAt(0).toUpperCase();

    const modal = document.getElementById('profile-screen');
    if (!modal) return;
    
    const avatarLetter = document.getElementById('profile-avatar-letter');
    const fullname = document.getElementById('profile-fullname');
    const username = document.getElementById('profile-username');
    const bio = document.getElementById('profile-bio');
    const title = document.querySelector('.profile-modal-title');
    const viewMode = document.getElementById('profile-view-mode');
    const editMode = document.getElementById('profile-edit-mode');
    const nameView = document.getElementById('profile-name-view');
    const usernameView = document.getElementById('profile-username-view');
    const bioView = document.getElementById('profile-bio-view');
    const editBtn = document.getElementById('btn-edit-profile');
    const saveBtn = document.getElementById('btn-save-profile');
    const logoutBtn = document.getElementById('btn-logout-profile');
    
    const oldChatBtn = document.getElementById('profile-chat-btn');
    if (oldChatBtn) oldChatBtn.remove();
    
    if (fromGroup && !isOwnProfile && profile.id !== BOT_USER_ID && profile.id !== SAVED_CHAT_ID) {
        const chatBtn = document.createElement('button');
        chatBtn.id = 'profile-chat-btn';
        chatBtn.className = 'glass-button primary';
        chatBtn.style.marginTop = '16px';
        chatBtn.innerHTML = '<svg width="16" height="16" style="margin-right: 8px;"><use href="#icon-chat"/></svg>Перейти в чат';
        const btnContainer = document.querySelector('.profile-modal-body');
        if (btnContainer) btnContainer.appendChild(chatBtn);
        
        chatBtn.onclick = async () => {
            if (modal) modal.style.display = 'none';
            const chatId = await getOrCreatePrivateChat(profile.id);
            await openChat(chatId, profile.id, profile);
            showScreen('chat');
        };
    }

    if (avatarLetter) {
        if (profile.avatar_url) {
            avatarLetter.innerHTML = `<img src="${escapeHtml(profile.avatar_url)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            avatarLetter.textContent = letter;
        }
        avatarLetter.style.background = 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))';
    }
    
    if (nameView) nameView.textContent = profile.full_name || profile.username || 'Пользователь';
    if (usernameView) usernameView.textContent = `@${profile.username || 'username'}`;
    if (bioView) bioView.textContent = profile.bio || 'Пользователь пока ничего не рассказал о себе.';
    
    if (fullname) { 
        fullname.value = profile.full_name || ''; 
        fullname.readOnly = readOnly; 
    }
    if (username) {
        username.value = profile.username || '';
        // Username можно менять только если это свой профиль
        username.readOnly = readOnly;
        if (!readOnly) {
            username.disabled = false;
            username.style.opacity = '1';
            username.style.cursor = 'text';
        }
    }
    if (bio) { 
        bio.value = profile.bio || ''; 
        bio.readOnly = readOnly; 
    }
    
    if (viewMode) viewMode.style.display = 'block';
    if (editMode) editMode.style.display = 'none';
    if (editBtn) editBtn.style.display = readOnly ? 'none' : 'block';
    if (title) title.textContent = readOnly ? 'Профиль пользователя' : 'Мой профиль';
    if (saveBtn) saveBtn.style.display = readOnly ? 'none' : 'block';
    if (logoutBtn) logoutBtn.style.display = readOnly ? 'none' : 'block';

    modal.style.display = 'flex';
}

function initProfileScreen() {
    const editBtn = document.getElementById('btn-edit-profile');
    const saveBtn = document.getElementById('btn-save-profile');
    const logoutBtn = document.getElementById('btn-logout-profile');
    const backBtn = document.getElementById('btn-profile-back');
    const viewMode = document.getElementById('profile-view-mode');
    const editMode = document.getElementById('profile-edit-mode');

if (editBtn) editBtn.onclick = () => {
    if (viewMode) viewMode.style.display = 'none';
    if (editMode) editMode.style.display = 'block';
    
    const fullname = document.getElementById('profile-fullname');
    const username = document.getElementById('profile-username');
    const bio = document.getElementById('profile-bio');
    
    if (fullname && window.currentProfile) {
        fullname.value = window.currentProfile.full_name || '';
    }
    if (username && window.currentProfile) {
        username.value = window.currentProfile.username || '';
        username.disabled = false;
        username.style.opacity = '1';
        username.style.cursor = 'text';
    }
    if (bio && window.currentProfile) {
        bio.value = window.currentProfile.bio || '';
    }
};

    if (saveBtn) saveBtn.onclick = async () => {
        const fn = document.getElementById('profile-fullname')?.value.trim();
        const un = document.getElementById('profile-username')?.value.trim().replace(/^@/, '');
        const bio = document.getElementById('profile-bio')?.value.trim();
        
        if (!fn) { showToast('Введите имя', true); return; }
        if (!un) { showToast('Введите username', true); return; }
        
        try {
            const updates = { full_name: fn, username: un, bio };
            const { error } = await supabaseClient.from('profiles').update(updates).eq('id', window.currentUser.id);
            if (error) throw error;
            
            window.currentProfile.full_name = fn;
            window.currentProfile.username = un;
            window.currentProfile.bio = bio;
            
            updateProfileFooter();
            
            // Обновляем отображение в режиме просмотра
            document.getElementById('profile-name-view').textContent = fn;
            document.getElementById('profile-username-view').textContent = `@${un}`;
            document.getElementById('profile-bio-view').textContent = bio || 'Пользователь пока ничего не рассказал о себе.';
            
            showToast('Профиль сохранён');
            
            const modal = document.getElementById('profile-screen');
            if (modal) modal.style.display = 'none';
            
            if (window.lastOpenedGroupId) {
                showGroupProfile(window.lastOpenedGroupId);
                window.lastOpenedGroupId = null;
            } else {
                showScreen('chat');
            }
        } catch (err) { 
            console.error('Ошибка сохранения:', err);
            showToast('Ошибка сохранения: ' + (err.message || ''), true); 
        }
    };

    if (logoutBtn) logoutBtn.onclick = async () => {
        const ok = await modal.confirm('Выйти из аккаунта?', 'Выход');
        if (ok) {
            if (typeof stopOnlineHeartbeat === 'function') stopOnlineHeartbeat();
            await supabaseClient.auth.signOut();
            window.currentUser = null; window.currentProfile = null; window.currentChat = null;
            showScreen('login');
        }
    };

    if (backBtn) backBtn.onclick = () => {
        const modal = document.getElementById('profile-screen');
        if (modal) modal.style.display = 'none';
        
        if (window.lastOpenedGroupId) {
            showGroupProfile(window.lastOpenedGroupId);
            window.lastOpenedGroupId = null;
        } else {
            showScreen('chat');
        }
    };
}

// Остальные функции (initEmojiPicker, initImprovedMessageMenu, showMessageMenu, handleMenuAction, initSearchDialogs, initSendButton, initUserActivityTracking, updateChatStatusFromProfile, initSideMenu) остаются без изменений
// ... (вставь их сюда, они уже были в твоём ui.js)

function updateChatStatusFromProfile(profile) {
    const cs = document.querySelector('.chat-status');
    if (!cs) return;
    if (currentChat?.other_user?.id === BOT_USER_ID) { cs.textContent = 'бот'; cs.className = 'chat-status status-bot'; return; }
    if (currentChat?.id === SAVED_CHAT_ID) { cs.textContent = 'личное'; cs.className = 'chat-status'; return; }
    const status = getUserStatusFromProfile(profile);
    cs.textContent = status.text;
    cs.className = `chat-status ${status.class}`;
}

function initEmojiPicker() {
    const btn = document.getElementById('btn-emoji');
    const picker = document.getElementById('emoji-picker');
    if (!btn || !picker) return;
    btn.onclick = e => { e.stopPropagation(); picker.style.display = picker.style.display === 'flex' ? 'none' : 'flex'; };
    document.querySelectorAll('.emoji-item').forEach(emoji => {
        emoji.onclick = () => {
            const input = document.getElementById('message-input');
            if (input) { input.value += emoji.textContent; input.focus(); }
            picker.style.display = 'none';
        };
    });
    document.addEventListener('click', e => { if (!picker.contains(e.target) && e.target !== btn) picker.style.display = 'none'; });
}

function initImprovedMessageMenu() {
    const menu = document.getElementById('message-menu');
    if (!menu) return;

    let currentMsgId = null, currentMsgText = null, currentIsOwn = false;

    function hideMenu() {
        if (isMobileDevice()) {
            const sheet = document.getElementById('msg-bottom-sheet');
            if (sheet) {
                sheet.classList.remove('sheet-open');
                setTimeout(() => sheet.style.display = 'none', 280);
            }
        } else {
            menu.style.display = 'none';
            menu.classList.remove('menu-visible');
        }
        document.removeEventListener('click', hideMenuOutside);
        currentMsgId = null; currentMsgText = null; currentIsOwn = false;
    }

    function hideMenuOutside(e) {
        const sheet = document.getElementById('msg-bottom-sheet');
        if (sheet && sheet.contains(e.target)) return;
        if (menu.contains(e.target)) return;
        hideMenu();
    }

    window.showMessageMenu = function(e, msgId, msgText, isOwn) {
        e.preventDefault?.();
        e.stopPropagation?.();
        currentMsgId = msgId; currentMsgText = msgText; currentIsOwn = isOwn;

        if (isMobileDevice()) {
            showBottomSheet(msgId, msgText, isOwn, hideMenu);
            return;
        }

        menu.style.display = 'block';
        menu.querySelectorAll('.menu-item[data-action="edit"], .menu-item[data-action="delete"]').forEach(el => {
            el.style.display = isOwn ? '' : 'none';
        });

        setTimeout(() => {
            const rect = menu.getBoundingClientRect();
            const vw = window.innerWidth, vh = window.innerHeight;
            let x = e.clientX || 0, y = e.clientY || 0;
            if (x + rect.width > vw - 10) x = x - rect.width;
            if (x < 10) x = 10;
            if (y + rect.height > vh - 10) y = y - rect.height;
            if (y < 10) y = 10;
            menu.style.left = `${x}px`;
            menu.style.top = `${y}px`;
            menu.style.transform = 'none';
            menu.classList.add('menu-visible');
        }, 0);

        menu.querySelectorAll('.menu-item').forEach(item => {
            const ni = item.cloneNode(true);
            item.parentNode.replaceChild(ni, item);
            ni.onclick = e2 => {
                e2.stopPropagation();
                handleMenuAction(ni.dataset.action, currentMsgId, currentMsgText, currentIsOwn);
                hideMenu();
            };
        });

        setTimeout(() => document.addEventListener('click', hideMenuOutside), 10);
    };
}

function showBottomSheet(msgId, msgText, isOwn, onClose) {
    let sheet = document.getElementById('msg-bottom-sheet');
    if (!sheet) {
        sheet = document.createElement('div');
        sheet.id = 'msg-bottom-sheet';
        sheet.className = 'msg-bottom-sheet';
        document.body.appendChild(sheet);
    }

    sheet.innerHTML = `
        <div class="sheet-handle"></div>
        <div class="sheet-actions">
            <button class="sheet-item" data-action="reply">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10h10a8 8 0 0 1 8 8v2"/><path d="M3 10l4-4m-4 4l4 4"/></svg>
                Ответить
            </button>
            <button class="sheet-item" data-action="copy">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Копировать
            </button>
            ${isOwn ? `
            <button class="sheet-item" data-action="edit">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3l4 4-7 7H10v-4l7-7z"/><path d="M4 20h16"/></svg>
                Изменить
            </button>
            <button class="sheet-item danger" data-action="delete">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Удалить
            </button>` : ''}
        </div>
        <div class="sheet-overlay"></div>
    `;

    sheet.querySelectorAll('.sheet-item').forEach(btn => {
        btn.onclick = () => {
            handleMenuAction(btn.dataset.action, msgId, msgText, isOwn);
            onClose();
        };
    });
    sheet.querySelector('.sheet-overlay').onclick = onClose;

    sheet.style.display = 'flex';
    requestAnimationFrame(() => sheet.classList.add('sheet-open'));
}

async function handleMenuAction(action, msgId, msgText, isOwn) {
    switch (action) {
        case 'reply':
            const inp = document.getElementById('message-input');
            if (inp && currentChat?.id !== SAVED_CHAT_ID) {
                inp.value = `> ${msgText}\n\n`;
                inp.focus();
            } else showToast('Нельзя ответить', true);
            break;

        case 'copy':
            try {
                await navigator.clipboard.writeText(msgText);
            } catch {
                const ta = document.createElement('textarea');
                ta.value = msgText;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            showToast('Скопировано');
            break;

        case 'edit':
            if (!isOwn) { showToast('Можно редактировать только свои сообщения', true); return; }
            const newText = await modal.prompt('Изменить сообщение:', 'Редактирование', msgText, 'Новый текст');
            if (newText && newText.trim() && newText.trim() !== msgText) {
                try {
                    const { error } = await supabaseClient.from('messages').update({ text: newText.trim(), is_edited: true }).eq('id', msgId);
                    if (error) throw error;
                    const el = document.querySelector(`.message[data-id="${msgId}"]`);
                    if (el) {
                        el.querySelector('.text').textContent = newText.trim();
                        const time = el.querySelector('.msg-time');
                        if (time && !time.querySelector('.edited-mark')) {
                            const em = document.createElement('span');
                            em.className = 'edited-mark';
                            em.textContent = 'ред.';
                            time.insertBefore(em, time.querySelector('.read-status'));
                        }
                    }
                    if (messagesCache.has(currentChat?.id)) {
                        const idx = messagesCache.get(currentChat.id).findIndex(m => m.id === msgId);
                        if (idx !== -1) messagesCache.get(currentChat.id)[idx].text = newText.trim();
                    }
                    showToast('Сообщение изменено');
                } catch { showToast('Ошибка редактирования', true); }
            }
            break;

        case 'delete':
            if (!isOwn) return;
            const ok = await modal.confirm('Удалить сообщение?', 'Удаление');
            if (ok) {
                try {
                    const { error } = await supabaseClient.from('messages').delete().eq('id', msgId);
                    if (error) throw error;
                    document.querySelector(`.message[data-id="${msgId}"]`)?.remove();
                    if (messagesCache.has(currentChat?.id)) {
                        messagesCache.set(currentChat.id, messagesCache.get(currentChat.id).filter(m => m.id !== msgId));
                    }
                    showToast('Сообщение удалено');
                    loadDialogs();
                } catch { showToast('Ошибка удаления', true); }
            }
            break;
    }
}

function initSearchDialogs() {
    const input = document.getElementById('search-dialogs');
    if (!input) return;
    let timer;
    input.addEventListener('input', e => {
        clearTimeout(timer);
        timer = setTimeout(() => loadDialogs(e.target.value.trim()), 250);
    });
}

function initSendButton() {
    const btn = document.getElementById('btn-send-msg');
    const input = document.getElementById('message-input');
    if (btn) btn.onclick = function() {
        if (typeof window.sendMsg === 'function') {
            window.sendMsg();
        } else if (typeof sendMsg === 'function') {
            sendMsg();
        } else {
            console.error('sendMsg не определена');
        }
    };
    if (input) input.addEventListener('keydown', e => { 
        if (e.key === 'Enter' && !e.shiftKey) { 
            e.preventDefault(); 
            if (typeof window.sendMsg === 'function') {
                window.sendMsg();
            } else if (typeof sendMsg === 'function') {
                sendMsg();
            }
        } 
    });
}

function initUserActivityTracking() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            setUserOnlineStatus(true);
            if (currentChat) {
                const chatId = currentChat.id;
                markChatMessagesAsRead(chatId);
            }
        } else {
            setUserOnlineStatus(false);
        }
    });
}

function initSideMenu() {
    const menuBtn = document.getElementById('menu-btn');
    const sideMenu = document.getElementById('side-menu');
    const closeBtn = document.getElementById('close-menu-btn');
    const overlay = document.querySelector('.side-menu-overlay');
    const createGroupBtn = document.getElementById('create-group-menu-btn');
    const createChannelBtn = document.getElementById('create-channel-menu-btn');
    
    if (!menuBtn || !sideMenu) return;
    
    menuBtn.addEventListener('click', () => {
        sideMenu.classList.add('visible');
    });
    
    const closeMenu = () => {
        sideMenu.classList.remove('visible');
    };
    
    closeBtn?.addEventListener('click', closeMenu);
    overlay?.addEventListener('click', closeMenu);
    
    createGroupBtn?.addEventListener('click', () => {
        closeMenu();
        if (typeof showCreateGroupModal === 'function') {
            showCreateGroupModal();
        }
    });
    
    createChannelBtn?.addEventListener('click', () => {
        closeMenu();
        showToast('📢 Каналы скоро появятся!', false);
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sideMenu.classList.contains('visible')) {
            closeMenu();
        }
    });
}

window.updateProfileFooter = updateProfileFooter;
window.initProfileFooter = initProfileFooter;
window.openProfileModal = openProfileModal;
window.updateChatStatusFromProfile = updateChatStatusFromProfile;
window.initEmojiPicker = initEmojiPicker;
window.initImprovedMessageMenu = initImprovedMessageMenu;
window.initSearchDialogs = initSearchDialogs;
window.initSendButton = initSendButton;
window.initUserActivityTracking = initUserActivityTracking;
window.initProfileScreen = initProfileScreen;
window.handleMenuAction = handleMenuAction;
window.showBottomSheet = showBottomSheet;
window.initSideMenu = initSideMenu;
