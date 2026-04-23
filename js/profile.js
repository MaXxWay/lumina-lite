// profile.js — управление аватарами и профилем (ПОЛНАЯ ВЕРСИЯ С КНОПКОЙ ЗАГРУЗКИ)

async function uploadAvatar(file) {
    if (!file || !currentUser) return null;
    
    try {
        // Проверка размера (5MB)
        if (file.size > 5 * 1024 * 1024) {
            showToast('Файл слишком большой (макс 5MB)', true);
            return null;
        }
        
        // Проверка типа
        if (!file.type.startsWith('image/')) {
            showToast('Можно загружать только изображения', true);
            return null;
        }
        
        showToast('Загрузка аватара...', false);
        
        // Оптимизация изображения
        const optimizedFile = await optimizeImage(file);
        
        // Путь: avatars/[user_id]/[timestamp].[ext]
        const fileExt = file.name.split('.').pop();
        const fileName = `${currentUser.id}/${Date.now()}.${fileExt}`;
        
        console.log('Загрузка аватара:', fileName);
        
        // Загрузка в Storage
        const { data, error } = await supabaseClient.storage
            .from('avatars')
            .upload(fileName, optimizedFile, {
                cacheControl: '3600',
                upsert: true
            });
            
        if (error) {
            console.error('Ошибка загрузки в Storage:', error);
            showToast('Ошибка: ' + error.message, true);
            throw error;
        }
        
        // Получение публичного URL
        const { data: { publicUrl } } = supabaseClient.storage
            .from('avatars')
            .getPublicUrl(fileName);
            
        console.log('Public URL:', publicUrl);
        
        // Обновление профиля
        const { error: updateError } = await supabaseClient
            .from('profiles')
            .update({ 
                avatar_url: publicUrl
            })
            .eq('id', currentUser.id);
            
        if (updateError) {
            console.error('Ошибка обновления профиля:', updateError);
            throw updateError;
        }
        
        // Удаление старого аватара
        if (currentProfile?.avatar_url) {
            try {
                const oldPath = currentProfile.avatar_url.split('/').pop();
                if (oldPath && oldPath.includes(currentUser.id)) {
                    await supabaseClient.storage
                        .from('avatars')
                        .remove([`${currentUser.id}/${oldPath}`]);
                }
            } catch (e) {
                console.warn('Не удалось удалить старый аватар:', e);
            }
        }
        
        // Обновление локального профиля
        currentProfile.avatar_url = publicUrl;
        updateAllAvatars();
        
        showToast('Аватар обновлен!');
        return publicUrl;
        
    } catch (error) {
        console.error('Ошибка загрузки аватара:', error);
        showToast('Ошибка загрузки аватара: ' + (error.message || 'Неизвестная ошибка'), true);
        return null;
    }
}

async function optimizeImage(file) {
    return new Promise((resolve) => {
        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        img.onload = () => {
            const MAX_SIZE = 400;
            let width = img.width;
            let height = img.height;
            
            if (width > height) {
                if (width > MAX_SIZE) {
                    height = Math.round(height * MAX_SIZE / width);
                    width = MAX_SIZE;
                }
            } else {
                if (height > MAX_SIZE) {
                    width = Math.round(width * MAX_SIZE / height);
                    height = MAX_SIZE;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/jpeg', 0.85);
        };
        
        img.src = URL.createObjectURL(file);
    });
}

function updateAllAvatars() {
    if (!window.currentProfile) return;
    
    const avatarUrl = window.currentProfile.avatar_url;
    const name = window.currentProfile.full_name || window.currentProfile.username || '?';
    const letter = name.charAt(0).toUpperCase();
    
    // Обновляем аватар в боковом меню
    const menuAvatar = document.getElementById('side-menu-avatar');
    if (menuAvatar) {
        if (avatarUrl) {
            menuAvatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            menuAvatar.textContent = letter;
            menuAvatar.style.background = 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))';
        }
    }
    
    // Обновляем аватар в модальном окне профиля
    const profileAvatar = document.getElementById('profile-avatar-letter');
    if (profileAvatar) {
        if (avatarUrl) {
            profileAvatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            profileAvatar.textContent = letter;
            profileAvatar.style.background = 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))';
        }
    }
    
    // Обновляем аватар в шапке чата (если это наш профиль)
    const chatAvatar = document.getElementById('chat-user-avatar');
    if (chatAvatar && currentChat?.other_user?.id === currentUser.id) {
        if (avatarUrl) {
            chatAvatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            chatAvatar.textContent = letter;
            chatAvatar.style.background = 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))';
        }
    }
    
    // Обновляем аватары в своих сообщениях
    document.querySelectorAll('.message.own .msg-avatar').forEach(avatar => {
        if (avatarUrl) {
            avatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            avatar.textContent = letter;
            avatar.style.background = 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))';
        }
    });
}

async function removeAvatar() {
    if (!currentUser || !currentProfile?.avatar_url) return;
    
    const confirmed = await modal.confirm('Удалить аватар?', 'Подтверждение');
    if (!confirmed) return;
    
    try {
        const oldPath = currentProfile.avatar_url.split('/').pop();
        if (oldPath && oldPath.includes(currentUser.id)) {
            await supabaseClient.storage
                .from('avatars')
                .remove([`${currentUser.id}/${oldPath}`]);
        }
        
        await supabaseClient
            .from('profiles')
            .update({ 
                avatar_url: null
            })
            .eq('id', currentUser.id);
            
        currentProfile.avatar_url = null;
        updateAllAvatars();
        
        showToast('Аватар удален');
    } catch (error) {
        console.error('Ошибка удаления аватара:', error);
        showToast('Ошибка удаления аватара', true);
    }
}

// ОСНОВНАЯ ФУНКЦИЯ СОХРАНЕНИЯ ПРОФИЛЯ
async function saveProfile() {
    const fn = document.getElementById('profile-fullname')?.value.trim();
    const un = document.getElementById('profile-username')?.value.trim().replace(/^@/, '');
    const bioText = document.getElementById('profile-bio')?.value.trim();
    
    if (!fn) { 
        showToast('Введите имя', true); 
        return false;
    }
    if (!un) { 
        showToast('Введите username', true); 
        return false;
    }
    
    const saveBtn = document.getElementById('btn-save-profile');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Сохранение...';
    }
    
    try {
        console.log('Сохраняем профиль:', { full_name: fn, username: un, bio: bioText });
        
        const { data, error } = await supabaseClient
            .from('profiles')
            .update({ 
                full_name: fn, 
                username: un, 
                bio: bioText || ''
            })
            .eq('id', window.currentUser.id)
            .select();
        
        if (error) {
            console.error('Ошибка Supabase:', error);
            throw error;
        }
        
        console.log('Профиль сохранен:', data);
        
        if (data && data[0]) {
            window.currentProfile = data[0];
        } else {
            window.currentProfile.full_name = fn;
            window.currentProfile.username = un;
            window.currentProfile.bio = bioText || '';
        }
        
        if (typeof updateProfileFooter === 'function') {
            updateProfileFooter();
        }
        
        const nameView = document.getElementById('profile-name-view');
        const usernameView = document.getElementById('profile-username-view');
        const bioView = document.getElementById('profile-bio-view');
        
        if (nameView) nameView.textContent = fn;
        if (usernameView) usernameView.textContent = `@${un}`;
        if (bioView) bioView.textContent = bioText || 'Пользователь пока ничего не рассказал о себе.';
        
        const badge = document.getElementById('current-user-badge');
        if (badge) badge.textContent = fn;
        
        showToast('Профиль сохранён');
        
        const modal = document.getElementById('profile-screen');
        if (modal) modal.style.display = 'none';
        
        if (window.lastOpenedGroupId) {
            if (typeof showGroupProfile === 'function') {
                showGroupProfile(window.lastOpenedGroupId);
            }
            window.lastOpenedGroupId = null;
        }
        
        return true;
        
    } catch (err) { 
        console.error('Ошибка сохранения:', err);
        showToast('Ошибка сохранения: ' + (err.message || 'Неизвестная ошибка'), true);
        return false;
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Сохранить';
        }
    }
}

function openProfileModal(profile = window.currentProfile, options = {}) {
    if (!profile) {
        profile = window.currentProfile;
        if (!profile) return;
    }
    
    const isOwnProfile = profile.id === window.currentUser?.id;
    const readOnly = options.readOnly === true || !isOwnProfile;
    const fromGroup = options.fromGroup === true;
    const letter = (profile.full_name || profile.username || '?').charAt(0).toUpperCase();

    const modal = document.getElementById('profile-screen');
    if (!modal) return;
    
    const avatarContainer = document.getElementById('profile-avatar-container');
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
    const cancelBtn = document.getElementById('btn-cancel-edit-profile');
    
    // Удаляем старую кнопку чата если есть
    const oldChatBtn = document.getElementById('profile-chat-btn');
    if (oldChatBtn) oldChatBtn.remove();
    
    // Добавляем кнопку чата для чужих профилей
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

    // Заполняем данные
    if (avatarContainer) {
        avatarContainer.innerHTML = '';
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'profile-avatar-big';
        avatarDiv.style.background = 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))';
        avatarDiv.style.display = 'flex';
        avatarDiv.style.alignItems = 'center';
        avatarDiv.style.justifyContent = 'center';
        
        if (profile.avatar_url) {
            avatarDiv.innerHTML = `<img src="${escapeHtml(profile.avatar_url)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            avatarDiv.textContent = letter;
        }
        avatarContainer.appendChild(avatarDiv);
    }
    
    if (nameView) nameView.textContent = profile.full_name || profile.username || 'Пользователь';
    if (usernameView) usernameView.textContent = `@${profile.username || 'username'}`;
    if (bioView) bioView.textContent = profile.bio || 'Пользователь пока ничего не рассказал о себе.';
    
    if (fullname) fullname.value = profile.full_name || '';
    if (username) username.value = profile.username || '';
    if (bio) bio.value = profile.bio || '';
    
    // Настройка режима
    if (viewMode) viewMode.style.display = 'block';
    if (editMode) editMode.style.display = 'none';
    if (editBtn) editBtn.style.display = readOnly ? 'none' : 'block';
    if (saveBtn) saveBtn.style.display = readOnly ? 'none' : 'block';
    if (cancelBtn) cancelBtn.style.display = readOnly ? 'none' : 'block';
    if (title) title.textContent = readOnly ? 'Профиль пользователя' : 'Мой профиль';

    modal.style.display = 'flex';
}

function initProfileScreen() {
    const editBtn = document.getElementById('btn-edit-profile');
    const saveBtn = document.getElementById('btn-save-profile');
    const cancelBtn = document.getElementById('btn-cancel-edit-profile');
    const backBtn = document.getElementById('btn-profile-back');
    const viewMode = document.getElementById('profile-view-mode');
    const editMode = document.getElementById('profile-edit-mode');

    if (editBtn) {
        const newEditBtn = editBtn.cloneNode(true);
        editBtn.parentNode.replaceChild(newEditBtn, editBtn);
        newEditBtn.onclick = () => {
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
            }
            if (bio && window.currentProfile) {
                bio.value = window.currentProfile.bio || '';
            }
        };
    }

    if (saveBtn) {
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        newSaveBtn.onclick = saveProfile;
    }

    if (cancelBtn) {
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        newCancelBtn.onclick = () => {
            if (viewMode) viewMode.style.display = 'block';
            if (editMode) editMode.style.display = 'none';
        };
    }

    if (backBtn) {
        const newBackBtn = backBtn.cloneNode(true);
        backBtn.parentNode.replaceChild(newBackBtn, backBtn);
        newBackBtn.onclick = () => {
            const modal = document.getElementById('profile-screen');
            if (modal) modal.style.display = 'none';
            
            if (window.lastOpenedGroupId) {
                if (typeof showGroupProfile === 'function') {
                    showGroupProfile(window.lastOpenedGroupId);
                }
                window.lastOpenedGroupId = null;
            }
        };
    }
    
    // ============================================
    // КНОПКА ЗАГРУЗКИ АВАТАРА (ДОБАВЛЕНА)
    // ============================================
    const uploadAvatarBtn = document.getElementById('btn-upload-avatar');
    const avatarFileInput = document.getElementById('avatar-upload-input');
    
    if (uploadAvatarBtn && avatarFileInput) {
        // Убираем старые обработчики
        const newUploadBtn = uploadAvatarBtn.cloneNode(true);
        uploadAvatarBtn.parentNode.replaceChild(newUploadBtn, uploadAvatarBtn);
        
        newUploadBtn.onclick = () => avatarFileInput.click();
        
        avatarFileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                newUploadBtn.disabled = true;
                newUploadBtn.innerHTML = 'Загрузка...';
                await uploadAvatar(file);
                newUploadBtn.disabled = false;
                newUploadBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                    </svg>
                    Загрузить аватар
                `;
                // Обновляем отображение аватара
                updateAllAvatars();
                // Обновляем аватар в режиме редактирования
                const avatarContainer = document.getElementById('profile-avatar-container');
                if (avatarContainer && window.currentProfile) {
                    avatarContainer.innerHTML = '';
                    const avatarDiv = document.createElement('div');
                    avatarDiv.className = 'profile-avatar-big';
                    avatarDiv.style.background = 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))';
                    avatarDiv.style.display = 'flex';
                    avatarDiv.style.alignItems = 'center';
                    avatarDiv.style.justifyContent = 'center';
                    
                    if (window.currentProfile.avatar_url) {
                        avatarDiv.innerHTML = `<img src="${escapeHtml(window.currentProfile.avatar_url)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
                    } else {
                        const letter = (window.currentProfile.full_name || window.currentProfile.username || '?').charAt(0).toUpperCase();
                        avatarDiv.textContent = letter;
                    }
                    avatarContainer.appendChild(avatarDiv);
                }
            }
        };
    }
}

// Экспорт всех функций
window.uploadAvatar = uploadAvatar;
window.removeAvatar = removeAvatar;
window.updateAllAvatars = updateAllAvatars;
window.saveProfile = saveProfile;
window.openProfileModal = openProfileModal;
window.initProfileScreen = initProfileScreen;
