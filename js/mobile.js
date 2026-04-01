function initLongPressHandler() {
    const messagesContainer = document.getElementById('messages');
    if (!messagesContainer) return;
    
    let pressTimer = null;
    let pressTarget = null;
    let startX = 0;
    let startY = 0;
    
    messagesContainer.addEventListener('touchstart', (e) => {
        // Ищем элемент сообщения
        const messageDiv = e.target.closest('.message');
        if (!messageDiv) return;
        
        // Сохраняем координаты начала касания
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        
        // Сохраняем целевое сообщение
        pressTarget = messageDiv;
        
        // Устанавливаем таймер на долгое нажатие (500ms)
        pressTimer = setTimeout(() => {
            if (pressTarget) {
                // Добавляем вибрацию (если поддерживается)
                if (window.navigator && window.navigator.vibrate) {
                    window.navigator.vibrate(50);
                }
                
                // Получаем данные сообщения
                const msgId = pressTarget.dataset.id;
                const msgText = pressTarget.dataset.text;
                const isOwn = pressTarget.classList.contains('own');
                
                // Показываем контекстное меню
                if (typeof showMessageMenu === 'function') {
                    // Создаем искусственное событие с координатами касания
                    const fakeEvent = {
                        clientX: startX,
                        clientY: startY,
                        preventDefault: () => {},
                        touches: [{
                            clientX: startX,
                            clientY: startY
                        }]
                    };
                    showMessageMenu(fakeEvent, msgId, msgText, isOwn);
                }
                
                // Добавляем визуальный фидбек
                pressTarget.style.transform = 'scale(0.98)';
                pressTarget.style.transition = 'transform 0.1s ease';
                setTimeout(() => {
                    if (pressTarget) {
                        pressTarget.style.transform = '';
                    }
                }, 150);
            }
            pressTimer = null;
        }, 500);
    });
    
    messagesContainer.addEventListener('touchmove', (e) => {
        // Если палец двигается - проверяем расстояние
        if (pressTimer && pressTarget) {
            const touch = e.touches[0];
            const deltaX = Math.abs(touch.clientX - startX);
            const deltaY = Math.abs(touch.clientY - startY);
            
            // Если палец сместился больше чем на 10px - отменяем долгое нажатие
            if (deltaX > 10 || deltaY > 10) {
                clearTimeout(pressTimer);
                pressTimer = null;
                pressTarget = null;
            }
        }
    });
    
    messagesContainer.addEventListener('touchend', (e) => {
        // Если палец поднят до окончания таймера - отменяем
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
            pressTarget = null;
        }
    });
    
    messagesContainer.addEventListener('touchcancel', (e) => {
        // Если касание прервано - отменяем
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
            pressTarget = null;
        }
    });
}
