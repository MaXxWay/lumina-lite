import { store } from './store.js';
import { supabase } from './config.js';
import { showToast } from './utils.js';
import { uiManager } from './ui.js';
import { handleLogout } from './auth.js';

export function initProfile() {
    attachProfileEventListeners();
}

function attachProfileEventListeners() {
    // Кнопка настроек в футере
    const settingsBtn = document.getElementById('footer-settings');
    if (settingsBtn) {
        settingsBtn.onclick = showProfileScreen;
    }
    
    // Клик по информации профиля в футере
    const footerInfo = document.querySelector('.profile-footer-info');
    if (footerInfo) {
        footerInfo.onclick = showProfileScreen;
    }
    
    // Кнопка выхода в футере
    const logoutFooterBtn = document.getElementById('footer-logout');
    if (logoutFooterBtn) {
        logoutFooterBtn.onclick = handleLogout;
    }
    
    // Кнопка назад из профиля
    const profileBackBtn = document.getElementById('btn-profile-back');
    if (profileBackBtn) {
        profileBackBtn.onclick = () => uiManager.showScreen('chat');
    }
    
    // Кнопка выхода в профиле
    const profileLogoutBtn = document.getElementById('btn-logout-profile');
    if (profileLogoutBtn) {
        profileLogoutBtn.onclick = handleLogout;
    }
    
    // Кнопка сохранения профиля
    const saveProfileBtn = document.getElementById('btn-save-profile');
    if (saveProfileBtn) {
        saveProfileBtn.onclick = saveProfile;
    }
}

function showProfileScreen() {
    const state = store.getState();
    if (!state.currentProfile) return;
    
    const letter = (state.currentProfile.full_name || '?')[0].toUpperCase();
    const avatarLetter = document.getElementById('profile-avatar-letter');
    const profileFullname = document.getElementById('profile-fullname');
    const profileUsername = document.getElementById('profile-username');
    const profileBio = document.getElementById('profile-bio');
    
    if (avatarLetter) avatarLetter.textContent = letter;
    if (profileFullname) profileFullname.value = state.currentProfile.full_name || '';
    if (profileUsername) profileUsername.value = state.currentProfile.username || '';
    if (profileBio) profileBio.value = state.currentProfile.bio || '';
    
    uiManager.showScreen('profile');
}

async function saveProfile() {
    const state = store.getState();
    const full_name = document.getElementById('profile-fullname').value.trim();
    const bio = document.getElementById('profile-bio').value.trim();
    
    if (!full_name) return showToast('Имя не может быть пустым', true);
    
    const { error } = await supabase
        .from('profiles')
        .update({ full_name, bio })
        .eq('id', state.currentUser.id);
    
    if (error) return showToast('Ошибка сохранения', true);
    
    if (state.currentProfile) {
        state.currentProfile.full_name = full_name;
        state.currentProfile.bio = bio;
    }
    
    const badge = document.getElementById('current-user-badge');
    if (badge) badge.textContent = full_name;
    
    const avatarLetter = document.getElementById('profile-avatar-letter');
    if (avatarLetter) avatarLetter.textContent = full_name[0].toUpperCase();
    
    uiManager.updateProfileFooter(state.currentProfile);
    showToast('Профиль сохранён ✓');
    setTimeout(() => uiManager.showScreen('chat'), 800);
}
