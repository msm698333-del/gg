// ============================================================
//  app.js — مدیریت صفحه‌ها و اتصال «سایهٔ خندان» به Socket.IO
// ============================================================
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const screens = {
    menu: $('menu'),
    lobby: $('lobby'),
    game: $('game-screen'),
    end: $('end-screen')
  };

  function show(name) {
    for (const key of Object.keys(screens)) {
      screens[key].classList.toggle('hide', key !== name);
    }
  }

  // ---------- وضعیت ----------
  const state = {
    username: '',
    mode: 'trio',
    roomCode: null,
    role: null,
    isHost: false,
    players: [],
    gotCount: 0,
    quizKey: null,
    inGame: false
  };

  const QS = [
    { q: 'کارن رو دوست داری؟', a: ['آره، خیلی', 'نه'] },
    { q: 'می‌گی "منم باهاش می‌مونم"؟', a: ['آره', 'نه'] },
    { q: 'وقتی ترسیدی، کمک می‌خوای؟', a: ['آره', 'نه'] },
    { q: 'اصلاً از دل تاریکی می‌ترسی؟', a: ['من نمی‌ترسم!', 'چرا...'] }
  ];

  const ROLE_NAME = { fardeen: 'فردین', dian: 'دیان', farzad: 'فرزاد' };

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function copyText(text) {
    const done = () => toast('📋 کد کپی شد: ' + text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(done);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { }
      ta.remove();
      done();
    }
  }

  function banner(msg) {
    const el = $('banner');
    el.textContent = msg;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  function updateKeysHUD(n) {
    state.gotCount = n;
    let s = '';
    for (let i = 0; i < 4; i++) s += i < n ? '🔑' : '⚫';
    $('hud-keys').textContent = s;
  }

  // ============================ منو ============================
  document.querySelectorAll('#mode-buttons .mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#mode-buttons .mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
    });
  });

  function getUsername() {
    const v = $('username-input').value.trim();
    return v.length ? v : 'بازیکن';
  }

  $('btn-create-room').addEventListener('click', async () => {
    state.username = getUsername();
    $('menu-error').textContent = '';
    const res = await Net.createRoom(state.mode, state.username);
    if (!res || !res.success) {
      $('menu-error').textContent = res && res.error ? res.error : 'خطا در ساخت اتاق';
    }
    // اطلاعات اتاق از رویداد room_created می‌آید
  });

  $('btn-join-room').addEventListener('click', async () => {
    state.username = getUsername();
    $('menu-error').textContent = '';
    const code = $('join-code-input').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      $('menu-error').textContent = 'کد را درست وارد کنید (۶ حرف لاتین/عدد)';
      return;
    }
    const res = await Net.joinRoom(code, state.username);
    if (!res || !res.success) {
      $('menu-error').textContent = res && res.error ? res.error : 'خطا در ورود به اتاق';
    }
    // اطلاعات اتاق از رویداد room_joined می‌آید
  });

  // ============================ لابی ============================
  $('btn-copy-code').addEventListener('click', () => copyText(state.roomCode || ''));
  $('btn-copy-code-hud').addEventListener('click', () => copyText(state.roomCode || ''));

  function renderLobby() {
    $('lobby-code').textContent = state.roomCode || '------';
    const list = $('lobby-players');
    list.innerHTML = '';
    for (const p of state.players) {
      const row = document.createElement('div');
      row.className = 'player-row';
      row.innerHTML =
        '<span class="player-role role-' + p.role + '">' + (p.roleName || ROLE_NAME[p.role] || p.role) + '</span>' +
        '<span class="player-name">' + escapeHtml(p.username) + '</span>' +
        (p.isHost ? '<span class="host-badge">میزبان</span>' : '');
      list.appendChild(row);
    }
    const cfg = { solo: 1, duo: 2, trio: 3 }[state.mode] || 2;
    $('lobby-mode').textContent = 'حالت: ' + (state.mode === 'trio' ? 'سه نفره' : state.mode === 'duo' ? 'دو نفره' : 'انفرادی');
    const need = cfg - state.players.length;
    $('lobby-status').textContent = need > 0 ? ('منتظر ' + need + ' نفر دیگر...') : 'همه آمدند! آماده‌اید؟ 😈';
    $('btn-start-game').disabled = !(state.isHost && need === 0);
    $('btn-start-game').style.display = state.isHost ? 'block' : 'none';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  $('btn-start-game').addEventListener('click', async () => {
    const res = await Net.startGame();
    if (!res || !res.success) toast(res && res.error ? res.error : 'خطا در شروع بازی');
  });

  $('btn-leave-lobby').addEventListener('click', () => {
    Net.leaveRoom();
    backToMenu();
  });

  function backToMenu() {
    state.roomCode = null;
    state.role = null;
    state.isHost = false;
    state.players = [];
    state.inGame = false;
    $('menu-error').textContent = '';
    show('menu');
  }

  // ============================ بازی ============================
  function enterGame() {
    show('game');
    state.inGame = true;
    $('hud-code').textContent = state.roomCode || '';
    const role = ROLE_NAME[state.role] || state.role;
    $('hud-role').textContent = role;
    $('hud-role').style.color = state.role === 'farzad' ? '#c07dff' : state.role === 'dian' ? '#ff9dc4' : '#6db8ff';
    // فلش مخصوص دیان
    $('btn-flash-burst').classList.toggle('hide', state.role !== 'dian');
    // فرزاد نیازی به دکمه چراغ‌قوه ندارد
    $('btn-flashlight').classList.toggle('hide', state.role === 'farzad');
    updateKeysHUD(0);
    $('chat-messages').innerHTML = '';
  }

  $('btn-exit-game').addEventListener('click', () => {
    Net.leaveRoom();
    backToMenu();
  });

  $('btn-flashlight').addEventListener('click', () => {
    const me = Horror._state.players[Horror._state.localId];
    if (me) {
      me.li = !me.li;
      $('btn-flashlight').classList.toggle('off', !me.li);
      Net.sendFlashToggle(me.li);
    }
  });

  $('btn-flash-burst').addEventListener('click', async () => {
    const res = await Net.sendFlashBurst();
    if (res && res.success) {
      $('btn-flash-burst').classList.add('cooldown');
      setTimeout(() => $('btn-flash-burst').classList.remove('cooldown'), 15000);
    } else if (res && res.error) {
      toast(res.error);
    }
  });

  // ---------- چت ----------
  function addChatLine(roleName, username, message) {
    const box = $('chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-line';
    div.innerHTML = '<b>' + escapeHtml(roleName) + ' · ' + escapeHtml(username) + ':</b> ' + escapeHtml(message);
    box.appendChild(div);
    while (box.children.length > 30) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }

  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    Net.sendChat(msg);
    input.value = '';
  });

  // ---------- سوال از تاریکی ----------
  function showQuiz(key) {
    state.quizKey = key;
    const qs = QS[Math.floor(Math.random() * QS.length)];
    $('quiz-question').textContent = qs.q;
    const box = $('quiz-answers');
    box.innerHTML = '';
    qs.a.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'quiz-btn';
      b.textContent = t;
      b.addEventListener('click', () => answerQuiz(i === 0));
      box.appendChild(b);
    });
    $('quiz-overlay').classList.remove('hide');
  }

  function answerQuiz(isYes) {
    const key = state.quizKey;
    $('quiz-overlay').classList.add('hide');
    state.quizKey = null;
    if (!key) return;
    if (isYes) {
      Net.sendKeyCollected(key._idx);
    } else {
      Net.sendQuizWrong();
      Horror._state.screen = 'play';
      toast('😐 صدا راضی نیست... فرزاد نزدیک شد!');
    }
  }

  // ============================ رویدادهای نت ============================
  Net.on('room', (data) => {
    if (!data || !data.success) {
      $('menu-error').textContent = 'خطا در دریافت اطلاعات اتاق';
      return;
    }
    state.roomCode = data.roomCode;
    state.mode = data.mode;
    state.players = data.players || [];
    const myEntry = state.players.find(p => p.id === (Net.socket && Net.socket.id));
    state.isHost = !!(myEntry && myEntry.isHost);
    state.role = myEntry ? myEntry.role : null;
    renderLobby();
    show('lobby');
  });

  Net.on('playerJoined', () => { });
  Net.on('playerLeft', () => {
    toast('یکی از بازیکن‌ها از اتاق خارج شد');
  });
  Net.on('playerList', (data) => {
    state.players = data.players || [];
    state.isHost = data.hostId === (Net.socket && Net.socket.id);
    const myEntry = state.players.find(p => p.id === (Net.socket && Net.socket.id));
    if (myEntry) state.role = myEntry.role;
    renderLobby();
  });

  Net.on('gameStarted', (data) => {
    // نقش را از لیست بازیکنان در پاسخ game_started پیدا کن
    const myEntry = (data.players || []).find(p => p.id === (Net.socket && Net.socket.id));
    if (myEntry) state.role = myEntry.role;
    enterGame();
    Horror.startMatch({
      seed: data.seed >>> 0,
      mode: data.mode,
      localId: Net.socket.id,
      role: state.role,
      players: data.players || []
    });
    banner('😈 سایهٔ خندان بیدار شد...');
  });

  Net.on('playerMoved', (data) => Horror.updateRemotePlayer(data));
  Net.on('flashlight', (data) => Horror.applyFlashToggle(data.id, data.on));

  Net.on('keyCollected', (data) => {
    Horror.applyKeyCollected(data.keyIndex, data.gotCount);
    $('quiz-overlay').classList.add('hide');
  });

  Net.on('farzadEnraged', () => Horror.applyFarzadEnraged());
  Net.on('farzadStunned', () => Horror.applyFarzadStunned());

  Net.on('gameOver', (data) => {
    Horror.applyGameOver();
    const win = data.winner === 'fugitives';
    $('end-icon').textContent = win ? '🎉' : data.winner === 'farzad' ? '😈' : '🔌';
    $('end-title').textContent = win ? 'فرار کردید!' : data.winner === 'farzad' ? 'سایه گرفت...' : 'بازی متوقف شد';
    $('end-message').textContent = data.message || '';
    show('end');
  });

  Net.on('chat', (data) => addChatLine(data.roleName || '', data.username || '', data.message || ''));
  Net.on('disconnect', () => { if (state.inGame) toast('🔌 اتصال قطع شد! در حال اتصال دوباره...'); });
  Net.on('connect', () => { if (state.inGame) toast('✅ اتصال برقرار شد'); });

  // ============================ پایان ============================
  $('btn-play-again').addEventListener('click', backToMenu);

  // ============================ راه‌اندازی ============================
  Net.connect();

  Horror.init({
    onBanner: banner,
    onToast: toast,
    onKeys: updateKeysHUD,
    onQuiz: showQuiz,
    onFlashToggle: () => { },
    onGameOver: (winner, message) => {
      Horror.applyGameOver();
      $('end-icon').textContent = winner === 'farzad' ? '😈' : '🎉';
      $('end-title').textContent = winner === 'farzad' ? 'سایه گرفت...' : 'فرار کردید!';
      $('end-message').textContent = message || '';
      show('end');
    }
  });
  show('menu');
})();
