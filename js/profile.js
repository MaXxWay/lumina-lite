// profile.js — управление аватарами и профилем (ИСПРАВЛЕННЫЙ)

async function uploadAvatar(file) {
    if (!file || !currentUser) return null;
    
    try {
        if (file.size > 5 * 1024 * 1024) {
            showToast('Файл слишком большой (макс 5MB)', true);
            return null;
        }
        
        if (!file.type.startsWith('image/')) {
            showToast('Можно загружать только изображения', true);
            return null;
        }
        
        const optimizedFile = await optimizeImage(file);
        const fileExt = file.name.split('.').pop();
        const fileName = `${currentUser.id}/${Date.now()}.${fileExt}`;
        
        const { data, error } = await supabaseClient.storage
            .from('avatars')
            .upload(fileName, optimizedFile, {
                cacheControl: '3600',
                upsert: false
            });
            
        if (error) throw error;
        
        const { data: { publicUrl } } = supabaseClient.storage
            .from('avatars')
            .getPublicUrl(fileName);
            
        const { error: updateError } = await supabaseClient
            .from('profiles')
            .update({ 
                avatar_url: publicUrl,
                avatar_updated_at: new Date().toISOString()
            })
            .eq('id', currentUser.id);
            
        if (updateError) throw updateError;
        
        if (currentProfile?.avatar_url) {
            try {
                const oldPath = currentProfile.avatar_url.split('/').pop();
                if (oldPath) {
                    await supabaseClient.storage
                        .from('avatars')
                        .remove([`${currentUser.id}/${oldPath}`]);
                }
            } catch (e) {
                console.warn('Не удалось удалить старый аватар:', e);
            }
        }
        
        currentProfile.avatar_url = publicUrl;
        updateAllAvatars();
        
        showToast('Аватар обновлен');
        return publicUrl;
        
    } catch (error) {
        console.error('Ошибка загрузки аватара:', error);
        showToast('Ошибка загрузки аватара', true);
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
                    height *= MAX_SIZE / width;
                    width = MAX_SIZE;
                }
            } else {
                if (height > MAX_SIZE) {
                    width *= MAX_SIZE / height;
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
    
    const menuAvatar = document.getElementById('side-menu-avatar');
    if (menuAvatar) {
        if (avatarUrl) {
            menuAvatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            menuAvatar.textContent = (window.currentProfile.full_name || '?')[0].toUpperCase();
            menuAvatar.style.background = 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))';
        }
    }
    
    const profileAvatar = document.getElementById('profile-avatar-letter');
    if (profileAvatar) {
        if (avatarUrl) {
            profileAvatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            profileAvatar.textContent = (window.currentProfile.full_name || '?')[0].toUpperCase();
        }
    }
    
    const chatAvatar = document.getElementById('chat-user-avatar');
    if (chatAvatar && currentChat?.other_user?.id === currentUser.id) {
        if (avatarUrl) {
            chatAvatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar">`;
        } else {
            chatAvatar.textContent = (window.currentProfile.full_name || '?')[0].toUpperCase();
        }
    }
    
    document.querySelectorAll('.message.own .msg-avatar').forEach(avatar => {
        if (avatarUrl) {
            avatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar">`;
        }
    });
}

async function removeAvatar() {
    if (!currentUser || !currentProfile?.avatar_url) return;
    
    const confirmed = await modal.confirm('Удалить аватар?', 'Подтверждение');
    if (!confirmed) return;
    
    try {
        const oldPath = currentProfile.avatar_url.split('/').pop();
        if (oldPath) {
            await supabaseClient.storage
                .from('avatars')
                .remove([`${currentUser.id}/${oldPath}`]);
        }
        
        await supabaseClient
            .from('profiles')
            .update({ 
                avatar_url: null,
                avatar_updated_at: new Date().toISOString()
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

function createAvatarUploader() {
    const container = document.createElement('div');
    container.className = 'avatar-uploader';
    container.innerHTML = `
        <input type="file" id="avatar-input" accept="image/jpeg,image/png,image/gif,image/webp" style="display:none;">
        <div class="avatar-actions">
            <button class="glass-button" id="upload-avatar-btn" style="margin-top:8px;">
                <svg width="16" height="16" style="margin-right:8px;" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                </svg>
                Загрузить фото
            </button>
            ${currentProfile?.avatar_url ? `
                <button class="glass-button danger" id="remove-avatar-btn" style="margin-top:8px;">
                    <svg width="16" height="16" style="margin-right:8px;" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                    </svg>
                    Удалить фото
                </button>
            ` : ''}
        </div>
    `;
    
    const input = container.querySelector('#avatar-input');
    const uploadBtn = container.querySelector('#upload-avatar-btn');
    const removeBtn = container.querySelector('#remove-avatar-btn');
    
    uploadBtn.onclick = () => input.click();
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            uploadBtn.disabled = true;
            uploadBtn.textContent = 'Загрузка...';
            await uploadAvatar(file);
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = `
                <svg width="16" height="16" style="margin-right:8px;" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                </svg>
                Загрузить фото
            `;
            location.reload();
        }
    };
    
    if (removeBtn) {
        removeBtn.onclick = async () => {
            await removeAvatar();
            location.reload();
        };
    }
    
    return container;
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
                bio: bioText,
                updated_at: new Date().toISOString()
            })
            .eq('id', window.currentUser.id)
            .select();
        
        if (error) {
            console.error('Ошибка Supabase:', error);
            throw error;
        }
        
        console.log('Профиль сохранен:', data);
        
        // Обновляем локальный объект
        window.currentProfile.full_name = fn;
        window.currentProfile.username = un;
        window.currentProfile.bio = bioText;
        
        // Обновляем UI
        updateProfileFooter();
        
        const nameView = document.getElementById('profile-name-view');
        const usernameView = document.getElementById('profile-username-view');
        const bioView = document.getElementById('profile-bio-view');
        
        if (nameView) nameView.textContent = fn;
        if (usernameView) usernameView.textContent = `@${un}`;
        if (bioView) bioView.textContent = bioText || 'Пользователь пока ничего не рассказал о себе.';
        
        // Обновляем бейдж в шапке чата
        const badge = document.getElementById('current-user-badge');
        if (badge) badge.textContent = fn;
        
        showToast('Профиль сохранён');
        
        // Закрываем модальное окно
        const modal = document.getElementById('profile-screen');
        if (modal) modal.style.display = 'none';
        
        // Возвращаемся к группе если нужно
        if (window.lastOpenedGroupId) {
            showGroupProfile(window.lastOpenedGroupId);
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
    }
    if (username) {
        username.value = profile.username || '';
    }
    if (bio) { 
        bio.value = profile.bio || ''; 
    }
    
    // Настройка режима
    if (viewMode) viewMode.style.display = 'block';
    if (editMode) editMode.style.display = 'none';
    if (editBtn) editBtn.style.display = readOnly ? 'none' : 'block';
    if (title) title.textContent = readOnly ? 'Профиль пользователя' : 'Мой профиль';
    if (saveBtn) saveBtn.style.display = readOnly ? 'none' : 'block';
    
    // Добавляем аватар загрузчик для своего профиля
    if (!readOnly && editMode) {
        const existingUploader = editMode.querySelector('.avatar-uploader');
        if (existingUploader) existingUploader.remove();
        const uploader = createAvatarUploader();
        const bioField = document.getElementById('profile-bio');
        if (bioField && bioField.parentNode) {
            bioField.parentNode.insertBefore(uploader, bioField.nextSibling);
        }
    }

    modal.style.display = 'flex';
}

function initProfileScreen() {
    const editBtn = document.getElementById('btn-edit-profile');
    const saveBtn = document.getElementById('btn-save-profile');
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
        // Убираем старые обработчики и добавляем новый
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        newSaveBtn.onclick = saveProfile;
    }

    if (backBtn) {
        backBtn.onclick = () => {
            const modal = document.getElementById('profile-screen');
            if (modal) modal.style.display = 'none';
            
            if (window.lastOpenedGroupId) {
                showGroupProfile(window.lastOpenedGroupId);
                window.lastOpenedGroupId = null;
            }
        };
    }
}

// Экспорт
window.uploadAvatar = uploadAvatar;
window.removeAvatar = removeAvatar;
window.updateAllAvatars = updateAllAvatars;
window.createAvatarUploader = createAvatarUploader;
window.saveProfile = saveProfile;
window.openProfileModal = openProfileModal;
window.initProfileScreen = initProfileScreen;
