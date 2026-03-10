/**
 * Northbridge Digital — AI Chatbot Widget
 * Embed with: <script src="https://YOUR_SERVER/widget.js"></script>
 */
(function () {
  'use strict';

  // ─── Config ──────────────────────────────────────────────────────────────────
  const cfg = window.NorthbridgeChat || {};
  const SERVER_URL = cfg.serverUrl || (function () {
    const s = document.querySelector('script[src*="widget.js"]');
    return s ? s.src.replace('/widget.js', '') : window.location.origin;
  })();
  const PRIMARY   = cfg.primaryColor || '#2563EB';
  const ACCENT    = cfg.accentColor  || '#F97316';
  const BOT_NAME  = cfg.botName      || 'Aria';
  const GREETING  = cfg.greeting     || "👋 Hi there! I'm Aria, the Northbridge Digital assistant. How can I help you today?";

  // ─── State ───────────────────────────────────────────────────────────────────
  let socket = null;
  let sessionId = localStorage.getItem('nb_session_id') || null;
  let isOpen = false;
  let isConnected = false;
  let unreadCount = 0;
  let agentTyping = false;
  let greetingShown = false;

  // ─── Inject Styles ───────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #nb-chat-root * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
    #nb-chat-root { position: fixed; bottom: 24px; right: 24px; z-index: 999999; }

    /* Bubble */
    #nb-bubble {
      width: 60px; height: 60px; border-radius: 50%;
      background: linear-gradient(135deg, ${PRIMARY}, #3B82F6);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 20px rgba(37,99,235,.45);
      transition: transform .2s, box-shadow .2s; position: relative;
    }
    #nb-bubble:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(37,99,235,.55); }
    #nb-bubble svg { width: 28px; height: 28px; color: #fff; transition: opacity .2s; }
    #nb-bubble .nb-close-icon { display: none; }
    #nb-chat-root.nb-open #nb-bubble .nb-chat-icon { display: none; }
    #nb-chat-root.nb-open #nb-bubble .nb-close-icon { display: block; }

    /* Badge */
    #nb-badge {
      position: absolute; top: -4px; right: -4px;
      background: ${ACCENT}; color: #fff; font-size: 11px; font-weight: 700;
      width: 20px; height: 20px; border-radius: 50%; display: none;
      align-items: center; justify-content: center; border: 2px solid #fff;
    }
    #nb-badge.nb-show { display: flex; }

    /* Popup */
    #nb-popup {
      position: absolute; bottom: 76px; right: 0;
      width: 370px; height: 560px; background: #fff;
      border-radius: 20px; box-shadow: 0 12px 48px rgba(0,0,0,.18);
      display: flex; flex-direction: column; overflow: hidden;
      opacity: 0; transform: translateY(12px) scale(.97); pointer-events: none;
      transition: opacity .22s ease, transform .22s ease;
    }
    #nb-chat-root.nb-open #nb-popup { opacity: 1; transform: translateY(0) scale(1); pointer-events: all; }

    /* Header */
    #nb-header {
      background: linear-gradient(135deg, ${PRIMARY} 0%, #1D4ED8 100%);
      padding: 16px 18px; display: flex; align-items: center; gap: 12px; flex-shrink: 0;
    }
    #nb-avatar {
      width: 42px; height: 42px; border-radius: 50%;
      background: rgba(255,255,255,.2); border: 2px solid rgba(255,255,255,.35);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    #nb-avatar svg { width: 22px; height: 22px; color: #fff; }
    #nb-header-info { flex: 1; }
    #nb-header-name { font-size: 15px; font-weight: 700; color: #fff; line-height: 1.2; }
    #nb-header-status { font-size: 12px; color: rgba(255,255,255,.75); display: flex; align-items: center; gap: 5px; margin-top: 2px; }
    .nb-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ADE80; flex-shrink: 0; }
    #nb-header-minimize { background: none; border: none; cursor: pointer; color: rgba(255,255,255,.7); padding: 4px; border-radius: 6px; line-height: 0; }
    #nb-header-minimize:hover { color: #fff; background: rgba(255,255,255,.1); }

    /* Messages */
    #nb-messages {
      flex: 1; overflow-y: auto; padding: 16px 14px; display: flex; flex-direction: column; gap: 10px;
      scroll-behavior: smooth;
    }
    #nb-messages::-webkit-scrollbar { width: 4px; }
    #nb-messages::-webkit-scrollbar-track { background: transparent; }
    #nb-messages::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }

    /* Message bubbles */
    .nb-msg { display: flex; gap: 8px; max-width: 88%; }
    .nb-msg.nb-user { align-self: flex-end; flex-direction: row-reverse; }
    .nb-msg.nb-bot, .nb-msg.nb-system, .nb-msg.nb-agent { align-self: flex-start; }
    .nb-msg-av {
      width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
      background: linear-gradient(135deg, ${PRIMARY}, #3B82F6);
      display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #fff;
    }
    .nb-msg-av.nb-agent-av { background: linear-gradient(135deg, #22C55E, #16A34A); }
    .nb-msg-bubble {
      padding: 10px 13px; border-radius: 16px; font-size: 14px; line-height: 1.6; word-break: break-word;
    }
    .nb-msg.nb-bot .nb-msg-bubble, .nb-msg.nb-agent .nb-msg-bubble {
      background: #F1F5F9; color: #1E293B; border-bottom-left-radius: 4px;
    }
    .nb-msg.nb-user .nb-msg-bubble {
      background: linear-gradient(135deg, ${PRIMARY}, #3B82F6); color: #fff; border-bottom-right-radius: 4px;
    }
    .nb-msg.nb-system .nb-msg-bubble {
      background: #FFF7ED; color: #9A3412; font-size: 13px; border-radius: 10px;
      border: 1px solid #FED7AA; width: 100%; text-align: center;
    }
    .nb-msg.nb-agent .nb-msg-bubble {
      background: #DCFCE7; color: #14532D; border-bottom-left-radius: 4px;
    }
    .nb-msg-time { font-size: 10px; color: #94A3B8; margin-top: 3px; padding: 0 4px; }

    /* Typing indicator */
    #nb-typing {
      display: none; align-self: flex-start; align-items: center; gap: 8px;
      padding: 10px 13px; background: #F1F5F9; border-radius: 16px; border-bottom-left-radius: 4px;
    }
    #nb-typing.nb-show { display: flex; }
    .nb-dot-pulse { display: flex; gap: 4px; }
    .nb-dot-pulse span {
      width: 7px; height: 7px; border-radius: 50%; background: #94A3B8; animation: nbPulse 1.2s infinite;
    }
    .nb-dot-pulse span:nth-child(2) { animation-delay: .2s; }
    .nb-dot-pulse span:nth-child(3) { animation-delay: .4s; }
    @keyframes nbPulse { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }

    /* Quick actions */
    #nb-quick-actions { padding: 6px 14px 0; display: flex; gap: 6px; flex-wrap: wrap; }
    .nb-qa-btn {
      font-size: 12px; padding: 5px 11px; border-radius: 100px;
      border: 1.5px solid #CBD5E1; background: #fff; color: #475569;
      cursor: pointer; transition: all .15s; white-space: nowrap;
    }
    .nb-qa-btn:hover { border-color: ${PRIMARY}; color: ${PRIMARY}; background: #EFF6FF; }

    /* Human request button */
    #nb-human-btn {
      margin: 6px 14px 0; padding: 8px 12px;
      background: #FFF7ED; border: 1.5px solid #FED7AA; border-radius: 10px;
      color: #9A3412; font-size: 12px; cursor: pointer; text-align: center;
      transition: all .15s; display: none;
    }
    #nb-human-btn:hover { background: #FFEDD5; border-color: ${ACCENT}; }
    #nb-human-btn.nb-show { display: block; }
    #nb-human-btn.nb-hide { display: none; }

    /* Input area */
    #nb-input-area {
      padding: 12px 14px; border-top: 1px solid #E2E8F0; display: flex; gap: 8px; flex-shrink: 0;
      background: #fff;
    }
    #nb-input {
      flex: 1; padding: 10px 14px; border: 1.5px solid #E2E8F0; border-radius: 12px;
      font-size: 14px; resize: none; outline: none; line-height: 1.5; max-height: 80px;
      transition: border-color .15s; font-family: inherit; color: #1E293B;
    }
    #nb-input:focus { border-color: ${PRIMARY}; }
    #nb-input::placeholder { color: #94A3B8; }
    #nb-send {
      width: 40px; height: 40px; border-radius: 12px; border: none; cursor: pointer;
      background: linear-gradient(135deg, ${PRIMARY}, #3B82F6);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      transition: opacity .15s, transform .15s; align-self: flex-end;
    }
    #nb-send:hover { opacity: .9; transform: scale(1.05); }
    #nb-send svg { width: 18px; height: 18px; color: #fff; }

    /* Branding */
    #nb-branding { padding: 6px 14px 8px; text-align: center; font-size: 10px; color: #CBD5E1; }
    #nb-branding a { color: #CBD5E1; text-decoration: none; }
    #nb-branding a:hover { color: #94A3B8; }

    /* Offline/disconnected banner */
    #nb-offline {
      display: none; background: #FEF2F2; border-bottom: 1px solid #FECACA;
      padding: 7px 14px; font-size: 12px; color: #B91C1C; text-align: center;
    }
    #nb-offline.nb-show { display: block; }

    /* Mobile responsive */
    @media (max-width: 440px) {
      #nb-popup { width: calc(100vw - 24px); right: -12px; height: 70vh; }
      #nb-chat-root { bottom: 16px; right: 16px; }
    }
  `;
  document.head.appendChild(style);

  // ─── Build DOM ───────────────────────────────────────────────────────────────
  const root = document.createElement('div');
  root.id = 'nb-chat-root';
  root.innerHTML = `
    <div id="nb-popup" role="dialog" aria-label="Chat with Northbridge Digital">
      <div id="nb-offline">⚠️ Connection lost. Trying to reconnect...</div>
      <div id="nb-header">
        <div id="nb-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div id="nb-header-info">
          <div id="nb-header-name">${BOT_NAME} · Northbridge Digital</div>
          <div id="nb-header-status"><div class="nb-dot"></div><span id="nb-status-text">Online — AI Assistant</span></div>
        </div>
        <button id="nb-header-minimize" aria-label="Minimize chat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
      <div id="nb-messages" aria-live="polite"></div>
      <div id="nb-typing"><div class="nb-dot-pulse"><span></span><span></span><span></span></div></div>
      <div id="nb-quick-actions"></div>
      <button id="nb-human-btn">💬 Request a live agent</button>
      <div id="nb-input-area">
        <textarea id="nb-input" placeholder="Type a message…" rows="1" maxlength="1000" aria-label="Chat message"></textarea>
        <button id="nb-send" aria-label="Send message">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
      <div id="nb-branding">Powered by <a href="https://northbridgedigital.ca" target="_blank">Northbridge Digital</a></div>
    </div>
    <div id="nb-bubble" role="button" aria-label="Open chat" tabindex="0">
      <div id="nb-badge" aria-label="Unread messages"></div>
      <svg class="nb-chat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <svg class="nb-close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </div>
  `;
  document.body.appendChild(root);

  // ─── DOM Refs ────────────────────────────────────────────────────────────────
  const $bubble   = document.getElementById('nb-bubble');
  const $badge    = document.getElementById('nb-badge');
  const $popup    = document.getElementById('nb-popup');
  const $msgs     = document.getElementById('nb-messages');
  const $typing   = document.getElementById('nb-typing');
  const $input    = document.getElementById('nb-input');
  const $send     = document.getElementById('nb-send');
  const $humanBtn = document.getElementById('nb-human-btn');
  const $status   = document.getElementById('nb-status-text');
  const $offline  = document.getElementById('nb-offline');
  const $qas      = document.getElementById('nb-quick-actions');

  // ─── Quick Reply Actions ─────────────────────────────────────────────────────
  const QUICK_ACTIONS = [
    { label: '💰 View Pricing', msg: 'What are your pricing plans?' },
    { label: '⚡ How does it work?', msg: 'How does the chatbot setup work?' },
    { label: '📅 Book a demo', msg: 'I\'d like to book a free demo.' },
    { label: '🏠 Which industries?', msg: 'What industries do you work with?' }
  ];

  function renderQuickActions() {
    $qas.innerHTML = '';
    QUICK_ACTIONS.forEach(qa => {
      const btn = document.createElement('button');
      btn.className = 'nb-qa-btn';
      btn.textContent = qa.label;
      btn.onclick = () => {
        $qas.innerHTML = ''; // remove after first use
        sendMessage(qa.msg);
      };
      $qas.appendChild(btn);
    });
  }

  // ─── Message Rendering ───────────────────────────────────────────────────────
  function formatTime(ts) {
    const d = ts ? new Date(ts) : new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function appendMessage({ role, content, timestamp, type }) {
    const effectiveRole = type || role;
    const isUser   = effectiveRole === 'user';
    const isAgent  = effectiveRole === 'agent';
    const isSystem = effectiveRole === 'system';

    const wrap = document.createElement('div');
    wrap.className = `nb-msg nb-${isUser ? 'user' : isAgent ? 'agent' : isSystem ? 'system' : 'bot'}`;

    // Avatar (not for user or system)
    if (!isUser && !isSystem) {
      const av = document.createElement('div');
      av.className = `nb-msg-av${isAgent ? ' nb-agent-av' : ''}`;
      av.textContent = isAgent ? '👤' : '🤖';
      wrap.appendChild(av);
    }

    const inner = document.createElement('div');
    inner.style.display = 'flex';
    inner.style.flexDirection = isUser ? 'row-reverse' : 'column';
    inner.style.gap = '2px';

    const bubble = document.createElement('div');
    bubble.className = 'nb-msg-bubble';
    bubble.textContent = content;

    const time = document.createElement('div');
    time.className = 'nb-msg-time';
    time.textContent = formatTime(timestamp);

    inner.appendChild(bubble);
    if (!isSystem) inner.appendChild(time);
    wrap.appendChild(inner);

    $msgs.appendChild(wrap);
    scrollToBottom();

    // Show unread badge if chat is closed
    if (!isOpen && !isUser) {
      unreadCount++;
      $badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
      $badge.classList.add('nb-show');
    }
  }

  function scrollToBottom() {
    $msgs.scrollTop = $msgs.scrollHeight;
  }

  // ─── Socket.io Setup ─────────────────────────────────────────────────────────
  function loadSocketIO(callback) {
    if (window.io) return callback();
    const s = document.createElement('script');
    s.src = SERVER_URL + '/socket.io/socket.io.js';
    s.onload = callback;
    s.onerror = () => {
      $offline.textContent = '⚠️ Could not connect to chat server.';
      $offline.classList.add('nb-show');
    };
    document.head.appendChild(s);
  }

  function connect() {
    socket = window.io(SERVER_URL, { transports: ['websocket', 'polling'], reconnectionAttempts: 8 });

    socket.on('connect', () => {
      isConnected = true;
      $offline.classList.remove('nb-show');
      socket.emit('customer:init', {
        sessionId,
        page: window.location.pathname,
        name: 'Visitor'
      });
    });

    socket.on('customer:init:ok', (data) => {
      sessionId = data.sessionId;
      localStorage.setItem('nb_session_id', sessionId);
      if (!greetingShown) {
        greetingShown = true;
        setTimeout(() => {
          appendMessage({ role: 'bot', content: GREETING, type: 'bot' });
          renderQuickActions();
          // Show human button after greeting
          setTimeout(() => $humanBtn.classList.add('nb-show'), 3000);
        }, 400);
      }
    });

    socket.on('bot:typing', (isTyping) => {
      $typing.classList.toggle('nb-show', isTyping);
      $typing.parentNode.appendChild($typing); // keep at bottom
      scrollToBottom();
    });

    socket.on('bot:message', (data) => {
      $typing.classList.remove('nb-show');
      appendMessage({ role: 'bot', content: data.content, timestamp: data.timestamp, type: data.type || 'bot' });
      if (data.type === 'agent') {
        $status.textContent = '🟢 Live Agent Connected';
        $humanBtn.classList.remove('nb-show');
        $humanBtn.classList.add('nb-hide');
      }
      if (data.type === 'system' && data.content.includes('notified')) {
        $humanBtn.classList.remove('nb-show');
      }
    });

    socket.on('agent:message', (data) => {
      appendMessage({ role: 'agent', content: data.content, timestamp: data.timestamp, type: 'agent' });
    });

    socket.on('agent:typing', (isTyping) => {
      if (isTyping) {
        $status.textContent = '✍️ Agent is typing…';
      } else {
        $status.textContent = '🟢 Live Agent Connected';
      }
    });

    socket.on('disconnect', () => {
      isConnected = false;
      $offline.classList.add('nb-show');
      $offline.textContent = '⚠️ Connection lost. Trying to reconnect…';
    });

    socket.on('connect_error', () => {
      $offline.classList.add('nb-show');
      $offline.textContent = '⚠️ Having trouble connecting. Please try again.';
    });
  }

  // ─── Send Message ────────────────────────────────────────────────────────────
  function sendMessage(text) {
    const msg = (text || $input.value).trim();
    if (!msg || !isConnected) return;

    appendMessage({ role: 'user', content: msg, timestamp: new Date().toISOString() });
    socket.emit('customer:message', { message: msg });
    $input.value = '';
    $input.style.height = 'auto';
  }

  // ─── Event Listeners ─────────────────────────────────────────────────────────
  $bubble.addEventListener('click', () => toggleChat());
  $bubble.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') toggleChat(); });
  document.getElementById('nb-header-minimize').addEventListener('click', () => toggleChat(false));

  $send.addEventListener('click', () => sendMessage());

  $input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  $input.addEventListener('input', () => {
    $input.style.height = 'auto';
    $input.style.height = Math.min($input.scrollHeight, 80) + 'px';
  });

  $humanBtn.addEventListener('click', () => {
    if (!isConnected) return;
    socket.emit('customer:request:human');
    $humanBtn.classList.remove('nb-show');
    $humanBtn.classList.add('nb-hide');
    $status.textContent = '⏳ Waiting for live agent…';
  });

  // ─── Toggle Chat ─────────────────────────────────────────────────────────────
  function toggleChat(forceState) {
    isOpen = forceState !== undefined ? forceState : !isOpen;
    root.classList.toggle('nb-open', isOpen);

    if (isOpen) {
      unreadCount = 0;
      $badge.classList.remove('nb-show');
      $badge.textContent = '';
      setTimeout(() => { $input.focus(); scrollToBottom(); }, 240);
      // Load socket on first open
      if (!socket) loadSocketIO(connect);
    }
  }

  // Auto-open after 30s if never opened
  setTimeout(() => {
    if (!isOpen && !sessionId) {
      unreadCount = 1;
      $badge.textContent = '1';
      $badge.classList.add('nb-show');
    }
  }, 30000);

})();
