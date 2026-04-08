// groups-ui.js — UI для групп

async function showCreateGroupModal() {
    const m = document.getElementById('create-group-modal');
    if (!m) return;

    // Сброс полей
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

    // Поиск участников
    if (searchInput) {
        searchInput.oninput = debounce(async e => {
            const term = e.target.value.replace(/^@/, '').trim();
            if (!resultsContainer) return;
            if (term.length < 2) { resultsContainer.innerHTML = ''; return; }
            const users = await searchUsersByUsername(term);
            _displayMemberResults(users, resultsContainer, membersContainer, window.selectedMembers);
        }, 300);
    }

    // Кнопка «Создать»
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
    m.querySelector('.close-modal')?.addEventListener('click', () => m.style.display = 'none');
    m.querySelector('.custom-modal-overlay')?.addEventListener('click', () => m.style.display = 'none');
}

function _displayMemberResults(users, results, selected, setRef) {
    if (!results) return;
    if (!users.length) { results.innerHTML = '<div class="search-empty">Не найдено</div>'; return; }

    results.innerHTML = users
        .filter(u => !setRef.has(u.id))
        .map(u => `
        <div class="search-result-item" data-user-id="${u.id}" data-user-name="${escapeHtml(u.full_name || u.username)}">
            <div class="result-avatar">${(u.full_name || u.username)[0].toUpperCase()}</div>
            <div class="result-info">
                <div class="result-name">${escapeHtml(u.full_name || u.username)}</div>
                <div class="result-username">@${escapeHtml(u.username)}</div>
            </div>
            <button class="add-member-btn glass-button-small">Добавить</button>
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
    if (!m) return;
    m.style.display = 'flex';
    m.dataset.groupId = groupId;

    const membersList = document.getElementById('group-members-list');
    if (membersList) membersList.innerHTML = '<div class="loading-members">Загрузка...</div>';

    const group = await groupManager.getGroupInfo(groupId);
    if (!group) { showToast('Не удалось загрузить группу', true); m.style.display = 'none'; return; }

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

    const myRole = group.members?.find(m2 => m2.user_id === currentUser.id)?.role;
    const isAdmin = myRole === 'admin';
    const isMod = myRole === 'moderator';
    const roleNames = { admin: 'Админ', moderator: 'Мод', member: 'Участник' };

    if (membersList) {
        membersList.innerHTML = (group.members || []).map(member => {
            const canManage = isAdmin && member.user_id !== group.created_by && member.user_id !== currentUser.id;
            const statusDot = getUserStatusFromProfile(member.profile || {});
            return `
            <div class="member-item" data-user-id="${member.user_id}">
                <div class="member-avatar">
                    ${(member.profile?.full_name || member.profile?.username || '?')[0].toUpperCase()}
                    <div class="member-online-dot ${statusDot.isOnline ? 'online' : ''}"></div>
                </div>
                <div class="member-info">
                    <div class="member-name">${escapeHtml(member.profile?.full_name || member.profile?.username || 'Пользователь')}</div>
                    <div class="member-username">@${escapeHtml(member.profile?.username || '')}</div>
                </div>
                <div class="member-role ${member.role}">${roleNames[member.role]}</div>
                ${canManage ? `
                <div class="member-actions">
                    ${member.role !== 'moderator' ? `<button class="promote-btn" data-uid="${member.user_id}" data-role="moderator">Мод</button>` : ''}
                    ${member.role !== 'admin' ? `<button class="promote-btn" data-uid="${member.user_id}" data-role="admin">Админ</button>` : ''}
                    <button class="remove-member-btn danger-btn" data-uid="${member.user_id}">✕</button>
                </div>` : ''}
            </div>`;
        }).join('');

        if (isAdmin) {
            membersList.querySelectorAll('.promote-btn').forEach(btn => {
                btn.onclick = async () => {
                    await groupManager.setRole(groupId, btn.dataset.uid, btn.dataset.role);
                    showGroupProfile(groupId);
                };
            });
            membersList.querySelectorAll('.remove-member-btn').forEach(btn => {
                btn.onclick = async () => {
                    const confirmed = await window.modal.confirm('Удалить участника из группы?', 'Подтверждение');
                    if (confirmed) {
                        await groupManager.removeMember(groupId, btn.dataset.uid);
                        showGroupProfile(groupId);
                    }
                };
            });
        }
    }

    // Добавить участника
    const addBtn = document.getElementById('add-member-btn');
    if (addBtn) {
        addBtn.style.display = (isAdmin || isMod) ? '' : 'none';
        addBtn.onclick = () => showAddMembersToGroup(groupId);
    }

    // Покинуть
    const leaveBtn = document.getElementById('leave-group-btn');
    if (leaveBtn) {
        leaveBtn.onclick = async () => {
            const confirmed = await window.modal.confirm('Покинуть группу?', 'Выход из группы');
            if (confirmed) { await groupManager.leaveGroup(groupId); m.style.display = 'none'; }
        };
    }

    // Редактировать (только для админа)
    let editBtn = document.getElementById('edit-group-btn');
    if (isAdmin) {
        if (!editBtn) {
            editBtn = document.createElement('button');
            editBtn.id = 'edit-group-btn';
            editBtn.className = 'glass-button';
            editBtn.textContent = 'Редактировать';
            const footer = m.querySelector('.custom-modal-footer');
            if (footer && leaveBtn) footer.insertBefore(editBtn, leaveBtn);
        }
        editBtn.onclick = () => showEditGroupModal(groupId, group);
    } else if (editBtn) {
        editBtn.remove();
    }

    // Закрытие
    const close1 = m.querySelector('.close-group-modal');
    const close2 = document.getElementById('close-group-profile');
    const overlay = m.querySelector('.custom-modal-overlay');
    [close1, close2, overlay].forEach(el => { if (el) el.onclick = () => m.style.display = 'none'; });
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
            _displayMemberResults(users, resultsDiv, selectedDiv, window.pendingMembers);
        }, 300);
    }

    const confirmBtn = document.getElementById('confirm-add-members');
    if (confirmBtn) {
        const nb = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(nb, confirmBtn);
        nb.onclick = async () => {
            const members = Array.from(window.pendingMembers);
            if (!members.length) { showToast('Выберите участников', true); return; }
            await groupManager.addMembers(groupId, members);
            m.style.display = 'none';
            showGroupProfile(groupId);
        };
    }

    const cancelBtn = document.getElementById('cancel-add-members');
    if (cancelBtn) cancelBtn.onclick = () => m.style.display = 'none';
    m.querySelector('.custom-modal-close')?.addEventListener('click', () => m.style.display = 'none');
    m.querySelector('.custom-modal-overlay')?.addEventListener('click', () => m.style.display = 'none');
}

function showEditGroupModal(groupId, group) {
    const m = document.getElementById('edit-group-modal');
    if (!m) return;
    m.style.display = 'flex';

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
            await groupManager.updateGroupInfo(groupId, { name, description });
            m.style.display = 'none';
            showGroupProfile(groupId);
        };
    }

    const cancelBtn = document.getElementById('cancel-edit-group');
    if (cancelBtn) cancelBtn.onclick = () => m.style.display = 'none';

    const deleteBtn = document.getElementById('delete-group-btn');
    if (deleteBtn) {
        const nd = deleteBtn.cloneNode(true);
        deleteBtn.parentNode.replaceChild(nd, deleteBtn);
        nd.onclick = async () => {
            const confirmed = await window.modal.confirm('Удалить группу безвозвратно?', 'Удаление группы');
            if (confirmed) {
                await groupManager.deleteGroup(groupId);
                m.style.display = 'none';
                document.getElementById('group-profile-modal')?.style.setProperty('display', 'none');
            }
        };
    }

    m.querySelector('.custom-modal-close')?.addEventListener('click', () => m.style.display = 'none');
    m.querySelector('.custom-modal-overlay')?.addEventListener('click', () => m.style.display = 'none');
}

window.showCreateGroupModal = showCreateGroupModal;
window.showGroupProfile = showGroupProfile;
window.showAddMembersToGroup = showAddMembersToGroup;
window.showEditGroupModal = showEditGroupModal;
