// profile.js — управление аватарами и профилем (С КНОПКОЙ + НА АВАТАРКЕ)

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
        
        showToast('Загрузка аватара...', false);
        
        const optimizedFile = await optimizeImage(file);
        const fileExt = file.name.split('.').pop();
        const fileName = `${currentUser.id}/${Date.now()}.${fileExt}`;
        
        console.log('Загрузка аватара:', fileName);
        
        const { data, error } = await supabaseClient.storage
            .from('avatars')
            .upload(fileName, optimizedFile, {
                cacheControl: '3600',
                upsert: true
            });
            
        if (error) {
            console.error('Ошибка загрузки в Storage:', error);
            throw error;
        }
        
        const { data: { publicUrl } } = supabaseClient.storage
            .from('avatars')
            .getPublicUrl(fileName);
            
        console.log('Public URL:', publicUrl);
        
        const { error: updateError } = await supabaseClient
            .from('profiles')
            .update({ avatar_url: publicUrl })
            .eq('id', currentUser.id);
            
        if (updateError) {
            console.error('Ошибка обновления профиля:', updateError);
            throw updateError;
        }
        
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
    
    const menuAvatar = document.getElementById('side-menu-avatar');
    if (menuAvatar) {
        if (avatarUrl) {
            menuAvatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            menuAvatar.textContent = letter;
            menuAvatar.style.background = 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))';
        }
    }
    
    const profileAvatar = document.getElementById('profile-avatar-letter');
    if (profileAvatar) {
        if (avatarUrl) {
            profileAvatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            profileAvatar.style.background = 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))';
        } else {
            profileAvatar.textContent = letter;
            profileAvatar.style.background = 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))';
        }
    }
    
    const chatAvatar = document.getElementById('chat-user-avatar');
    if (chatAvatar && currentChat?.other_user?.id === currentUser.id) {
        if (avatarUrl) {
            chatAvatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            chatAvatar.textContent = letter;
            chatAvatar.style.background = 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))';
        }
    }
    
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

// СОЗДАНИЕ АВАТАРА С КНОПКОЙ + (как в Telegram)
function createAvatarWithUploader() {
    const container = document.createElement('div');
    container.className = 'avatar-with-uploader';
    container.style.cssText = 'position: relative; display: inline-block;';
    
    const avatarUrl = window.currentProfile?.avatar_url;
    const name = window.currentProfile?.full_name || window.currentProfile?.username || '?';
    const letter = name.charAt(0).toUpperCase();
    
    // Скрытый input для загрузки файла
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'avatar-file-input';
    fileInput.accept = 'image/jpeg,image/png,image/gif,image/webp';
    fileInput.style.display = 'none';
    
    // Контейнер для аватара
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'profile-avatar-big';
    avatarDiv.id = 'editable-avatar';
    avatarDiv.style.cssText = 'position: relative; cursor: pointer;';
    avatarDiv.style.background = 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))';
    
    if (avatarUrl) {
        avatarDiv.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
        avatarDiv.textContent = letter;
    }
    
    // Кнопка-плюс поверх аватара
    const plusBtn = document.createElement('button');
    plusBtn.className = 'avatar-upload-btn';
    plusBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
    `;
    plusBtn.title = 'Загрузить аватар';
    plusBtn.style.cssText = `
        position: absolute;
        bottom: 4px;
        right: 4px;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--accent-blue);
        border: 3px solid var(--bg-deep);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    `;
    
    // Кнопка удаления (крестик) - появляется если есть аватар
    let deleteBtn = null;
    if (avatarUrl) {
        deleteBtn = document.createElement('button');
        deleteBtn.className = 'avatar-delete-btn';
        deleteBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        `;
        deleteBtn.title = 'Удалить аватар';
        deleteBtn.style.cssText = `
            position: absolute;
            bottom: 4px;
            left: 4px;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: var(--danger);
            border: 3px solid var(--bg-deep);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        `;
        deleteBtn.onmouseover = () => deleteBtn.style.transform = 'scale(1.1)';
        deleteBtn.onmouseout = () => deleteBtn.style.transform = 'scale(1)';
        deleteBtn.onclick = async (e) => {
            e.stopPropagation();
            await removeAvatar();
            // Обновляем UI
            const newAvatarDiv = document.getElementById('editable-avatar');
            const newName = window.currentProfile?.full_name || window.currentProfile?.username || '?';
            if (newAvatarDiv) {
                newAvatarDiv.textContent = newName.charAt(0).toUpperCase();
                newAvatarDiv.style.background = 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))';
                newAvatarDiv.innerHTML = newName.charAt(0).toUpperCase();
            }
            // Удаляем кнопку удаления
            const oldDeleteBtn = document.querySelector('.avatar-delete-btn');
            if (oldDeleteBtn) oldDeleteBtn.remove();
        };
    }
    
    // Обработчик клика по аватару или кнопке +
    const openFilePicker = () => fileInput.click();
    plusBtn.onclick = openFilePicker;
    avatarDiv.onclick = openFilePicker;
    
    // Обработчик выбора файла
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            plusBtn.disabled = true;
            plusBtn.style.opacity = '0.5';
            await uploadAvatar(file);
            plusBtn.disabled = false;
            plusBtn.style.opacity = '1';
            
            // Обновляем аватар в UI
            const newAvatarDiv = document.getElementById('editable-avatar');
            const newAvatarUrl = window.currentProfile?.avatar_url;
            if (newAvatarDiv && newAvatarUrl) {
                newAvatarDiv.innerHTML = `<img src="${escapeHtml(newAvatarUrl)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
                newAvatarDiv.style.background = 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))';
            }
            
            // Добавляем кнопку удаления если её нет
            if (!document.querySelector('.avatar-delete-btn')) {
                const parentContainer = document.querySelector('.avatar-with-uploader');
                if (parentContainer && !parentContainer.querySelector('.avatar-delete-btn')) {
                    const newDeleteBtn = document.createElement('button');
                    newDeleteBtn.className = 'avatar-delete-btn';
                    newDeleteBtn.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    `;
                    newDeleteBtn.title = 'Удалить аватар';
                    newDeleteBtn.style.cssText = `
                        position: absolute;
                        bottom: 4px;
                        left: 4px;
                        width: 32px;
                        height: 32px;
                        border-radius: 50%;
                        background: var(--danger);
                        border: 3px solid var(--bg-deep);
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.2s ease;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
                    `;
                    newDeleteBtn.onclick = async (e) => {
                        e.stopPropagation();
                        await removeAvatar();
                        const avatarDiv2 = document.getElementById('editable-avatar');
                        const name2 = window.currentProfile?.full_name || window.currentProfile?.username || '?';
                        if (avatarDiv2) {
                            avatarDiv2.textContent = name2.charAt(0).toUpperCase();
                            avatarDiv2.innerHTML = name2.charAt(0).toUpperCase();
                        }
                        newDeleteBtn.remove();
                    };
                    parentContainer.appendChild(newDeleteBtn);
                }
            }
        }
    };
    
    plusBtn.onmouseover = () => plusBtn.style.transform = 'scale(1.1)';
    plusBtn.onmouseout = () => plusBtn.style.transform = 'scale(1)';
    
    container.appendChild(fileInput);
    container.appendChild(avatarDiv);
    container.appendChild(plusBtn);
    if (deleteBtn) container.appendChild(deleteBtn);
    
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
                bio: bioText || ''
            })
            .eq('id', window.currentUser.id)
            .select();
        
        if (error) throw error;
        
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
    
    // Обновляем аватар с кнопкой + (только для своего профиля в режиме редактирования)
    if (!readOnly && avatarContainer) {
        avatarContainer.innerHTML = '';
        const avatarWithUploader = createAvatarWithUploader();
        avatarContainer.appendChild(avatarWithUploader);
    } else if (avatarContainer) {
        // Для режима просмотра - просто аватар без кнопки
        avatarContainer.innerHTML = '';
        const simpleAvatar = document.createElement('div');
        simpleAvatar.className = 'profile-avatar-big';
        simpleAvatar.style.background = 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))';
        simpleAvatar.style.display = 'flex';
        simpleAvatar.style.alignItems = 'center';
        simpleAvatar.style.justifyContent = 'center';
        
        if (profile.avatar_url) {
            simpleAvatar.innerHTML = `<img src="${escapeHtml(profile.avatar_url)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            simpleAvatar.textContent = letter;
        }
        avatarContainer.appendChild(simpleAvatar);
    }

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
            
            // Обновляем аватар с кнопкой загрузки
            const avatarContainer = document.getElementById('profile-avatar-container');
            if (avatarContainer && window.currentProfile) {
                avatarContainer.innerHTML = '';
                const avatarWithUploader = createAvatarWithUploader();
                avatarContainer.appendChild(avatarWithUploader);
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
            
            // Возвращаем обычный аватар без кнопки
            const avatarContainer = document.getElementById('profile-avatar-container');
            if (avatarContainer && window.currentProfile) {
                avatarContainer.innerHTML = '';
                const simpleAvatar = document.createElement('div');
                simpleAvatar.className = 'profile-avatar-big';
                simpleAvatar.style.background = 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))';
                simpleAvatar.style.display = 'flex';
                simpleAvatar.style.alignItems = 'center';
                simpleAvatar.style.justifyContent = 'center';
                
                const letter = (window.currentProfile.full_name || window.currentProfile.username || '?').charAt(0).toUpperCase();
                if (window.currentProfile.avatar_url) {
                    simpleAvatar.innerHTML = `<img src="${escapeHtml(window.currentProfile.avatar_url)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
                } else {
                    simpleAvatar.textContent = letter;
                }
                avatarContainer.appendChild(simpleAvatar);
            }
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
}

// Экспорт
window.uploadAvatar = uploadAvatar;
window.removeAvatar = removeAvatar;
window.updateAllAvatars = updateAllAvatars;
window.createAvatarWithUploader = createAvatarWithUploader;
window.saveProfile = saveProfile;
window.openProfileModal = openProfileModal;
window.initProfileScreen = initProfileScreen;
