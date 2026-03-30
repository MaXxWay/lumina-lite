async function loadDialogs(searchTerm = '') {
    const container = document.getElementById('dialogs-list');
    if (!container) return;
    
    const isUserSearch = searchTerm && searchTerm.startsWith('@');
    
    if (isUserSearch && searchTerm.length > 1) {
        await loadUserSearchResults(searchTerm, container);
        return;
    }
    
    if (isUpdatingDialogs) return;
    isUpdatingDialogs = true;
    
    try {
        // ПРОСТЕЙШИЙ ЗАПРОС - никаких фильтров
        const { data: allChats, error: chatsError } = await supabaseClient
            .from('chats')
            .select('id, type, participants, updated_at, created_at, last_message, is_bot_chat, is_saved_chat');
        
        if (chatsError) {
            console.error('Ошибка загрузки чатов:', chatsError);
            // Показываем заглушку
            container.innerHTML = '<div class="dialogs-loading">Ошибка подключения к базе данных. Проверьте консоль.</div>';
            return;
        }
        
        console.log('Все чаты из БД:', allChats);
        console.log('Текущий пользователь:', currentUser);
        
        // Фильтруем на клиенте
        const chats = (allChats || []).filter(chat => {
            if (!chat.participants || !Array.isArray(chat.participants)) return false;
            return chat.participants.includes(currentUser.id);
        });
        
        console.log('Отфильтрованные чаты:', chats);
        
        // Сортируем
        chats.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        
        const validChats = [];
        for (const chat of chats) {
            const otherId = chat.participants?.find(id => id !== currentUser.id);
            
            if (otherId === BOT_USER_ID || chat.id === SAVED_CHAT_ID) {
                validChats.push(chat);
                continue;
            }
            
            if (otherId) {
                const userExists = await checkUserExists(otherId);
                if (userExists) {
                    validChats.push(chat);
                } else {
                    console.log(`🗑️ Удаляем мертвый чат: ${chat.id}`);
                    await supabaseClient.from('chats').delete().eq('id', chat.id);
                    await supabaseClient.from('messages').delete().eq('chat_id', chat.id);
                }
            }
        }
        
        if (validChats.length === 0) {
            container.innerHTML = '<div class="dialogs-loading">Нет диалогов. Начните общение через поиск пользователей</div>';
            isUpdatingDialogs = false;
            return;
        }
        
        // Получаем непрочитанные сообщения
        let unreadCounts = new Map();
        const { data: unreadData } = await supabaseClient
            .from('messages')
            .select('chat_id')
            .eq('is_read', false)
            .neq('user_id', currentUser.id)
            .in('chat_id', validChats.map(c => c.id));
        
        if (unreadData) {
            unreadData.forEach(msg => {
                unreadCounts.set(msg.chat_id, (unreadCounts.get(msg.chat_id) || 0) + 1);
            });
        }
        
        // Получаем последние сообщения
        const lastMessages = new Map();
        for (const chat of validChats) {
            const { data: lastMsg } = await supabaseClient
                .from('messages')
                .select('text, user_id')
                .eq('chat_id', chat.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            
            if (lastMsg) {
                const isOwn = lastMsg.user_id === currentUser.id;
                const prefix = isOwn ? 'Вы: ' : '';
                let text = lastMsg.text || '';
                if (text && text.length > 50) text = text.slice(0, 47) + '...';
                lastMessages.set(chat.id, prefix + text);
            }
        }
        
        // Получаем профили
        const allParticipantIds = validChats.flatMap(c => c.participants || []);
        const uniqueIds = [...new Set(allParticipantIds)];
        
        const profileMap = new Map();
        if (uniqueIds.length > 0) {
            const { data: profiles } = await supabaseClient
                .from('profiles')
                .select('id, full_name, username, last_seen, is_online')
                .in('id', uniqueIds);
            
            if (profiles) {
                profiles.forEach(p => profileMap.set(p.id, p));
            }
        }
        profileMap.set(BOT_USER_ID, BOT_PROFILE);
        
        // Формируем данные
        const chatData = [];
        for (const chat of validChats) {
            const otherId = chat.participants?.find(id => id !== currentUser.id);
            
            if (chat.id === SAVED_CHAT_ID) {
                chatData.push({
                    id: chat.id,
                    otherId: SAVED_CHAT_ID,
                    otherUser: SAVED_CHAT,
                    name: 'Избранное',
                    isSaved: true,
                    isBot: false,
                    unreadCount: 0,
                    lastMessage: lastMessages.get(chat.id) || 'Сохраненные сообщения',
                    isOnline: false
                });
                continue;
            }
            
            const otherUser = profileMap.get(otherId);
            if (!otherUser && otherId !== BOT_USER_ID) continue;
            
            const name = otherUser?.full_name || otherUser?.username || 'Пользователь';
            const isBot = otherId === BOT_USER_ID;
            const unreadCount = unreadCounts.get(chat.id) || 0;
            const status = otherUser ? getUserStatusFromProfile(otherUser) : { class: '' };
            const isOnline = status.class === 'status-online';
            
            chatData.push({
                id: chat.id,
                otherId,
                otherUser,
                name,
                isBot,
                isSaved: false,
                unreadCount,
                lastMessage: lastMessages.get(chat.id) || 'Нет сообщений',
                isOnline: isOnline
            });
        }
        
        // Фильтрация по поиску
        let filteredData = chatData;
        if (searchTerm && !isUserSearch) {
            filteredData = chatData.filter(chat => 
                chat.name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        
        renderDialogsList(container, filteredData);
        
    } catch (err) {
        console.error('Ошибка загрузки диалогов:', err);
        container.innerHTML = '<div class="dialogs-loading">Ошибка: ' + (err.message || 'Неизвестная ошибка') + '</div>';
    } finally {
        isUpdatingDialogs = false;
    }
}
