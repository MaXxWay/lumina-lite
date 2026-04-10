// profile.js — управление аватарами и профилем

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
    
    // Футер
    const footerAvatar = document.getElementById('footer-avatar');
    if (footerAvatar) {
        if (avatarUrl) {
            footerAvatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            footerAvatar.textContent = (window.currentProfile.full_name || '?')[0].toUpperCase();
        }
    }
    
    // Большой аватар в профиле
    const profileAvatar = document.getElementById('profile-avatar-letter');
    if (profileAvatar) {
        if (avatarUrl) {
            profileAvatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            profileAvatar.textContent = (window.currentProfile.full_name || '?')[0].toUpperCase();
        }
    }
    
    // Свои сообщения
    document.querySelectorAll('.message.own .msg-avatar').forEach(avatar => {
        if (avatarUrl) {
            avatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar">`;
        } else {
            avatar.textContent = (window.currentProfile.full_name || '?')[0].toUpperCase();
        }
    });
}
    
    const profileAvatar = document.getElementById('profile-avatar-letter');
    if (profileAvatar) {
        if (avatarUrl) {
            profileAvatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            profileAvatar.textContent = (currentProfile.full_name || '?')[0].toUpperCase();
        }
    }
    
    const chatAvatar = document.getElementById('chat-user-avatar');
    if (chatAvatar && currentChat?.other_user?.id === currentUser.id) {
        if (avatarUrl) {
            chatAvatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar">`;
        } else {
            chatAvatar.textContent = (currentProfile.full_name || '?')[0].toUpperCase();
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

const originalOpenProfileModal = window.openProfileModal;
window.openProfileModal = function(profile = currentProfile, options = {}) {
    if (!profile) return;
    
    if (typeof originalOpenProfileModal === 'function') {
        originalOpenProfileModal(profile, options);
    }
    
    const isOwnProfile = profile.id === currentUser?.id;
    const readOnly = options.readOnly === true || !isOwnProfile;
    
    if (!readOnly) {
        const editMode = document.getElementById('profile-edit-mode');
        if (editMode) {
            const existingUploader = editMode.querySelector('.avatar-uploader');
            if (existingUploader) existingUploader.remove();
            
            const uploader = createAvatarUploader();
            const bioField = document.getElementById('profile-bio');
            if (bioField) {
                bioField.parentNode.insertBefore(uploader, bioField.nextSibling);
            }
        }
    }
    
    const avatarBig = document.getElementById('profile-avatar-letter');
    if (avatarBig && profile.avatar_url) {
        avatarBig.innerHTML = `<img src="${escapeHtml(profile.avatar_url)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    }
};

window.uploadAvatar = uploadAvatar;
window.removeAvatar = removeAvatar;
window.updateAllAvatars = updateAllAvatars;
window.createAvatarUploader = createAvatarUploader;
