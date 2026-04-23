// profile.js — управление аватарами и профилем (ПОЛНАЯ ВЕРСИЯ С ЦЕНТРИРОВАННОЙ КНОПКОЙ)

let avatarUploadInProgress = false;

async function uploadAvatar(file) {
    if (!file || !currentUser) return null;
    if (avatarUploadInProgress) {
        showToast('Загрузка уже выполняется', true);
        return null;
    }
    
    try {
        avatarUploadInProgress = true;
        
        if (file.size > 5 * 1024 * 1024) {
            showToast('Файл слишком большой (макс 5MB)', true);
            return null;
        }
        
        if (!file.type.startsWith('image/')) {
            showToast('Можно загружать только изображения', true);
            return null;
        }
        
        showToast('Загрузка аватара...', false);
        
        const optimizedFile = await optimizeImage(file);
        const fileExt = file.name.split('.').pop();
        const fileName = `${currentUser.id}/${Date.now()}.${fileExt}`;
        
        const { data, error } = await supabaseClient.storage
            .from('avatars')
            .upload(fileName, optimizedFile, {
                cacheControl: '3600',
                upsert: true
            });
            
        if (error) throw error;
        
        const { data: { publicUrl } } = supabaseClient.storage
            .from('avatars')
            .getPublicUrl(fileName);
        
        const { error: updateError } = await supabaseClient
            .from('profiles')
            .update({ avatar_url: publicUrl })
            .eq('id', currentUser.id);
            
        if (updateError) throw updateError;
        
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
        
        currentProfile.avatar_url = publicUrl;
        
        // Обновляем все аватары в интерфейсе
        updateAllAvatars();
        
        // Обновляем аватар в модальном окне если открыто
        const avatarContainer = document.getElementById('profile-avatar-container');
        if (avatarContainer) {
            updateAvatarInContainer(avatarContainer, currentProfile);
        }
        
        showToast('Аватар обновлен!');
        return publicUrl;
        
    } catch (error) {
        console.error('Ошибка загрузки аватара:', error);
        showToast('Ошибка загрузки аватара: ' + (error.message || 'Неизвестная ошибка'), true);
        return null;
    } finally {
        avatarUploadInProgress = false;
    }
}

function updateAvatarInContainer(container, profile) {
    if (!container) return;
    container.innerHTML = '';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'avatar-wrapper';
    wrapper.style.cssText = 'position: relative; display: inline-block;';
    
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'profile-avatar-big';
    avatarDiv.style.cssText = `
        width: 100px;
        height: 100px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--accent-blue), var(--accent-cyan));
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 40px;
        font-weight: 700;
        color: white;
        overflow: hidden;
        cursor: pointer;
        transition: transform 0.2s ease;
    `;
    
    const letter = (profile.full_name || profile.username || '?').charAt(0).toUpperCase();
    
    if (profile.avatar_url) {
        avatarDiv.innerHTML = `<img src="${escapeHtml(profile.avatar_url)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
        avatarDiv.textContent = letter;
    }
    
    wrapper.appendChild(avatarDiv);
    
    // Кнопка загрузки (только для своего профиля)
    if (profile.id === currentUser?.id) {
        const uploadBtn = document.createElement('button');
        uploadBtn.className = 'avatar-upload-circle';
        uploadBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
        `;
        uploadBtn.title = 'Загрузить аватар';
        uploadBtn.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: var(--accent-blue);
            border: 3px solid var(--bg-deep);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            z-index: 10;
        `;
        
        uploadBtn.onmouseover = () => uploadBtn.style.transform = 'translateX(-50%) scale(1.1)';
        uploadBtn.onmouseout = () => uploadBtn.style.transform = 'translateX(-50%) scale(1)';
        
        // Скрытый input для файла
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/jpeg,image/png,image/gif,image/webp';
        fileInput.style.display = 'none';
        
        uploadBtn.onclick = () => fileInput.click();
        
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                uploadBtn.disabled = true;
                uploadBtn.style.opacity = '0.5';
                await uploadAvatar(file);
                uploadBtn.disabled = false;
                uploadBtn.style.opacity = '1';
                // Обновляем аватар
                updateAvatarInContainer(container, window.currentProfile);
            }
        };
        
        wrapper.appendChild(uploadBtn);
        wrapper.appendChild(fileInput);
        
        // Кнопка удаления (если есть аватар)
        if (profile.avatar_url) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'avatar-delete-circle';
            deleteBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            `;
            deleteBtn.title = 'Удалить аватар';
            deleteBtn.style.cssText = `
                position: absolute;
                top: 0;
                right: 0;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                background: var(--danger);
                border: 2px solid var(--bg-deep);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
                z-index: 10;
            `;
            deleteBtn.onmouseover = () => deleteBtn.style.transform = 'scale(1.1)';
            deleteBtn.onmouseout = () => deleteBtn.style.transform = 'scale(1)';
            deleteBtn.onclick = async (e) => {
                e.stopPropagation();
                const confirmed = await modal.confirm('Удалить аватар?', 'Подтверждение');
                if (confirmed) {
                    await removeAvatar();
                    updateAvatarInContainer(container, window.currentProfile);
                }
            };
            wrapper.appendChild(deleteBtn);
        }
    }
    
    container.appendChild(wrapper);
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
    
    // Обновляем аватар в шапке чата
    const chatAvatar = document.getElementById('chat-user-avatar');
    if (chatAvatar && currentChat?.other_user?.id === currentUser.id) {
        if (avatarUrl) {
            chatAvatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else if (currentChat?.other_user?.full_name) {
            chatAvatar.textContent = currentChat.other_user.full_name.charAt(0).toUpperCase();
        } else {
            chatAvatar.textContent = letter;
        }
    }
    
    // Обновляем аватары в сообщениях
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
    
    try {
        const oldPath = currentProfile.avatar_url.split('/').pop();
        if (oldPath && oldPath.includes(currentUser.id)) {
            await supabaseClient.storage
                .from('avatars')
                .remove([`${currentUser.id}/${oldPath}`]);
        }
        
        await supabaseClient
            .from('profiles')
            .update({ avatar_url: null })
            .eq('id', currentUser.id);
            
        currentProfile.avatar_url = null;
        updateAllAvatars();
        
        showToast('Аватар удален');
    } catch (error) {
        console.error('Ошибка удаления аватара:', error);
        showToast('Ошибка удаления аватара', true);
    }
}

// Функция сохранения профиля
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
        const { data, error } = await supabaseClient
            .from('profiles')
            .update({ full_name: fn, username: un, bio: bioText || '' })
            .eq('id', window.currentUser.id)
            .select();
        
        if (error) throw error;
        
        if (data && data[0]) {
            window.currentProfile = data[0];
        } else {
            window.currentProfile.full_name = fn;
            window.currentProfile.username = un;
            window.currentProfile.bio = bioText || '';
        }
        
        if (typeof updateProfileFooter === 'function') updateProfileFooter();
        
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
    
    // Обновляем аватар
    if (avatarContainer) {
        updateAvatarInContainer(avatarContainer, profile);
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
        editBtn.onclick = () => {
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
        saveBtn.onclick = saveProfile;
    }

    if (cancelBtn) {
        cancelBtn.onclick = () => {
            if (viewMode) viewMode.style.display = 'block';
            if (editMode) editMode.style.display = 'none';
        };
    }

    if (backBtn) {
        backBtn.onclick = () => {
            const modal = document.getElementById('profile-screen');
            if (modal) modal.style.display = 'none';
        };
    }
}

// Экспорт
window.uploadAvatar = uploadAvatar;
window.removeAvatar = removeAvatar;
window.updateAllAvatars = updateAllAvatars;
window.saveProfile = saveProfile;
window.openProfileModal = openProfileModal;
window.initProfileScreen = initProfileScreen;
