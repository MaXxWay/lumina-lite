function initMessageMenu() {
    const menu = document.getElementById('message-menu');
    if (!menu) return;
    
    // Добавляем анимацию через CSS
    menu.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    menu.style.opacity = '0';
    menu.style.transform = 'scale(0.9)';
    
    function hideMenu() { 
        menu.style.opacity = '0';
        menu.style.transform = 'scale(0.9)';
        setTimeout(() => {
            if (menu.style.opacity === '0') {
                menu.style.display = 'none';
            }
        }, 200);
        document.removeEventListener('click', hideMenu);
        document.removeEventListener('touchstart', hideMenu);
    }
    
    window.showMessageMenu = function(e, msgId, msgText, isOwn) {
        e.preventDefault();
        e.stopPropagation();
        
        // Получаем координаты
        let x = e.clientX;
        let y = e.clientY;
        
        // Для мобильных устройств - позиционируем по центру касания
        const isMobile = isMobileDevice && typeof isMobileDevice === 'function' && isMobileDevice();
        if (isMobile && e.touches && e.touches[0]) {
            const touch = e.touches[0];
            x = touch.clientX;
            y = touch.clientY;
        }
        
        // Показываем меню
        menu.style.display = 'block';
        menu.style.opacity = '0';
        menu.style.transform = 'scale(0.9)';
        
        // Получаем размеры меню
        const menuRect = menu.getBoundingClientRect();
        const menuWidth = menuRect.width;
        const menuHeight = menuRect.height;
        
        // Рассчитываем позицию
        let left = x;
        let top = y;
        
        // Корректируем по горизонтали
        if (left + menuWidth > window.innerWidth - 10) {
            left = window.innerWidth - menuWidth - 10;
        }
        if (left < 10) {
            left = 10;
        }
        
        // Корректируем по вертикали (открываем выше или ниже точки касания)
        if (top + menuHeight > window.innerHeight - 10) {
            top = y - menuHeight - 10;
        } else {
            top = y + 10;
        }
        
        // Дополнительная проверка, чтобы меню не уходило за верхний край
        if (top < 10) {
            top = 10;
        }
        
        // Применяем позицию
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.style.transform = 'scale(1)';
        menu.style.opacity = '1';
        
        // Назначаем действия
        menu.querySelectorAll('.menu-item').forEach(item => {
            // Убираем старые обработчики
            const newItem = item.cloneNode(true);
            item.parentNode.replaceChild(newItem, item);
            
            newItem.onclick = async (event) => {
                event.stopPropagation();
                await handleAction(newItem.dataset.action, msgId, msgText, isOwn);
                hideMenu();
            };
        });
        
        // Закрываем при клике вне меню
        setTimeout(() => {
            document.addEventListener('click', hideMenu);
            document.addEventListener('touchstart', hideMenu);
        }, 100);
    };
    
    async function handleAction(action, msgId, msgText, isOwn) {
        switch (action) {
            case 'reply': 
                const inp = document.getElementById('message-input'); 
                if (inp && currentChat?.id !== SAVED_CHAT_ID) { 
                    inp.value = `> ${msgText}\n\n`; 
                    inp.focus(); 
                    showToast('Цитата добавлена');
                } 
                break;
            case 'copy': 
                await navigator.clipboard.writeText(msgText); 
                showToast('Текст скопирован ✓'); 
                break;
            case 'edit':
                if (isOwn && currentChat?.id !== SAVED_CHAT_ID) {
                    const newText = prompt('✏️ Редактировать сообщение:', msgText);
                    if (newText && newText.trim() && newText.trim() !== msgText) {
                        try {
                            await supabaseClient.from('messages').update({ 
                                text: newText.trim(), 
                                is_edited: true 
                            }).eq('id', msgId);
                            
                            // Обновляем отображение
                            const msgDiv = document.querySelector(`.message[data-id="${msgId}"]`);
                            if (msgDiv) {
                                const textDiv = msgDiv.querySelector('.text');
                                if (textDiv) {
                                    textDiv.textContent = newText.trim();
                                    // Добавляем индикатор редактирования
                                    const timeSpan = msgDiv.querySelector('.msg-time');
                                    if (timeSpan && !timeSpan.innerHTML.includes('✎')) {
                                        timeSpan.innerHTML = timeSpan.innerHTML + ' ✎';
                                    }
                                }
                            }
                            showToast('Сообщение изменено ✓');
                        } catch (err) {
                            showToast('Ошибка редактирования', true);
                        }
                    }
                } else {
                    showToast('Можно редактировать только свои сообщения', true);
                }
                break;
            case 'delete':
                if (isOwn && confirm('🗑️ Удалить сообщение?\nЭто действие нельзя отменить.')) {
                    try {
                        await supabaseClient.from('messages').delete().eq('id', msgId);
                        showToast('Сообщение удалено');
                    } catch (err) {
                        showToast('Ошибка удаления', true);
                    }
                } else {
                    showToast('Можно удалять только свои сообщения', true);
                }
                break;
            default: 
                showToast('Функция в разработке');
        }
    }
}
