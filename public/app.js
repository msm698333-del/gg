// ============================== اتصال UI به سرور و موتور بازی ==============================
document.addEventListener('DOMContentLoaded', () => {
  // ساخت Socket Client
  const socketClient = new SocketClient();
  window.socketClient = socketClient;
  socketClient.connect();

  // --- اتصال به HUD ---
  const updateStatus = (connected, text) => {
    const dot = document.getElementById('menu-status-dot');
    const statusText = document.getElementById('menu-status-text');
    if (dot) dot.classList.toggle('offline', !connected);
    if (statusText) statusText.textContent = text || (connected ? 'متصل به سرور' : 'قطع');
  };

  socketClient.onConnectionChange = (connected) => {
    updateStatus(connected, connected ? 'متصل به سرور' : 'قطع اتصال — در حال تلاش مجدد...');
    const hudDot = document.getElementById('hud-status-dot');
    const hudText = document.getElementById('hud-status-text');
    if (hudDot) hudDot.classList.toggle('offline', !connected);
    if (hudText) hudText.textContent = connected ? 'متصل' : 'قطع';
    if (connected) {
      // اگر قبلاً در اتاق بودیم، reconnect هندل شده و دوباره به سرور پیوستیم
    } else {
      addChatSystem('اتصال با سرور قطع شد. در حال تلاش برای اتصال مجدد...');
    }
  };

  socketClient.onError = (err) => {
    console.error('خطا:', err);
    const errEl = document.getElementById('join-error');
    if (errEl) errEl.textContent = err.message || 'خطا در اتصال';
  };

  // ---------- تب‌های منو ----------
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.mode-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      document.getElementById('panel-' + mode).classList.add('active');
    });
  });

  // ---------- ساخت اتاق ----------
  document.getElementById('btn-create-room').addEventListener('click', () => {
    const username = (document.getElementById('create-username').value || 'بازیکن').trim().slice(0, 16);
    const color = document.getElementById('create-color').value;
    socketClient.createRoom(username, color).then(res => {
      if (res.success) {
        addChatSystem('✅ اتاق ساخته شد. کد اتاق: ' + res.roomCode);
        game.start(socketClient.playerId, res.players, res.roomCode);
      } else {
        alert('خطا: ' + res.error);
      }
    });
  });

  // ---------- ورود به اتاق ----------
  document.getElementById('btn-join-room').addEventListener('click', () => {
    const code = (document.getElementById('join-code').value || '').trim().toUpperCase();
    const username = (document.getElementById('join-username').value || 'بازیکن').trim().slice(0, 16);
    const color = document.getElementById('join-color').value;
    if (code.length !== 6) {
      const errEl = document.getElementById('join-error');
      if (errEl) errEl.textContent = 'کد باید ۶ کاراکتر باشد';
      return;
    }
    socketClient.joinRoom(code, username, color).then(res => {
      if (res.success) {
        addChatSystem('✅ وارد اتاق ' + code + ' شدید.');
        game.start(socketClient.playerId, res.players, res.roomCode);
      } else {
        const errEl = document.getElementById('join-error');
        if (errEl) errEl.textContent = res.error;
      }
    });
  });

  // ---------- تنظیمات ----------
  document.getElementById('btn-settings').addEventListener('click', () => {
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('settings-screen').classList.remove('hidden');
  });
  document.getElementById('btn-settings-back').addEventListener('click', () => {
    document.getElementById('settings-screen').classList.add('hidden');
    document.getElementById('menu-screen').classList.remove('hidden');
  });
  document.getElementById('btn-guide').addEventListener('click', () => {
    document.getElementById('guide-modal').classList.remove('hidden');
  });
  document.getElementById('btn-guide-close').addEventListener('click', () => {
    document.getElementById('guide-modal').classList.add('hidden');
  });
  document.getElementById('btn-exit').addEventListener('click', () => {
    window.close();
    alert('برای خروج می‌توانید تب را ببندید.');
  });

  // ---------- راهنما ----------
  // (بخش guide-modal قبلاً در HTML تعریف شده است)

  // ---------- کپی کد اتاق ----------
  document.getElementById('btn-copy-code').addEventListener('click', () => {
    const code = document.getElementById('hud-room-code').textContent;
    navigator.clipboard.writeText(code).then(() => {
      alert('کد اتاق کپی شد: ' + code);
    }).catch(() => {
      const input = document.createElement('input');
      input.value = code;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      alert('کد اتاق کپی شد: ' + code);
    });
  });

  // ---------- چت ----------
  document.getElementById('btn-send-chat').addEventListener('click', () => {
    const input = document.getElementById('chat-input');
    if (input.value.trim()) {
      socketClient.sendChat(input.value.trim());
      input.value = '';
    }
  });
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const input = document.getElementById('chat-input');
      if (input.value.trim()) {
        socketClient.sendChat(input.value.trim());
        input.value = '';
      }
      e.preventDefault();
    }
  });

  // ---------- خروج از اتاق ----------
  document.getElementById('btn-game-exit').addEventListener('click', () => {
    socketClient.leaveRoom();
    game.stop();
    addChatSystem('از اتاق خارج شدید.');
    document.getElementById('chat-messages').innerHTML = '';
  });

  // ---------- فعال‌سازی touch control ----------
  const joystick = document.getElementById('joystick-zone');
  joystick.style.display = 'block';

  // ---------- راه‌اندازی آکورد صوتی ----------
  const sound = document.getElementById('setting-sound');
  if (sound) {
    socketClient.playSound = () => {
      if (!sound.checked) return;
      try {
        const audio = new Audio('/sounds/chat.mp3');
        audio.volume = 0.3;
        audio.play();
      } catch (e) {
        // متوقف کردن پشتیبانی از صدا
      }
    };
  }

  // ---------- مدیریت رویدادهای Socket.IO از سرور ----------
  socketClient.onRoomCreated = (data) => {
    addChatSystem('🏠 اتاق ساخته شد. کد: ' + data.roomCode + '. لطفاً بازیکنان را منتظر بمانید.');
    if (window.game) {
      window.game.start(socketClient.playerId, data.players, data.roomCode);
      window.game.addChatSystem('🔵 اتاق شما آماده است. ۱۱ صندلی خالی است.');
      window.game.addChatSystem('💡 دیگران می‌توانند با کد بالا به شما بپیوندند.');
    }
  };

  socketClient.onRoomJoined = (data) => {
    if (window.game) {
      window.game.start(socketClient.playerId, data.players, data.roomCode);
      window.game.addChatSystem('🟢 با موفقیت به اتاق پیوستید. منتظر شروع بازی باشید.');
      window.game.addChatSystem('👤 ' + data.players.length + '/۱۲ بازیکن آنلاین.');
    }
  };

  socketClient.onPlayerJoined = (data) => {
    if (window.game && data.player) {
      window.game.addChatSystem('🔵 ' + data.player.username + ' به اتاق پیوست.');
      if (window.game.players && !window.game.players.has(data.player.id)) {
        window.game.setRemotePlayer(data.player);
      }
      if (window.socketClient && window.socketClient.onPlayerList) {
        window.socketClient.onPlayerList(data.players || []);
      }
    }
  };

  socketClient.onPlayerLeft = (data) => {
    if (window.game && data.playerId) {
      window.game.addChatSystem('🚪 یک بازیکن از اتاق خارج شد.');
      if (window.game.removePlayer) {
        window.game.removePlayer(data.playerId);
      }
      if (window.socketClient && window.socketClient.onPlayerList) {
        window.socketClient.onPlayerList(data.players || []);
      }
    }
  };

  socketClient.onPlayerMoved = (data) => {
    if (window.game && data.id) {
      window.game.setRemotePlayer(data);
    }
  };

  socketClient.onChatMessage = (data) => {
    if (window.game) {
      window.game.addChatMessage(data);
      // صدا
      if (window.socketClient && window.socketClient.playSound) {
        window.socketClient.playSound();
      }
    }
  };

  socketClient.onGameStarted = (data) => {
    addChatSystem('🎮 بازی شروع شد!');
  };

  socketClient.onPlayerList = (players) => {
    if (window.game) {
      window.game.renderPlayerList(players);
    }
  };

  // کمکی برای نمایش پیام‌ها
  function addChatSystem(text) {
    if (window.game && window.game.addSystemMessage) {
      window.game.addSystemMessage(text);
    } else {
      const box = document.getElementById('chat-messages');
      if (box) {
        const el = document.createElement('div');
        el.className = 'chat-message chat-system';
        el.textContent = '» ' + text;
        box.appendChild(el);
      }
    }
  }

  // ---------- مقایسه نسخه‌ها ----------
  // بررسی اینکه آیا نسخه جدیدی از فایل‌ها موجود است
  fetch('/health').then(r => r.json()).then(data => {
    if (!data.ok) {
      console.warn('سرور در حالت problematic است');
    }
  }).catch(() => {});

  // ---------- شروع بارگذاری اولیه ----------
  document.getElementById('chat-messages').innerHTML = '';
  document.getElementById('menu-screen').classList.remove('hidden');
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('settings-screen').classList.add('hidden');
});