// groups-ui.js — полный файл с контекстным меню для участников

async function showCreateGroupModal() {
    const m = document.getElementById('create-group-modal');
    if (!m) return;

    const nameInput = document.getElementById('group-name');
    const descInput = document.getElementById('group-desc');
    const membersContainer = document.getElementById('selected-members');
    const resultsContainer = document.getElementById('members-results');
    const searchInput = document.getElementById('search-members');

    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';
    if (membersContainer) membersContainer.innerHTML = '';
    if (resultsContainer) resultsContainer.innerHTML = '';
    if (searchInput) searchInput.value = '';
    window.selectedMembers = new Set();

    m.style.display = 'flex';

    if (searchInput) {
        searchInput.oninput = debounce(async e => {
            const term = e.target.value.replace(/^@/, '').trim();
            if (!resultsContainer) return;
            if (term.length < 2) { resultsContainer.innerHTML = ''; return; }
            const users = await searchUsersByUsername(term);
            displayMemberResults(users, resultsContainer, membersContainer, window.selectedMembers);
        }, 300);
    }

    const confirmBtn = document.getElementById('confirm-create-group');
    if (confirmBtn) {
        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
        newBtn.onclick = async () => {
            const name = nameInput?.value.trim();
            const desc = descInput?.value.trim();
            const members = Array.from(window.selectedMembers || []);
            if (!name) { showToast('Введите название группы', true); return; }
            newBtn.disabled = true;
            newBtn.textContent = 'Создание...';
            await groupManager.createGroup(name, desc, members);
            newBtn.disabled = false;
            newBtn.textContent = 'Создать';
        };
    }

    const cancelBtn = document.getElementById('cancel-group');
    if (cancelBtn) cancelBtn.onclick = () => m.style.display = 'none';
    m.querySelectorAll('.close-modal, .custom-modal-overlay').forEach(el => {
        if (el) el.onclick = () => m.style.display = 'none';
    });
}

function displayMemberResults(users, results, selected, setRef) {
    if (!results) return;
    if (!users.length) { results.innerHTML = '<div class="search-empty">Не найдено</div>'; return; }

    results.innerHTML = users
        .filter(u => !setRef.has(u.id))
        .map(u => `
        <div class="search-result-item" data-user-id="${u.id}" data-user-name="${escapeHtml(u.full_name || u.username)}">
            <div class="result-avatar" style="background: linear-gradient(135deg, var(--accent-blue), var(--accent-cyan));">${(u.full_name || u.username || '?')[0].toUpperCase()}</div>
            <div class="result-info">
                <div class="result-name">${escapeHtml(u.full_name || u.username)}</div>
                <div class="result-username">@${escapeHtml(u.username)}</div>
            </div>
            <button class="add-member-btn">Добавить</button>
        </div>
    `).join('');

    results.querySelectorAll('.add-member-btn').forEach(btn => {
        btn.onclick = () => {
            const item = btn.closest('.search-result-item');
            const uid = item.dataset.userId;
            const uname = item.dataset.userName;
            if (setRef.has(uid)) return;
            setRef.add(uid);
            if (!selected) return;
            const tag = document.createElement('div');
            tag.className = 'selected-member-tag';
            tag.innerHTML = `<span>${escapeHtml(uname)}</span><button class="remove-member" data-uid="${uid}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
            tag.querySelector('.remove-member').onclick = () => { tag.remove(); setRef.delete(uid); };
            selected.appendChild(tag);
            item.remove();
        };
    });
}

async function showGroupProfile(groupId) {
    const m = document.getElementById('group-profile-modal');
    if (!m) {
        console.error('Modal element not found');
        return;
    }
    
    if (!groupManager || typeof groupManager.getGroupInfo !== 'function') {
        console.error('groupManager not initialized');
        showToast('Ошибка: группа не загружена', true);
        return;
    }
    
    m.style.display = 'flex';
    m.dataset.groupId = groupId;

    const membersList = document.getElementById('group-members-list');
    if (membersList) membersList.innerHTML = '<div class="loading-members">Загрузка...</div>';

    try {
        const group = await groupManager.getGroupInfo(groupId);
        if (!group) { 
            showToast('Не удалось загрузить группу', true); 
            m.style.display = 'none'; 
            return; 
        }

        const titleEl = document.getElementById('group-profile-title');
        const nameEl = m.querySelector('.group-name-display');
        const descEl = m.querySelector('.group-description');
        const countEl = document.getElementById('member-count');
        const dateEl = document.getElementById('created-date');

        if (titleEl) titleEl.textContent = group.name;
        if (nameEl) nameEl.textContent = group.name;
        if (descEl) descEl.textContent = group.description || 'Нет описания';
        if (countEl) countEl.textContent = group.member_count;
        if (dateEl) dateEl.textContent = new Date(group.created_at).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' });

        const myRole = group.members?.find(m2 => m2.user_id === currentUser?.id)?.role;
        const isAdmin = myRole === 'admin';
        const isMod = myRole === 'moderator';
        const roleNames = { admin: 'Администратор', moderator: 'Модератор', member: 'Участник' };

        if (membersList) {
            membersList.innerHTML = (group.members || []).map(member => {
                const status = getUserStatusFromProfile(member.profile || {});
                const roleName = roleNames[member.role] || 'Участник';
                return `
                <div class="member-item" data-user-id="${member.user_id}" data-role="${member.role}" data-username="${member.profile?.username || ''}" data-fullname="${escapeHtml(member.profile?.full_name || member.profile?.username || 'Пользователь')}">
                    <div class="member-avatar" style="background: linear-gradient(135deg, var(--accent-blue), var(--accent-cyan));">
                        ${(member.profile?.full_name || member.profile?.username || '?')[0].toUpperCase()}
                        <div class="member-online-dot ${status.isOnline ? 'online' : ''}"></div>
                    </div>
                    <div class="member-info">
                        <div class="member-name">${escapeHtml(member.profile?.full_name || member.profile?.username || 'Пользователь')}</div>
                        <div class="member-username">@${escapeHtml(member.profile?.username || '')}</div>
                        ${member.profile?.bio ? `<div class="member-bio">${escapeHtml(member.profile.bio.substring(0, 50))}${member.profile.bio.length > 50 ? '...' : ''}</div>` : ''}
                    </div>
                    <div class="member-role ${member.role}">${roleName}</div>
                </div>`;
            }).join('');

            // Добавляем клик по участнику для открытия профиля
            membersList.querySelectorAll('.member-item').forEach(item => {
                const userId = item.dataset.userId;
                const userRole = item.dataset.role;
                const username = item.dataset.username;
                const fullname = item.dataset.fullname;
                const isCurrentUser = userId === currentUser?.id;
                const isCreator = group.created_by === currentUser?.id;
                
                // Клик по аватарке или всей строке - открываем профиль
                const avatar = item.querySelector('.member-avatar');
                const info = item.querySelector('.member-info');
                const openProfileHandler = (e) => {
                    e.stopPropagation();
                    const profile = {
                        id: userId,
                        full_name: fullname,
                        username: username,
                        bio: member.profile?.bio || ''
                    };
                    openProfileModal(profile, { 
                        readOnly: true,
                        fromGroup: true,
                        groupId: groupId,
                        groupName: group.name
                    });
                };
                if (avatar) avatar.style.cursor = 'pointer';
                if (avatar) avatar.onclick = openProfileHandler;
                if (info) info.style.cursor = 'pointer';
                if (info) info.onclick = openProfileHandler;
                
                // Контекстное меню только для админа и не для себя
                if (isAdmin && !isCurrentUser) {
                    attachMemberContextMenu(item, groupId, userId, userRole, fullname);
                }
            });
        }

        const addBtn = document.getElementById('add-member-btn');
        if (addBtn) {
            addBtn.style.display = (isAdmin || isMod) ? 'inline-flex' : 'none';
            addBtn.innerHTML = `<svg width="14" height="14"><use href="#icon-plus"/></svg>`;
            addBtn.onclick = () => showAddMembersToGroup(groupId);
        }

        let editBtn = document.getElementById('edit-group-btn');
        if (isAdmin || isMod) {
            if (!editBtn) {
                editBtn = document.createElement('button');
                editBtn.id = 'edit-group-btn';
                editBtn.className = 'glass-button';
                editBtn.innerHTML = `<svg width="16" height="16" style="margin-right: 8px;"><use href="#icon-edit"/></svg>Редактировать`;
                const footer = m.querySelector('.custom-modal-footer');
                const leaveBtn = document.getElementById('leave-group-btn');
                if (footer && leaveBtn) footer.insertBefore(editBtn, leaveBtn);
            }
            editBtn.onclick = () => showEditGroupModal(groupId, group);
            editBtn.style.display = 'flex';
        } else if (editBtn) {
            editBtn.style.display = 'none';
        }

        const leaveBtn = document.getElementById('leave-group-btn');
        if (leaveBtn) {
            leaveBtn.innerHTML = `<svg width="16" height="16" style="margin-right: 8px;"><use href="#icon-logout"/></svg>Покинуть группу`;
            leaveBtn.onclick = async () => {
                const confirmed = await window.modal.confirm('Покинуть группу?', 'Выход из группы');
                if (confirmed) { await groupManager.leaveGroup(groupId); m.style.display = 'none'; }
            };
        }

        const closeBtn = document.getElementById('close-group-profile');
        const overlay = m.querySelector('.custom-modal-overlay');
        [closeBtn, overlay].forEach(el => { if (el) el.onclick = () => m.style.display = 'none'; });
        
    } catch (error) {
        console.error('showGroupProfile error:', error);
        showToast('Ошибка загрузки группы', true);
        m.style.display = 'none';
    }
}

function attachMemberContextMenu(element, groupId, userId, currentRole, fullname) {
    // ПКМ
    element.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showMemberContextMenu(e, groupId, userId, currentRole, fullname);
        return false;
    };
    
    // Долгое нажатие на мобильных
    let touchTimer = null;
    element.addEventListener('touchstart', (e) => {
        touchTimer = setTimeout(() => {
            if (window.navigator.vibrate) window.navigator.vibrate(40);
            showMemberContextMenu(e, groupId, userId, currentRole, fullname);
            touchTimer = null;
        }, 500);
    });
    element.addEventListener('touchend', () => {
        if (touchTimer) {
            clearTimeout(touchTimer);
            touchTimer = null;
        }
    });
    element.addEventListener('touchmove', () => {
        if (touchTimer) {
            clearTimeout(touchTimer);
            touchTimer = null;
        }
    });
}

async function showMemberContextMenu(event, groupId, userId, currentRole, fullname) {
    let menu = document.getElementById('member-context-menu');
    if (!menu) {
        const menuHTML = `
            <div id="member-context-menu" class="message-menu" style="display: none;">
                <div class="menu-item" data-action="promote-moderator">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2l3 6h6l-5 4 2 6-6-4-6 4 2-6-5-4h6z"/>
                    </svg>
                    <span>Назначить модератором</span>
                </div>
                <div class="menu-item" data-action="promote-admin">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/>
                    </svg>
                    <span>Назначить администратором</span>
                </div>
                <div class="menu-item danger" data-action="demote">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2l3 6h6l-5 4 2 6-6-4-6 4 2-6-5-4h6z"/>
                        <line x1="4" y1="14" x2="20" y2="14"/>
                    </svg>
                    <span>Снять права</span>
                </div>
                <div class="menu-item danger" data-action="remove">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    <span>Удалить из группы</span>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', menuHTML);
        menu = document.getElementById('member-context-menu');
    }
    
    // Позиционируем меню
    const x = event.clientX || (event.touches ? event.touches[0].clientX : 0);
    const y = event.clientY || (event.touches ? event.touches[0].clientY : 0);
    
    if (isMobileDevice()) {
        menu.style.position = 'fixed';
        menu.style.bottom = '0';
        menu.style.left = '0';
        menu.style.right = '0';
        menu.style.top = 'auto';
        menu.style.transform = 'translateY(100%)';
        menu.style.borderRadius = '20px 20px 0 0';
        menu.style.maxWidth = 'none';
        menu.style.width = '100%';
        menu.style.display = 'block';
        setTimeout(() => menu.classList.add('menu-visible'), 10);
    } else {
        menu.style.display = 'block';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.style.transform = 'none';
        menu.style.bottom = 'auto';
        menu.style.right = 'auto';
        menu.classList.add('menu-visible');
    }
    
    // Настраиваем видимость пунктов в зависимости от текущей роли
    const promoteModerator = menu.querySelector('[data-action="promote-moderator"]');
    const promoteAdmin = menu.querySelector('[data-action="promote-admin"]');
    const demoteBtn = menu.querySelector('[data-action="demote"]');
    
    if (currentRole === 'admin') {
        promoteModerator.style.display = 'none';
        promoteAdmin.style.display = 'none';
        demoteBtn.style.display = 'flex';
    } else if (currentRole === 'moderator') {
        promoteModerator.style.display = 'none';
        promoteAdmin.style.display = 'flex';
        demoteBtn.style.display = 'flex';
    } else {
        promoteModerator.style.display = 'flex';
        promoteAdmin.style.display = 'flex';
        demoteBtn.style.display = 'none';
    }
    
    const closeMenu = () => {
        if (isMobileDevice()) {
            menu.classList.remove('menu-visible');
            setTimeout(() => menu.style.display = 'none', 280);
        } else {
            menu.style.display = 'none';
            menu.classList.remove('menu-visible');
        }
        document.removeEventListener('click', closeMenu);
    };
    
    const handleAction = async (e) => {
        const action = e.currentTarget.dataset.action;
        closeMenu();
        
        if (action === 'promote-moderator') {
            const confirmed = await window.modal.confirm(`Назначить ${fullname} модератором?`, 'Подтверждение');
            if (confirmed) {
                await groupManager.setRole(groupId, userId, 'moderator');
                showGroupProfile(groupId);
            }
        } else if (action === 'promote-admin') {
            const confirmed = await window.modal.confirm(`Назначить ${fullname} администратором?`, 'Подтверждение');
            if (confirmed) {
                await groupManager.setRole(groupId, userId, 'admin');
                showGroupProfile(groupId);
            }
        } else if (action === 'demote') {
            const confirmed = await window.modal.confirm(`Снять права с ${fullname}?`, 'Подтверждение');
            if (confirmed) {
                await groupManager.setRole(groupId, userId, 'member');
                showGroupProfile(groupId);
            }
        } else if (action === 'remove') {
            const confirmed = await window.modal.confirm(`Удалить ${fullname} из группы?`, 'Подтверждение');
            if (confirmed) {
                await groupManager.removeMember(groupId, userId);
                showGroupProfile(groupId);
            }
        }
    };
    
    menu.querySelectorAll('.menu-item').forEach(item => {
        item.removeEventListener('click', handleAction);
        item.addEventListener('click', handleAction);
    });
    
    setTimeout(() => document.addEventListener('click', closeMenu), 10);
}

async function showAddMembersToGroup(groupId) {
    const m = document.getElementById('add-members-modal');
    if (!m) return;
    m.style.display = 'flex';

    const searchInput = document.getElementById('add-members-search');
    const resultsDiv = document.getElementById('add-members-results');
    const selectedDiv = document.getElementById('add-members-selected');
    if (searchInput) searchInput.value = '';
    if (resultsDiv) resultsDiv.innerHTML = '';
    if (selectedDiv) selectedDiv.innerHTML = '';
    window.pendingMembers = new Set();

    if (searchInput) {
        searchInput.oninput = debounce(async e => {
            if (!resultsDiv) return;
            const term = e.target.value.trim();
            if (term.length < 2) { resultsDiv.innerHTML = ''; return; }
            const users = await groupManager.searchUsersForGroup(term, groupId);
            displayMemberResults(users, resultsDiv, selectedDiv, window.pendingMembers);
        }, 300);
    }

    const confirmBtn = document.getElementById('confirm-add-members');
    if (confirmBtn) {
        const nb = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(nb, confirmBtn);
        nb.onclick = async () => {
            const members = Array.from(window.pendingMembers);
            if (!members.length) { showToast('Выберите участников', true); return; }
            nb.disabled = true;
            nb.textContent = 'Добавление...';
            await groupManager.addMembers(groupId, members);
            nb.disabled = false;
            nb.textContent = 'Добавить';
            m.style.display = 'none';
            showGroupProfile(groupId);
        };
    }

    const cancelBtn = document.getElementById('cancel-add-members');
    if (cancelBtn) cancelBtn.onclick = () => m.style.display = 'none';
    m.querySelectorAll('.custom-modal-close, .custom-modal-overlay').forEach(el => {
        if (el) el.onclick = () => m.style.display = 'none';
    });
}

async function showEditGroupModal(groupId, group) {
    const m = document.getElementById('edit-group-modal');
    if (!m) {
        const modalHTML = `
            <div id="edit-group-modal" class="custom-modal" style="display:none;">
                <div class="custom-modal-overlay"></div>
                <div class="custom-modal-container">
                    <div class="custom-modal-header">
                        <h3 class="custom-modal-title">Редактировать группу</h3>
                        <button class="custom-modal-close">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                    <div class="custom-modal-body">
                        <label class="profile-label">Название группы</label>
                        <input type="text" id="edit-group-name" class="glass-input" placeholder="Название" maxlength="50">
                        <label class="profile-label">Описание</label>
                        <textarea id="edit-group-desc" class="glass-input" placeholder="Описание группы" rows="3" maxlength="200"></textarea>
                    </div>
                    <div class="custom-modal-footer">
                        <button id="cancel-edit-group" class="glass-button">Отмена</button>
                        <button id="confirm-edit-group" class="glass-button primary">Сохранить</button>
                        <button id="delete-group-btn" class="glass-button danger">Удалить группу</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    const modal = document.getElementById('edit-group-modal');
    modal.style.display = 'flex';

    const nameInput = document.getElementById('edit-group-name');
    const descInput = document.getElementById('edit-group-desc');
    if (nameInput) nameInput.value = group.name;
    if (descInput) descInput.value = group.description || '';

    const confirmBtn = document.getElementById('confirm-edit-group');
    if (confirmBtn) {
        const nb = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(nb, confirmBtn);
        nb.onclick = async () => {
            const name = nameInput?.value.trim();
            const description = descInput?.value.trim();
            if (!name) { showToast('Введите название', true); return; }
            nb.disabled = true;
            nb.textContent = 'Сохранение...';
            await groupManager.updateGroupInfo(groupId, { name, description });
            nb.disabled = false;
            nb.textContent = 'Сохранить';
            modal.style.display = 'none';
            showGroupProfile(groupId);
        };
    }

    const cancelBtn = document.getElementById('cancel-edit-group');
    if (cancelBtn) cancelBtn.onclick = () => modal.style.display = 'none';

    const deleteBtn = document.getElementById('delete-group-btn');
    if (deleteBtn) {
        const nd = deleteBtn.cloneNode(true);
        deleteBtn.parentNode.replaceChild(nd, deleteBtn);
        nd.onclick = async () => {
            const confirmed = await window.modal.confirm('Удалить группу безвозвратно?', 'Удаление группы');
            if (confirmed) {
                nd.disabled = true;
                nd.textContent = 'Удаление...';
                await groupManager.deleteGroup(groupId);
                nd.disabled = false;
                nd.textContent = 'Удалить группу';
                modal.style.display = 'none';
                document.getElementById('group-profile-modal')?.style.setProperty('display', 'none');
            }
        };
    }

    modal.querySelectorAll('.custom-modal-close, .custom-modal-overlay').forEach(el => {
        if (el) el.onclick = () => modal.style.display = 'none';
    });
}

window.showCreateGroupModal = showCreateGroupModal;
window.showGroupProfile = showGroupProfile;
window.showAddMembersToGroup = showAddMembersToGroup;
window.showEditGroupModal = showEditGroupModal;
window.displayMemberResults = displayMemberResults;
