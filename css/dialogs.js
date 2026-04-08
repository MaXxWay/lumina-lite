/* ============================================
   ДИАЛОГИ И ПОИСК
   ============================================ */

.dialogs-header {
    padding: 20px 20px 16px;
    border-bottom: 1px solid var(--glass-border);
    width: 100%;
    flex-shrink: 0;
}
.dialogs-list {
    flex: 1;
    width: 100%;
    overflow-y: auto;
    padding: 8px 0;
}

/* Анимация загрузки */
.dialogs-loading {
    text-align: center;
    color: var(--text-dim);
    padding: 40px 20px;
    font-size: 13px;
    animation: pulse 1.5s ease-in-out infinite;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
}
.dialogs-loading svg {
    opacity: 0.5;
    animation: spin 1s linear infinite;
}
@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

/* Пустое состояние */
.dialogs-empty {
    padding: 48px 20px;
    text-align: center;
    color: rgba(255,255,255,0.35);
    font-size: 13px;
    line-height: 1.6;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
}
.dialogs-empty svg {
    opacity: 0.3;
    margin-bottom: 8px;
}

/* Элемент диалога */
.dialog-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 20px;
    cursor: pointer;
    transition: background 0.2s ease, border-left 0.2s ease;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    animation: dialogFadeIn 0.2s ease both;
}
.dialog-item:hover {
    background: rgba(255, 255, 255, 0.08);
}
.dialog-item.active {
    background: linear-gradient(90deg, rgba(0, 114, 255, 0.2), transparent);
    border-left: 3px solid var(--accent-blue);
}

/* Аватар диалога */
.dialog-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 18px;
    flex-shrink: 0;
    position: relative;
    background: linear-gradient(135deg, var(--accent-blue), var(--accent-cyan));
}
/* Аватар группы */
.dialog-avatar.group-avatar {
    background: linear-gradient(135deg, #667eea, #764ba2);
}
/* Аватар бота */
.dialog-avatar.bot-avatar {
    background: #12141D;
    overflow: hidden;
}
.dialog-avatar.bot-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
}
/* Аватар избранного */
.dialog-avatar.saved-avatar {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
}
.dialog-avatar.saved-avatar svg {
    width: 60%;
    height: 60%;
    color: white;
}

/* Бейдж группы (как в Telegram - маленький слева) */
.group-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    background: #667eea;
    border-radius: 4px;
    margin-right: 6px;
    vertical-align: middle;
    flex-shrink: 0;
}
.group-badge svg {
    width: 10px;
    height: 10px;
    stroke: white;
    stroke-width: 2;
}

.dialog-info {
    flex: 1;
    min-width: 0;
}
.dialog-name {
    font-weight: 600;
    margin-bottom: 4px;
    font-size: 15px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
    gap: 6px;
}
.dialog-preview {
    font-size: 12px;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Непрочитанные сообщения */
.unread-badge-count {
    display: inline-block;
    background: var(--accent-blue);
    color: white;
    font-size: 10px;
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 10px;
    margin-left: 8px;
    min-width: 18px;
    text-align: center;
}
.unread-dialog {
    background: rgba(0, 114, 255, 0.1);
    border-left: 3px solid var(--accent-blue);
}
.unread-dialog:hover {
    background: rgba(0, 114, 255, 0.15);
}

/* Онлайн-точка */
.online-dot {
    position: absolute;
    bottom: 2px;
    right: 2px;
    width: 12px;
    height: 12px;
    background: var(--success);
    border-radius: 50%;
    border: 2px solid var(--bg-deep);
    z-index: 10;
}

/* Поиск */
.search-wrapper {
    flex: 1;
    position: relative;
}
.search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-dim);
    pointer-events: none;
}
.search-input {
    width: 100%;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--glass-border);
    border-radius: 20px;
    padding: 8px 12px 8px 36px;
    color: white;
    font-size: 13px;
    transition: 0.2s;
}
.search-input:focus {
    border-color: var(--accent-cyan);
    background: rgba(0, 0, 0, 0.5);
}
.search-input::placeholder {
    color: var(--text-dim);
    font-size: 12px;
}

/* Результаты поиска пользователей */
.search-header {
    padding: 12px 20px;
    border-bottom: 1px solid var(--glass-border);
    margin-bottom: 8px;
}
.search-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-dim);
}
.username-hint {
    font-size: 11px;
    color: var(--text-dim);
    margin-left: 6px;
    font-weight: normal;
}
.user-search-item {
    cursor: pointer;
}
.user-search-item:hover {
    background: rgba(0, 114, 255, 0.1);
}

/* Анимации */
@keyframes dialogFadeIn {
    from { opacity: 0; transform: translateX(-8px); }
    to { opacity: 1; transform: translateX(0); }
}
@keyframes pulse {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
}
