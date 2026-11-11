(function () {
  'use strict';

  function $(id) {
    return document.getElementById(id);
  }

  function getInitials(name) {
    if (!name) return '';
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    return parts
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('');
  }

  function setStatus(message, type) {
    const el = $('chat-status');
    if (!el) return;
    el.textContent = message || '';
    el.dataset.type = type || '';
  }

  function formatContent(text) {
    if (!text) return '';
    let safe = String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    // Code blocks
    safe = safe.replace(/```([\s\S]*?)```/g, '<pre class="chat-pre"><code>$1</code></pre>');
    // Inline code
    safe = safe.replace(/`([^`]+)`/g, '<code class="chat-code">$1</code>');
    // Bold: **text**
    safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic: *text*
    safe = safe.replace(/(^|[^*])\*(?!\*)(.*?)\*(?!\*)/g, '$1<em>$2</em>');
    // Links: [text](url)
    safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="chat-link" target="_blank" rel="noopener noreferrer">$1</a>');
    // Bullet lists
    safe = safe.replace(/(^|\n)[•\-\*]\s+(.+)/g, '$1<div class="chat-bullet"><span class="chat-bullet-dot">•</span><span class="chat-bullet-text">$2</span></div>');
    // Newlines
    safe = safe.replace(/\n/g, '<br>');
    return safe;
  }

  function renderMessages(list, currentUserId, activeRoomType) {
    const container = $('chat-messages');
    if (!container) return;

    container.innerHTML = '';

    if (!Array.isArray(list) || list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'chat-empty';
      if (activeRoomType === 'ai') {
        empty.innerHTML = `
          <div class="chat-ai-welcome-box">
            <div class="chat-ai-welcome-icon">🤖</div>
            <div class="chat-ai-welcome-title">EventNest AI Concierge</div>
            <div class="chat-ai-welcome-desc">Hello! I'm connected live to your MongoDB events, tickets, and volunteer database. Ask me anything or tap one of the quick suggestions below.</div>
          </div>
        `;
      } else {
        empty.textContent = 'No messages yet. Start the conversation!';
      }
      container.appendChild(empty);
      return;
    }

    list.forEach((item) => {
      const msgEl = document.createElement('div');
      const isSelf = currentUserId && item.sender && item.sender.id === currentUserId;
      const isAI = item.sender && (
        item.sender.email === 'ai@eventnest.internal' ||
        item.sender.name === 'EventNest AI' ||
        item.sender.role === 'ai'
      );

      let classes = 'chat-message';
      if (isSelf) classes += ' chat-message-self';
      if (isAI) classes += ' chat-message-ai';
      msgEl.className = classes;

      const author = document.createElement('div');
      author.className = 'chat-message-author';
      if (isAI) {
        author.innerHTML = '<span class="chat-ai-author-icon">🤖</span> EventNest AI <span class="chat-ai-badge">AI Assistant</span>';
      } else {
        const name = item.sender && item.sender.name
          ? item.sender.name
          : 'User';
        author.textContent = isSelf ? 'You' : name;
      }

      const body = document.createElement('div');
      body.className = 'chat-message-body';
      body.innerHTML = formatContent(item.content || '');

      const meta = document.createElement('div');
      meta.className = 'chat-message-meta';
      if (item.createdAt) {
        try {
          const d = new Date(item.createdAt);
          meta.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (_) {
          meta.textContent = '';
        }
      }

      msgEl.appendChild(author);
      msgEl.appendChild(body);
      msgEl.appendChild(meta);
      container.appendChild(msgEl);
    });

    container.scrollTop = container.scrollHeight;
  }

  async function initChat() {
    const widget = $('chat-widget');
    const form = $('chat-form');
    const input = $('chat-input');

    if (!widget || !form || !input) {
      return;
    }

    const inputRow = widget.querySelector('.chat-input-row');
    const sendBtnEl = widget.querySelector('.chat-send-btn');

    function updateInputRowState() {
      if (!inputRow || !input) return;
      const hasText = !!((input.value || '').trim());
      inputRow.classList.toggle('has-text', hasText);
    }

    const hasAuthService = typeof AuthService !== 'undefined';
    const API_BASE = hasAuthService && AuthService.API_URL
      ? AuthService.API_URL
      : 'http://localhost:4000/api';

    // Socket.IO connection (for real-time updates)
    let socket = null;

    let currentUserId = null;
    let currentUserName = 'Guest';
    let currentUserEmail = '';
    let isAuthenticated = false;

    // Conversation state
    let activeRoomId = 'general';
    let activeRoomType = 'room'; // 'room' or 'dm'
    let activePartner = null; // for DMs: { id, name, email }
    let isSending = false;
    let allUsers = [];

    const headerAvatarEl = $('chat-header-avatar');
    const headerTitleEl = $('chat-header-title');
    const headerSubtitleEl = $('chat-header-subtitle');
    const currentAvatarEl = $('chat-current-avatar');
    const currentNameEl = $('chat-current-name');
    const currentEmailEl = $('chat-current-email');
    const dmListEl = $('chat-dm-list');
    const generalRoomLi = $('chat-room-general');
    const aiRoomLi = $('chat-room-ai');
    const quickPromptsContainer = $('chat-quick-prompts');
    const typingIndicatorEl = $('chat-typing');
    const emojiBtn = $('chat-emoji-btn');
    const emojiPopover = $('chat-emoji-popover');
    const attachBtn = $('chat-attach-btn');
    const fileInput = $('chat-file-input');
    const clearBtn = $('chat-clear-btn');
    const editProfileBtn = $('chat-edit-profile-btn');
    const profileModal = $('chat-profile-modal');
    const profileForm = $('chat-profile-form');
    const profileNameInput = $('chat-profile-name');
    const profileAddressInput = $('chat-profile-address');
    const profileStatusEl = $('chat-profile-status');
    const profileSaveBtn = $('chat-profile-save-btn');
    const userMenuToggle = $('chat-user-menu-toggle');
    const userMenu = $('chat-user-menu');
    const addContactBtn = $('chat-add-contact-btn');
    const contactModal = $('chat-contact-modal');
    const contactForm = $('chat-contact-form');
    const contactQueryInput = $('chat-contact-query');
    const contactStatusEl = $('chat-contact-status');
    const contactSaveBtn = $('chat-contact-save-btn');

    if (hasAuthService) {
      try {
        const auth = AuthService.getAuth();
        if (auth && auth.isAuthenticated) {
          isAuthenticated = true;
          if (auth.user) {
            currentUserId = auth.user.id || null;
            currentUserName = auth.user.name || 'User';
            currentUserEmail = auth.user.email || '';
          }
        }
      } catch (e) {
        console.error('Chat AuthService error:', e);
      }
    }

    function setProfileModalOpen(open) {
      if (!profileModal) return;
      const isOpen = !!open;
      profileModal.classList.toggle('open', isOpen);
      profileModal.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      profileModal.setAttribute('aria-modal', isOpen ? 'true' : 'false');
      if (!isOpen && profileStatusEl) {
        profileStatusEl.textContent = '';
      }
    }

    function setContactModalOpen(open) {
      if (!contactModal) return;
      const isOpen = !!open;
      contactModal.classList.toggle('open', isOpen);
      contactModal.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      contactModal.setAttribute('aria-modal', isOpen ? 'true' : 'false');
      if (!isOpen && contactStatusEl) {
        contactStatusEl.textContent = '';
      }
    }

    function getContactsForCurrentUser() {
      if (!currentUserId) return [];
      try {
        const raw = localStorage.getItem('chat_contacts_by_user');
        if (!raw) return [];
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return [];
        const list = data[currentUserId] || [];
        if (!Array.isArray(list)) return [];
        return list.filter((id) => typeof id === 'string' && id);
      } catch (err) {
        console.error('Read chat contacts error:', err);
        return [];
      }
    }

    function saveContactsForCurrentUser(contactIds) {
      if (!currentUserId) return;
      try {
        const clean = Array.isArray(contactIds)
          ? contactIds.filter((id) => typeof id === 'string' && id)
          : [];
        const raw = localStorage.getItem('chat_contacts_by_user');
        let data = {};
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
              data = parsed;
            }
          } catch (_) {
            data = {};
          }
        }
        data[currentUserId] = clean;
        localStorage.setItem('chat_contacts_by_user', JSON.stringify(data));
      } catch (err) {
        console.error('Save chat contacts error:', err);
      }
    }

    function addContactForCurrentUser(contactId) {
      if (!currentUserId || !contactId) return;
      const existing = getContactsForCurrentUser();
      if (existing.includes(contactId)) return;
      existing.push(contactId);
      saveContactsForCurrentUser(existing);
    }

    function renderUserMenu() {
      if (!userMenu) return;

      userMenu.innerHTML = '';

      let currentUser = null;
      if (hasAuthService && typeof AuthService.getAuth === 'function') {
        try {
          const authState = AuthService.getAuth();
          if (authState && authState.user) {
            currentUser = authState.user;
          }
        } catch (err) {
          console.error('Get current user for menu error:', err);
        }
      }

      if (currentUser) {
        const section = document.createElement('div');
        section.className = 'chat-user-menu-section chat-user-menu-section-current';

        const row = document.createElement('div');
        row.className = 'chat-user-menu-current-row';

        const avatar = document.createElement('div');
        avatar.className = 'chat-user-menu-avatar';
        avatar.textContent = getInitials(currentUser.name || '') || 'U';

        const textWrap = document.createElement('div');
        textWrap.className = 'chat-user-menu-current-text';

        const nameEl = document.createElement('div');
        nameEl.className = 'chat-user-menu-current-name';
        nameEl.textContent = currentUser.name || 'Current user';

        const labelEl = document.createElement('div');
        labelEl.className = 'chat-user-menu-current-label';
        labelEl.textContent = 'Current account';

        textWrap.appendChild(nameEl);
        textWrap.appendChild(labelEl);

        row.appendChild(avatar);
        row.appendChild(textWrap);

        section.appendChild(row);

        const actions = document.createElement('div');
        actions.className = 'chat-user-menu-actions';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'chat-user-menu-item';
        editBtn.textContent = 'Edit profile';
        editBtn.addEventListener('click', async () => {
          setUserMenuOpen(false);
          if (editProfileBtn) {
            editProfileBtn.click();
          }
        });

        const settingsBtn = document.createElement('button');
        settingsBtn.type = 'button';
        settingsBtn.className = 'chat-user-menu-item';
        settingsBtn.textContent = 'Settings';
        settingsBtn.addEventListener('click', () => {
          setUserMenuOpen(false);
          setStatus('Settings coming soon.', 'info');
        });

        const logoutBtn = document.createElement('button');
        logoutBtn.type = 'button';
        logoutBtn.className = 'chat-user-menu-item chat-user-menu-logout';
        logoutBtn.textContent = 'Logout';
        logoutBtn.addEventListener('click', async () => {
          setUserMenuOpen(false);
          try {
            if (hasAuthService && AuthService.logout) {
              await AuthService.logout();
            }
          } catch (err) {
            console.error('Chat logout error:', err);
          } finally {
            window.location.href = 'login.html?redirect=communication.html';
          }
        });

        actions.appendChild(editBtn);
        actions.appendChild(settingsBtn);
        actions.appendChild(logoutBtn);

        section.appendChild(actions);

        userMenu.appendChild(section);

        const divider = document.createElement('div');
        divider.className = 'chat-user-menu-divider';
        userMenu.appendChild(divider);
      }

      let accounts = [];
      if (hasAuthService && typeof AuthService.getAccountList === 'function') {
        try {
          accounts = AuthService.getAccountList() || [];
        } catch (err) {
          console.error('Get account list error:', err);
        }
      }

      const switchTitle = document.createElement('div');
      switchTitle.className = 'chat-user-menu-switch-title';
      switchTitle.textContent = 'Switch account';
      userMenu.appendChild(switchTitle);

      if (!accounts.length) {
        const empty = document.createElement('div');
        empty.className = 'chat-user-menu-empty';
        empty.textContent = 'No other accounts yet';
        userMenu.appendChild(empty);

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'chat-user-menu-item';
        addBtn.textContent = 'Sign in as new user';
        addBtn.addEventListener('click', () => {
          setUserMenuOpen(false);
          window.location.href = 'login.html?redirect=communication.html';
        });
        userMenu.appendChild(addBtn);
        return;
      }

      accounts.forEach((acc) => {
        if (!acc || !acc.user) return;
        const label = acc.user.name || 'User';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chat-user-menu-item' + (acc.isActive ? ' active' : '');
        btn.textContent = acc.isActive ? `${label} (current)` : label;

        btn.addEventListener('click', async () => {
          setUserMenuOpen(false);
          if (acc.isActive) {
            return;
          }
          try {
            if (hasAuthService && typeof AuthService.switchAccount === 'function') {
              await AuthService.switchAccount(acc.key);
            }
            window.location.reload();
          } catch (err) {
            console.error('Switch chat account error:', err);
            setStatus('Failed to switch account.', 'error');
          }
        });

        userMenu.appendChild(btn);
      });

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'chat-user-menu-item';
      addBtn.textContent = 'Add another account';
      addBtn.addEventListener('click', () => {
        setUserMenuOpen(false);
        window.location.href = 'login.html?redirect=communication.html';
      });
      userMenu.appendChild(addBtn);
    }

    function setUserMenuOpen(open) {
      if (!userMenu || !userMenuToggle) return;
      const isOpen = !!open;
      if (isOpen) {
        renderUserMenu();
      }
      userMenu.classList.toggle('open', isOpen);
      userMenuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }

    async function prefillProfileForm() {
      if (!profileForm || !hasAuthService) return;
      try {
        if (profileStatusEl) profileStatusEl.textContent = '';
        const user = await AuthService.getProfile();
        if (user && typeof user === 'object') {
          if (profileNameInput) profileNameInput.value = user.name || '';
          if (profileAddressInput) profileAddressInput.value = user.address || '';

          currentUserId = user.id || currentUserId;
          currentUserName = user.name || currentUserName;
          currentUserEmail = user.email || currentUserEmail;

          if (currentNameEl) currentNameEl.textContent = currentUserName;
          if (currentEmailEl) currentEmailEl.textContent = '';
          if (currentAvatarEl) {
            const initials = getInitials(currentUserName) || 'U';
            currentAvatarEl.textContent = initials;
          }
          updateHeader();
        }
      } catch (err) {
        console.error('Prefill chat profile error:', err);
        if (profileStatusEl) {
          profileStatusEl.textContent = 'Unable to load your profile.';
        }
      }
    }

    // Populate current user UI (hide email from display)
    if (currentNameEl) {
      currentNameEl.textContent = currentUserName;
    }
    if (currentEmailEl) {
      currentEmailEl.textContent = '';
    }
    if (currentAvatarEl) {
      const initials = getInitials(currentUserName) || 'U';
      currentAvatarEl.textContent = initials;
    }

    if (!isAuthenticated) {
      setStatus('You are viewing chat as a guest. Log in to send messages.', 'info');
    } else {
      setStatus('', '');
    }

    function buildDmRoomId(userIdA, userIdB) {
      const ids = [String(userIdA || ''), String(userIdB || '')].sort();
      return `dm:${ids[0]}:${ids[1]}`;
    }

    function updateHeader() {
      if (!headerTitleEl || !headerSubtitleEl || !headerAvatarEl) return;

      if (activeRoomType === 'room') {
        headerAvatarEl.textContent = '#';
        headerTitleEl.innerHTML = 'General <span class="chat-ai-pill">AI Active</span>';
        headerSubtitleEl.textContent = 'Group discussion • EventNest AI responds 24/7';
      } else if (activeRoomType === 'ai') {
        headerAvatarEl.textContent = '🤖';
        headerTitleEl.innerHTML = 'EventNest AI <span class="chat-ai-pill">Private AI</span>';
        headerSubtitleEl.textContent = 'Private 1-on-1 concierge for events, tickets & planning';
      } else if (activeRoomType === 'dm' && activePartner) {
        const initials = getInitials(activePartner.name || '') || 'U';
        headerAvatarEl.textContent = initials;
        headerTitleEl.textContent = activePartner.name || 'Direct message';
        headerSubtitleEl.textContent = 'Direct message';
      }
    }

    function setActiveConversationInSidebar() {
      const container = $('chat-widget');
      if (!container) return;

      const items = container.querySelectorAll('.chat-conversation-item');
      items.forEach((item) => {
        item.classList.remove('chat-conversation-active');
      });

      if (activeRoomType === 'room') {
        if (generalRoomLi) {
          generalRoomLi.classList.add('chat-conversation-active');
        }
      } else if (activeRoomType === 'ai') {
        if (aiRoomLi) {
          aiRoomLi.classList.add('chat-conversation-active');
        }
      } else if (activeRoomType === 'dm' && activePartner && dmListEl) {
        const selector = `[data-dm-user-id="${activePartner.id}"]`;
        const activeLi = dmListEl.querySelector(selector);
        if (activeLi) {
          activeLi.classList.add('chat-conversation-active');
        }
      }
    }

    function joinActiveRoomOnSocket() {
      if (!socket || !activeRoomId) return;
      try {
        socket.emit('chat:join', { roomId: activeRoomId });
      } catch (err) {
        console.error('Socket join error in frontend:', err);
      }
    }

    let lastMessages429At = 0;

    async function loadMessages(showErrors) {
      try {
        const roomId = activeRoomId || 'general';
        const roomParam = encodeURIComponent(roomId);

        let res;
        const isDmRoom = roomId.startsWith('dm:');
        const isAiPrivateRoom = roomId.startsWith('ai:');

        if (isDmRoom || isAiPrivateRoom) {
          if (!hasAuthService) {
            if (showErrors) {
              setStatus('Login required to view this conversation.', 'error');
            }
            return;
          }

          const auth = AuthService.getAuth();
          if (!auth || !auth.isAuthenticated) {
            if (showErrors) {
              setStatus('Please log in to view this conversation.', 'error');
            }
            return;
          }

          res = await AuthService.authenticatedFetch(`${API_BASE}/chat/messages?room=${roomParam}`);
        } else {
          // Public history for non-DM rooms
          res = await fetch(`${API_BASE}/chat/messages?room=${roomParam}`);
        }

        if (!res.ok) {
          if (res.status === 429) {
            lastMessages429At = Date.now();
          }

          if (showErrors) {
            let message = 'Failed to load messages.';
            try {
              const errData = await res.json();
              if (errData && errData.message) {
                message = errData.message;
              }
            } catch (_) {
              // ignore parse errors
            }
            setStatus(message, 'error');
          }
          return;
        }

        const data = await res.json().catch(() => ({ messages: [] }));

        const container = $('chat-messages');
        if (container) {
          const msgs = Array.isArray(data.messages) ? data.messages : [];
          container.dataset.snapshot = JSON.stringify(msgs);
        }

        renderMessages(data.messages || [], currentUserId, activeRoomType);
      } catch (err) {
        console.error('Load chat messages error:', err);
        if (showErrors) {
          setStatus('Unable to load messages. Please check your connection.', 'error');
        }
      }
    }

    async function loadUsers() {
      if (!dmListEl) return;

      dmListEl.innerHTML = '';

      if (!isAuthenticated || !hasAuthService || !currentUserId) {
        const li = document.createElement('li');
        li.className = 'chat-sidebar-empty';
        li.textContent = 'Log in to manage your contacts and direct messages.';
        dmListEl.appendChild(li);
        return;
      }

      try {
        const res = await AuthService.authenticatedFetch(`${API_BASE}/chat/users`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error((data && data.message) || 'Failed to load chat users');
        }

        const users = Array.isArray(data.users) ? data.users : [];
        allUsers = users;

        const otherUsers = users.filter((u) => u.id !== currentUserId);
        const contactIds = getContactsForCurrentUser();

        if (!contactIds.length) {
          const li = document.createElement('li');
          li.className = 'chat-sidebar-empty';
          li.textContent = 'No contacts yet. Use "+ Add contact" to add someone.';
          dmListEl.appendChild(li);
          return;
        }

        const contacts = contactIds
          .map((id) => otherUsers.find((u) => u.id === id))
          .filter((u) => !!u);

        if (!contacts.length) {
          const li = document.createElement('li');
          li.className = 'chat-sidebar-empty';
          li.textContent = 'No contacts available right now.';
          dmListEl.appendChild(li);
          return;
        }

        contacts.forEach((user) => {
          const li = document.createElement('li');
          li.className = 'chat-conversation-item';
          li.dataset.dmUserId = user.id;

          const avatar = document.createElement('div');
          avatar.className = 'chat-conversation-avatar';
          avatar.textContent = getInitials(user.name || '') || 'U';

          const textWrap = document.createElement('div');
          textWrap.className = 'chat-conversation-text';

          const nameEl = document.createElement('div');
          nameEl.className = 'chat-conversation-name';
          nameEl.textContent = user.name || 'User';

          const subtitleEl = document.createElement('div');
          subtitleEl.className = 'chat-conversation-subtitle';
          subtitleEl.textContent = 'Available';

          textWrap.appendChild(nameEl);
          textWrap.appendChild(subtitleEl);

          li.appendChild(avatar);
          li.appendChild(textWrap);

          li.addEventListener('click', async () => {
            activeRoomType = 'dm';
            activePartner = { id: user.id, name: user.name, email: user.email };
            activeRoomId = buildDmRoomId(currentUserId, user.id);
            updateHeader();
            setActiveConversationInSidebar();
            joinActiveRoomOnSocket();
            await loadMessages(true);
          });

          dmListEl.appendChild(li);
        });
      } catch (err) {
        console.error('Load chat users error:', err);
        const li = document.createElement('li');
        li.className = 'chat-sidebar-empty';

        let message = 'Failed to load users.';

        // If auth is no longer valid, treat this as a session-expired state
        if (hasAuthService) {
          try {
            const auth = AuthService.getAuth();
            if (!auth || !auth.isAuthenticated) {
              message = 'Session expired. Log in again to manage contacts.';
              setTimeout(() => {
                window.location.href = 'login.html?redirect=communication.html';
              }, 1200);
            }
          } catch (_) {
            // ignore
          }
        }

        // If the error itself has a useful message (e.g. rate limit), surface it
        if (err && err.message && message === 'Failed to load users.') {
          message = err.message;
        }

        li.textContent = message;
        dmListEl.appendChild(li);
        setStatus(message, 'error');
      }
    }

    // Input interactions
    input.addEventListener('focus', () => {
      if (inputRow) inputRow.classList.add('focused');
    });

    input.addEventListener('blur', () => {
      if (inputRow) inputRow.classList.remove('focused');
    });

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      updateInputRowState();
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        } else {
          form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
      }
    });

    updateInputRowState();

    // Initial header state
    updateHeader();

    // Hook up General room click
    if (generalRoomLi) {
      generalRoomLi.addEventListener('click', async () => {
        activeRoomType = 'room';
        activePartner = null;
        activeRoomId = 'general';
        updateHeader();
        setActiveConversationInSidebar();
        joinActiveRoomOnSocket();
        await loadMessages(true);
      });
    }

    // Hook up EventNest AI Assistant room click
    if (aiRoomLi) {
      aiRoomLi.addEventListener('click', async () => {
        activeRoomType = 'ai';
        activePartner = null;
        activeRoomId = currentUserId ? `ai:${currentUserId}` : 'ai-assistant';
        updateHeader();
        setActiveConversationInSidebar();
        joinActiveRoomOnSocket();
        await loadMessages(true);
      });
    }

    // Hook up Quick Prompts
    if (quickPromptsContainer) {
      const chips = quickPromptsContainer.querySelectorAll('.chat-chip');
      chips.forEach((chip) => {
        chip.addEventListener('click', () => {
          const prompt = chip.dataset.prompt || chip.textContent;
          if (!prompt) return;

          input.value = prompt;
          input.focus();
          updateInputRowState();

          if (isAuthenticated && typeof form.requestSubmit === 'function') {
            form.requestSubmit();
          }
        });
      });
    }

    // Hook up Emoji picker
    if (emojiBtn && emojiPopover) {
      emojiBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const isHidden = emojiPopover.style.display === 'none' || !emojiPopover.style.display;
        emojiPopover.style.display = isHidden ? 'block' : 'none';
        emojiBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
      });

      const emojiItems = emojiPopover.querySelectorAll('.chat-emoji-item');
      emojiItems.forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          const emoji = btn.dataset.emoji || btn.textContent;
          if (emoji && input) {
            const start = input.selectionStart || input.value.length;
            const end = input.selectionEnd || input.value.length;
            const val = input.value;
            input.value = val.substring(0, start) + emoji + val.substring(end);
            input.selectionStart = input.selectionEnd = start + emoji.length;
            input.focus();
            updateInputRowState();
          }
          emojiPopover.style.display = 'none';
          emojiBtn.setAttribute('aria-expanded', 'false');
        });
      });

      window.addEventListener('click', (event) => {
        if (!emojiPopover.contains(event.target) && event.target !== emojiBtn) {
          emojiPopover.style.display = 'none';
          emojiBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // Hook up File Attachment
    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', () => {
        fileInput.click();
      });

      fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
          setStatus('File too large (max 5MB).', 'error');
          fileInput.value = '';
          return;
        }

        const sizeKb = Math.round(file.size / 1024);
        const tag = `📎 [Attachment: ${file.name} (${sizeKb} KB)]`;
        if (input) {
          const existing = (input.value || '').trim();
          input.value = existing ? `${existing} ${tag}` : tag;
          input.focus();
          updateInputRowState();
        }
        setStatus(`Attached ${file.name}`, 'info');
        setTimeout(() => setStatus('', ''), 2500);
        fileInput.value = '';
      });
    }

    if (contactForm) {
      contactForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!hasAuthService) {
          if (contactStatusEl) contactStatusEl.textContent = 'Login system not available.';
          return;
        }

        const auth = AuthService.getAuth();
        if (!auth || !auth.isAuthenticated) {
          if (contactStatusEl) contactStatusEl.textContent = 'Please log in to add contacts.';
          setTimeout(() => {
            window.location.href = 'login.html?redirect=communication.html';
          }, 900);
          return;
        }

        const query = (contactQueryInput && contactQueryInput.value) ? contactQueryInput.value.trim() : '';
        if (!query) {
          if (contactStatusEl) contactStatusEl.textContent = 'Please enter an email or username.';
          if (contactQueryInput) contactQueryInput.focus();
          return;
        }

        try {
          if (contactStatusEl) contactStatusEl.textContent = 'Looking up user...';
          if (contactSaveBtn) contactSaveBtn.disabled = true;

          if (!allUsers.length) {
            await loadUsers();
          }

          // If we still have no users at all, the list likely failed to load
          if (!allUsers.length) {
            if (contactStatusEl) {
              contactStatusEl.textContent = 'Unable to load user list right now. Please try again later.';
            }
            return;
          }

          const q = query.toLowerCase();
          const candidates = allUsers.filter((u) => u && u.id && u.id !== currentUserId);

          // If there are no other users, adding contacts is not possible yet
          if (!candidates.length) {
            if (contactStatusEl) {
              contactStatusEl.textContent = 'No other users are available yet. Ask someone else to create an account, then try again.';
            }
            return;
          }

          let match = candidates.find((u) =>
            (u.email && u.email.toLowerCase() === q) ||
            (u.name && u.name.toLowerCase() === q)
          );

          if (!match) {
            match = candidates.find((u) =>
              (u.email && u.email.toLowerCase().includes(q)) ||
              (u.name && u.name.toLowerCase().includes(q))
            );
          }

          if (!match) {
            if (contactStatusEl) {
              contactStatusEl.textContent = 'No user found with that email or username. Make sure they have an account and you typed it correctly.';
            }
            return;
          }

          addContactForCurrentUser(match.id);
          await loadUsers();

          if (contactStatusEl) {
            contactStatusEl.textContent = `Added ${match.name || match.email || 'contact'} to your contacts.`;
          }
          setTimeout(() => {
            setContactModalOpen(false);
          }, 700);
        } catch (err) {
          console.error('Add chat contact error:', err);
          if (contactStatusEl) contactStatusEl.textContent = 'Failed to save contact.';
        } finally {
          if (contactSaveBtn) contactSaveBtn.disabled = false;
        }
      });
    }

    if (userMenuToggle && userMenu) {
      userMenuToggle.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = userMenu.classList.contains('open');
        setUserMenuOpen(!isOpen);
      });
    }

    if (addContactBtn) {
      addContactBtn.addEventListener('click', async () => {
        if (!hasAuthService) {
          setStatus('Login system not available. Please refresh the page.', 'error');
          return;
        }

        const auth = AuthService.getAuth();
        if (!auth || !auth.isAuthenticated) {
          setStatus('Log in to add contacts and start direct messages.', 'info');
          setTimeout(() => {
            window.location.href = 'login.html?redirect=communication.html';
          }, 900);
          return;
        }

        try {
          if (!allUsers.length) {
            await loadUsers();
          }
        } catch (err) {
          console.error('Refresh users before add-contact error:', err);
        }

        if (contactStatusEl) contactStatusEl.textContent = '';
        if (contactQueryInput) contactQueryInput.value = '';
        setContactModalOpen(true);
        if (contactQueryInput) {
          setTimeout(() => contactQueryInput.focus(), 50);
        }
      });
    }

    await loadMessages(true);
    await loadUsers();

    if (editProfileBtn && profileModal) {
      editProfileBtn.addEventListener('click', async () => {
        if (!hasAuthService) {
          setStatus('Login system not available. Please refresh the page.', 'error');
          return;
        }

        const auth = AuthService.getAuth();
        if (!auth || !auth.isAuthenticated) {
          setStatus('Please log in to edit your profile.', 'error');
          setTimeout(() => {
            window.location.href = 'login.html?redirect=communication.html';
          }, 1200);
          return;
        }

        await prefillProfileForm();
        setProfileModalOpen(true);
      });
    }

    if (profileModal) {
      const closeEls = profileModal.querySelectorAll('[data-chat-profile-close]');
      closeEls.forEach((el) => {
        el.addEventListener('click', () => setProfileModalOpen(false));
      });
    }

    if (contactModal) {
      const closeEls = contactModal.querySelectorAll('[data-chat-contact-close]');
      closeEls.forEach((el) => {
        el.addEventListener('click', () => setContactModalOpen(false));
      });
    }

    if (profileForm) {
      profileForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!hasAuthService) {
          if (profileStatusEl) profileStatusEl.textContent = 'Login system not available.';
          return;
        }

        const auth = AuthService.getAuth();
        if (!auth || !auth.isAuthenticated) {
          if (profileStatusEl) profileStatusEl.textContent = 'Please log in to edit your profile.';
          setTimeout(() => {
            window.location.href = 'login.html?redirect=communication.html';
          }, 1200);
          return;
        }

        const name = (profileNameInput && profileNameInput.value || '').trim();
        const address = (profileAddressInput && profileAddressInput.value || '').trim();

        if (!name) {
          if (profileStatusEl) profileStatusEl.textContent = 'Name is required.';
          if (profileNameInput) profileNameInput.focus();
          return;
        }

        try {
          if (profileStatusEl) profileStatusEl.textContent = 'Saving...';
          if (profileSaveBtn) profileSaveBtn.disabled = true;

          const res = await AuthService.authenticatedFetch(`${API_BASE}/auth/me`, {
            method: 'PUT',
            body: JSON.stringify({ name, address }),
          });

          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const msg = data && (data.message || data.error);
            throw new Error(msg || 'Failed to update profile');
          }

          const user = data.user || {};
          currentUserId = user.id || currentUserId;
          currentUserName = user.name || currentUserName;
          currentUserEmail = user.email || currentUserEmail;

          if (currentNameEl) currentNameEl.textContent = currentUserName;
          if (currentEmailEl) currentEmailEl.textContent = currentUserEmail;
          if (currentAvatarEl) {
            const initials = getInitials(currentUserName || currentUserEmail) || 'U';
            currentAvatarEl.textContent = initials;
          }
          updateHeader();

          if (hasAuthService) {
            const latestAuth = AuthService.getAuth();
            if (latestAuth && latestAuth.token && latestAuth.refreshToken) {
              const mergedUser = Object.assign({}, latestAuth.user || {}, user);
              AuthService.saveAuth(latestAuth.token, latestAuth.refreshToken, mergedUser);
            }
          }

          if (profileStatusEl) profileStatusEl.textContent = 'Profile updated.';
          setTimeout(() => {
            setProfileModalOpen(false);
          }, 600);
        } catch (err) {
          console.error('Update chat profile error:', err);
          if (profileStatusEl) {
            profileStatusEl.textContent = err.message || 'Failed to update profile.';
          }
        } finally {
          if (profileSaveBtn) profileSaveBtn.disabled = false;
        }
      });
    }

    // Establish Socket.IO connection after initial load
    try {
      if (typeof io !== 'undefined') {
        const socketURL = API_BASE.replace(/\/api$/i, '');

        let authPayload;
        if (hasAuthService && typeof AuthService.getAuth === 'function') {
          try {
            const auth = AuthService.getAuth();
            if (auth && auth.token) {
              authPayload = { token: auth.token };
            }
          } catch (err) {
            console.error('Socket auth payload error:', err);
          }
        }

        socket = io(socketURL, {
          transports: ['websocket', 'polling'],
          withCredentials: true,
          auth: authPayload,
        });

        socket.on('connect', () => {
          joinActiveRoomOnSocket();
        });

        socket.on('chat:message', (payload) => {
          // Only render messages for the room currently open
          if (!payload || !payload.room || payload.room !== activeRoomId) return;

          if (typingIndicatorEl) {
            typingIndicatorEl.style.display = 'none';
          }

          const container = $('chat-messages');
          if (!container) return;

          // Append this single message instead of reloading everything
          const list = container.dataset.snapshot
            ? JSON.parse(container.dataset.snapshot)
            : [];
          list.push(payload);
          container.dataset.snapshot = JSON.stringify(list);
          renderMessages(list, currentUserId, activeRoomType);
        });

        socket.on('chat:typing', (payload) => {
          if (!payload || !payload.room || payload.room !== activeRoomId) return;
          if (!typingIndicatorEl) return;
          if (payload.isTyping) {
            typingIndicatorEl.style.display = 'flex';
            const container = $('chat-messages');
            if (container) container.scrollTop = container.scrollHeight;
          } else {
            typingIndicatorEl.style.display = 'none';
          }
        });

        socket.on('chat:cleared', (info) => {
          if (!info || !info.room || info.room !== activeRoomId) return;

          const container = $('chat-messages');
          if (container) {
            container.dataset.snapshot = JSON.stringify([]);
          }

          renderMessages([], currentUserId);
          setStatus('Conversation cleared.', 'info');
        });
      }
    } catch (err) {
      console.error('Socket.IO init error:', err);
    }

    // Fallback polling to keep things in sync even if websockets fail.
    // Poll less frequently and back off if we recently hit a 429 from the API.
    const intervalId = setInterval(() => {
      const now = Date.now();
      if (lastMessages429At && now - lastMessages429At < 60_000) {
        // Skip polling for ~60 seconds after a rate-limit response
        return;
      }
      loadMessages(false);
    }, 15_000);

    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        if (!hasAuthService) {
          setStatus('Login system not available. Please refresh the page.', 'error');
          return;
        }

        const auth = AuthService.getAuth();
        if (!auth || !auth.isAuthenticated) {
          setStatus('Please log in to manage messages.', 'error');
          setTimeout(() => {
            window.location.href = 'login.html?redirect=communication.html';
          }, 1200);
          return;
        }

        const room = activeRoomId || 'general';
        if (!room) return;

        const confirmed = window.confirm('Clear all messages in this conversation?');
        if (!confirmed) return;

        try {
          setStatus('Clearing conversation...', 'info');
          const roomParam = encodeURIComponent(room);
          const res = await AuthService.authenticatedFetch(`${API_BASE}/chat/messages?room=${roomParam}`, {
            method: 'DELETE',
          });

          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error((data && data.message) || 'Failed to clear messages');
          }

          await loadMessages(false);
          setStatus('Conversation cleared.', 'info');
        } catch (err) {
          console.error('Clear chat messages error:', err);
          setStatus(err.message || 'Failed to clear messages', 'error');
        }
      });
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();

      if (isSending) {
        return;
      }

      const text = (input.value || '').trim();
      if (!text) {
        return;
      }

      if (!hasAuthService) {
        setStatus('Login system not available. Please refresh the page.', 'error');
        return;
      }

      const auth = AuthService.getAuth();
      if (!auth || !auth.isAuthenticated) {
        setStatus('Please log in to send messages.', 'error');
        setTimeout(() => {
          window.location.href = 'login.html?redirect=communication.html';
        }, 1200);
        return;
      }

      try {
        isSending = true;
        if (sendBtnEl) sendBtnEl.disabled = true;
        input.readOnly = true;
        setStatus('Sending...', 'info');
        const room = activeRoomId || 'general';

        const isAiTriggered = activeRoomType === 'ai' || /(@ai\b|@bot\b|^ai[:, ]|\/ai\b)/i.test(text);
        if (isAiTriggered && typingIndicatorEl) {
          typingIndicatorEl.style.display = 'flex';
          const container = $('chat-messages');
          if (container) container.scrollTop = container.scrollHeight;
        }

        const res = await AuthService.authenticatedFetch(`${API_BASE}/chat/messages`, {
          method: 'POST',
          body: JSON.stringify({ content: text, room }),
        });

        const data = await res.json();
        if (!res.ok) {
          const msg = data && (data.message || data.error);
          throw new Error(msg || 'Failed to send message');
        }

        input.value = '';
        input.style.height = '';
        updateInputRowState();
        setStatus('', '');

        // Let websocket handle live updates; still call loadMessages as a safety
        await loadMessages(false);
      } catch (err) {
        console.error('Send chat message error:', err);
        setStatus(err.message || 'Failed to send message', 'error');
      } finally {
        isSending = false;
        if (sendBtnEl) sendBtnEl.disabled = false;
        input.readOnly = false;
      }
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (profileModal && profileModal.classList.contains('open')) {
          setProfileModalOpen(false);
        }
        if (contactModal && contactModal.classList.contains('open')) {
          setContactModalOpen(false);
        }
        if (userMenu && userMenu.classList.contains('open')) {
          setUserMenuOpen(false);
        }
      }
    });

    window.addEventListener('click', (event) => {
      if (!userMenu || !userMenuToggle) return;
      const target = event.target;
      if (!userMenu.classList.contains('open')) return;
      if (target === userMenuToggle || userMenuToggle.contains(target)) return;
      if (userMenu.contains(target)) return;
      setUserMenuOpen(false);
    });

    window.addEventListener('beforeunload', function () {
      clearInterval(intervalId);
      try {
        if (socket) {
          socket.disconnect();
        }
      } catch (_) {
        // ignore
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChat);
  } else {
    initChat();
  }
})();
