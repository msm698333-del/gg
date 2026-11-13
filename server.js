// ============================================================
//  سایهٔ خندان - سرور بازی آنلاین چندنفره
//  Express + Socket.IO | ساخت اتاق با کد ۶ رقمی | حالت‌های اجرا:
//  'solo' (فردین در برابر فرزاد AI) | 'duo' (فردین در برابر فرزاد - دو نفره)
//  | 'trio' (فردین + دیان در برابر فرزاد - سه نفره)
// ============================================================
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 20000,
  pingInterval: 8000
});

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/trust', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trust.html'));
});

// ============================== GAME CONSTANTS ==============================
const CODE_LENGTH = 6;
const CHAT_MESSAGE_MAX_LENGTH = 200;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_MOVE_PER_MSG = 14;            // حداکثر فاصله مجاز حرکت در هر پیام
const PLAYER_SPEED = 120;
const CATCH_DIST = 26;                  // فاصله‌ای که فرزاد بازیکن را می‌گیرد

const MODE_CONFIG = {
  solo: { name: 'انفرادی (فرزاد هوش مصنوعی)', maxPlayers: 1, slots: ['fardeen'] },
  duo:  { name: 'دو نفره (فردین در مقابل فرزاد)', maxPlayers: 2, slots: ['fardeen', 'farzad'] },
  trio: { name: 'سه نفره (فردین + دیان در مقابل فرزاد)', maxPlayers: 3, slots: ['fardeen', 'dian', 'farzad'] }
};

const ROLE_INFO = {
  fardeen: { name: 'فردین', color: '#2d7dd2', team: 'fugitive' },
  dian:    { name: 'دیان',  color: '#ff4fa3', team: 'fugitive' },
  farzad:  { name: 'فرزاد', color: '#050008', team: 'hunter' }
};

// ============================== ROOM MANAGEMENT ==============================
const rooms = new Map(); // roomCode -> room object

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بدون 0 و O
  let code;
  do {
    code = '';
    const randomBytes = crypto.randomBytes(CODE_LENGTH);
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += chars[Math.floor((randomBytes[i] / 256) * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

function createRoom(mode) {
  const cfg = MODE_CONFIG[mode] || MODE_CONFIG.duo;
  const room = {
    code: generateRoomCode(),
    mode,
    maxPlayers: cfg.maxPlayers,
    players: new Map(), // socketId -> playerData
    createdAt: Date.now(),
    updatedAt: Date.now(),
    state: 'waiting',   // waiting | starting | playing | ended
    seed: Math.floor(Math.random() * 0xffffffff),
    keys: [],           // موقعیت کلیدها (از سرور است تا همه یکسان ببینند)
    gotCount: 0,
    doorPos: null,
    exitReady: false,
    hostId: null
  };
  rooms.set(room.code, room);
  return room;
}

function getRoomByCode(code) {
  if (!code || typeof code !== 'string') return null;
  return rooms.get(code.toUpperCase()) || null;
}

function freeSlot(room) {
  const used = new Set(Array.from(room.players.values()).map(p => p.role));
  const cfg = MODE_CONFIG[room.mode] || MODE_CONFIG.duo;
  for (const slot of cfg.slots) {
    if (!used.has(slot)) return slot;
  }
  return null;
}

function removePlayerFromRoom(room, socketId) {
  if (!room) return null;
  const player = room.players.get(socketId);
  room.players.delete(socketId);
  room.updatedAt = Date.now();
  if (room.players.size === 0) {
    rooms.delete(room.code);
    return player;
  }
  // انتقال میزبانی به بازیکن بعدی (در حالت دو/سه نفره)
  if (room.hostId === socketId) {
    room.hostId = room.players.keys().next().value;
  }
  return player;
}

function sanitizeUsername(name) {
  if (typeof name !== 'string') return 'بازیکن';
  const cleaned = name.trim().replace(/[<>&"']/g, '').slice(0, 16);
  return cleaned.length > 0 ? cleaned : 'بازیکن';
}

function isValidHexColor(color) {
  return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color);
}

function isValidMode(mode) {
  return typeof mode === 'string' && Object.prototype.hasOwnProperty.call(MODE_CONFIG, mode);
}

function roomPlayerList(room) {
  return Array.from(room.players.values()).map(p => ({
    id: p.id,
    username: p.username,
    color: p.color,
    role: p.role,
    roleName: ROLE_INFO[p.role] ? ROLE_INFO[p.role].name : p.role,
    x: p.x,
    y: p.y,
    angle: p.angle,
    isHost: p.id === room.hostId
  }));
}

function roomSummary(room) {
  return {
    roomCode: room.code,
    mode: room.mode,
    modeName: (MODE_CONFIG[room.mode] || MODE_CONFIG.duo).name,
    seed: room.seed,
    state: room.state,
    players: roomPlayerList(room),
    hostId: room.hostId
  };
}

// ============================== SOCKET HANDLING ==============================
io.on('connection', (socket) => {
  console.log(`✅ بازیکن جدید متصل شد: ${socket.id}`);

  // ---------- ساخت اتاق ----------
  socket.on('create_room', (payload, callback) => {
    try {
      if (!payload || typeof payload !== 'object') {
        return callback && callback({ success: false, error: 'داده‌های نامعتبر است' });
      }
      const mode = isValidMode(payload.mode) ? payload.mode : 'duo';

      const room = createRoom(mode);
      const role = freeSlot(room);
      if (!role) {
        rooms.delete(room.code);
        return callback && callback({ success: false, error: 'خطا در تخصیص نقش' });
      }
      const playerData = {
        id: socket.id,
        username: sanitizeUsername(payload.username),
        color: ROLE_INFO[role].color,
        role,
        x: null,
        y: null,
        angle: 0,
        flashlight: true,
        connectedAt: Date.now(),
        lastActive: Date.now()
      };

      room.players.set(socket.id, playerData);
      room.hostId = socket.id;
      socket.join(room.code);
      socket.data.roomCode = room.code;

      socket.emit('room_created', { success: true, ...roomSummary(room) });

      console.log(`🏠 اتاق سایهٔ خندان ساخته شد: ${room.code} حالت ${mode} توسط ${playerData.username}`);
      callback && callback({ success: true, roomCode: room.code });
    } catch (error) {
      console.error('❌ خطا در create_room:', error);
      callback && callback({ success: false, error: 'خطا در ایجاد اتاق' });
    }
  });

  // ---------- ورود به اتاق با کد ----------
  socket.on('join_room', (payload, callback) => {
    try {
      if (!payload || typeof payload !== 'object') {
        return callback && callback({ success: false, error: 'داده‌های نامعتبر است' });
      }

      const roomCode = typeof payload.roomCode === 'string' ? payload.roomCode.trim().toUpperCase() : '';
      if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
        return callback && callback({ success: false, error: 'کد لابی نامعتبر است (باید ۶ کاراکتر باشد)' });
      }

      const room = getRoomByCode(roomCode);
      if (!room) {
        return callback && callback({ success: false, error: 'اتاقی با این کد یافت نشد' });
      }

      if (room.state !== 'waiting') {
        return callback && callback({ success: false, error: 'بازی قبلاً شروع شده است' });
      }

      if (room.players.size >= room.maxPlayers) {
        return callback && callback({ success: false, error: 'اتاق پر است' });
      }

      const role = freeSlot(room);
      const playerData = {
        id: socket.id,
        username: sanitizeUsername(payload.username),
        color: ROLE_INFO[role].color,
        role,
        x: null,
        y: null,
        angle: 0,
        flashlight: true,
        connectedAt: Date.now(),
        lastActive: Date.now()
      };

      room.players.set(socket.id, playerData);
      room.updatedAt = Date.now();
      socket.join(room.code);
      socket.data.roomCode = room.code;

      socket.emit('room_joined', { success: true, ...roomSummary(room) });

      // به همه اعلام کن که بازیکن جدید آمده
      socket.broadcast.to(room.code).emit('player_joined', {
        player: {
          id: playerData.id,
          username: playerData.username,
          color: playerData.color,
          role: playerData.role,
          roleName: ROLE_INFO[role].name,
          isHost: false
        },
        roomCode: room.code
      });

      io.to(room.code).emit('player_list', {
        players: roomPlayerList(room),
        hostId: room.hostId,
        state: room.state
      });

      console.log(`👤 ${playerData.username} (${ROLE_INFO[role].name}) به اتاق ${room.code} پیوست (${room.players.size}/${room.maxPlayers})`);
      callback && callback({ success: true, roomCode: room.code });
    } catch (error) {
      console.error('❌ خطا در join_room:', error);
      callback && callback({ success: false, error: 'خطا در ورود به اتاق' });
    }
  });

  // ---------- شروع بازی (فقط میزبان) ----------
  socket.on('start_game', (payload, callback) => {
    try {
      const room = getRoomByCode(socket.data.roomCode);
      if (!room) return callback && callback({ success: false, error: 'اتاق یافت نشد' });
      if (room.hostId !== socket.id) {
        return callback && callback({ success: false, error: 'فقط میزبان می‌تواند بازی را شروع کند' });
      }
      if (room.players.size < room.maxPlayers) {
        return callback && callback({ success: false, error: `منتظر ${room.maxPlayers - room.players.size} نفر دیگر باشید` });
      }
      room.state = 'playing';
      room.updatedAt = Date.now();
      // موقعیت اولیه: هر دو فراری‌دهنده کنار هم، فرزاد دورتر از آن‌ها
      io.to(room.code).emit('game_started', roomSummary(room));
      callback && callback({ success: true });
    } catch (error) {
      callback && callback({ success: false, error: 'خطا در شروع بازی' });
    }
  });

  // ---------- حرکت ----------
  socket.on('player_move', (payload) => {
    const room = getRoomByCode(socket.data.roomCode);
    if (!room || room.state !== 'playing') return;
    const player = room.players.get(socket.id);
    if (!player || !payload || typeof payload !== 'object') return;

    let x = Number(payload.x);
    let y = Number(payload.y);
    let angle = Number(payload.angle);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(angle)) return;

    if (player.x !== null) {
      const dx = x - player.x;
      const dy = y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > MAX_MOVE_PER_MSG) {
        const ratio = MAX_MOVE_PER_MSG / dist;
        x = player.x + dx * ratio;
        y = player.y + dy * ratio;
      }
    }

    x = Math.max(0, Math.min(1140, x));
    y = Math.max(0, Math.min(1140, y));
    angle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    player.x = x;
    player.y = y;
    player.angle = angle;
    player.lastActive = Date.now();
    room.updatedAt = Date.now();

    // بررسی گرفتن فراری‌دهنده‌ها توسط فرزاد (فقط وقتی فرزاد آنلاین است)
    const farzad = Array.from(room.players.values()).find(p => p.role === 'farzad');
    if (room.state === 'playing') {
      if (player.role === 'farzad') {
        for (const target of room.players.values()) {
          if (target.role === 'farzad') continue;
          if (target.x === null) continue;
          if (Math.hypot(target.x - player.x, target.y - player.y) < CATCH_DIST) {
            return endGame(room, 'farzad', `${target.username} گرفتار شد! فرزاد برنده است!`);
          }
        }
      } else if (farzad && farzad.x !== null && farzad.y !== null) {
        if (Math.hypot(player.x - farzad.x, player.y - farzad.y) < CATCH_DIST) {
          return endGame(room, 'farzad', `${player.username} گرفتار شد! فرزاد برنده است!`);
        }
      }
    }

    socket.broadcast.to(room.code).emit('player_moved', {
      id: socket.id,
      role: player.role,
      x: player.x,
      y: player.y,
      angle: player.angle
    });
  });

  // ---------- کلید جمع‌آوری شد (بعد از جواب درست) ----------
  socket.on('key_collected', (payload, callback) => {
    const room = getRoomByCode(socket.data.roomCode);
    if (!room || room.state !== 'playing') return;
    if (!payload || typeof payload.keyIndex !== 'number') return;
    const keyIndex = payload.keyIndex;
    const player = room.players.get(socket.id);
    if (!player) return;

    // شمارش روی سرور انجام می‌شود
    room.gotCount = Math.min(4, room.gotCount + 1);
    room.updatedAt = Date.now();
    io.to(room.code).emit('key_collected', {
      keyIndex,
      gotCount: room.gotCount,
      playerId: socket.id,
      exitReady: room.gotCount >= 4
    });
    if (callback) callback({ success: true, gotCount: room.gotCount });
  });

  // ---------- جواب غلط → فرزاد خشمگین می‌شود ----------
  socket.on('quiz_wrong', () => {
    const room = getRoomByCode(socket.data.roomCode);
    if (!room || room.state !== 'playing') return;
    room.updatedAt = Date.now();
    io.to(room.code).emit('farzad_enraged', { playerId: socket.id });
  });

  // ---------- فلش دیان (stun فرزاد) ----------
  socket.on('flash_burst', (payload, callback) => {
    const room = getRoomByCode(socket.data.roomCode);
    if (!room || room.state !== 'playing') return;
    const player = room.players.get(socket.id);
    if (!player) return;
    if (player.role !== 'dian') {
      return callback && callback({ success: false, error: 'فقط دیان می‌تواند فلش بزند' });
    }
    // کلاینت فاصله و cooldown را بررسی می‌کند؛ سرور هم cooldown می‌گذارد
    const now = Date.now();
    if (player.lastFlash && now - player.lastFlash < 15000) {
      return callback && callback({ success: false, error: 'فلش هنوز آماده نیست (۱۵ ثانیه)' });
    }
    player.lastFlash = now;
    io.to(room.code).emit('farzad_stunned', { playerId: socket.id });
    callback && callback({ success: true });
  });

  // ---------- فلش فردین هم‌اعلام می‌شود تا پروژکتور درست کار کند ----------
  socket.on('flashlight_toggle', (payload) => {
    const room = getRoomByCode(socket.data.roomCode);
    if (!room || room.state !== 'playing') return;
    const player = room.players.get(socket.id);
    if (!player) return;
    player.flashlight = !!payload.on;
    socket.broadcast.to(room.code).emit('flashlight_toggle', {
      id: socket.id,
      role: player.role,
      on: player.flashlight
    });
  });

  // ---------- رسیدن به در → پیروزی فراری‌دهنده‌ها ----------
  socket.on('reached_exit', () => {
    const room = getRoomByCode(socket.data.roomCode);
    if (!room || room.state !== 'playing') return;
    if (room.gotCount >= 4) {
      endGame(room, 'fugitives', 'فرار کردید! 🎉');
    }
  });

  // ---------- چت ----------
  socket.on('player_chat', (payload) => {
    const room = getRoomByCode(socket.data.roomCode);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player || !payload || typeof payload.message !== 'string') return;

    const message = payload.message.trim().slice(0, CHAT_MESSAGE_MAX_LENGTH);
    if (message.length === 0) return;

    io.to(room.code).emit('chat_message', {
      playerId: socket.id,
      username: player.username,
      role: player.role,
      roleName: ROLE_INFO[player.role].name,
      message,
      timestamp: Date.now()
    });
  });

  // ---------- خروج صریح ----------
  socket.on('leave_room', () => {
    handlePlayerLeave(socket, 'خروج داوطلبانه');
  });

  // ---------- قطع اتصال ----------
  socket.on('disconnect', () => {
    console.log(`❌ بازیکن قطع شد: ${socket.id}`);
    handlePlayerLeave(socket, 'قطع اتصال');
  });

  function handlePlayerLeave(sock, reason) {
    const roomCode = sock.data.roomCode;
    if (!roomCode) return;
    const room = getRoomByCode(roomCode);
    if (!room) return;

    const wasPlaying = room.state === 'playing';
    const player = removePlayerFromRoom(room, sock.id);
    sock.leave(roomCode);
    sock.data.roomCode = null;

    if (player) {
      console.log(`🚪 ${player.username} از اتاق ${roomCode} خارج شد (${reason})`);
    }

    if (wasPlaying && room.players.size > 0) {
      // اگر وسط بازی کسی رفت، بازی تمام می‌شود
      endGame(room, null, 'یکی از بازیکن‌ها وسط بازی قطع شد.');
    } else if (room.players.size > 0) {
      io.to(roomCode).emit('player_left', { playerId: sock.id, roomCode, reason });
      io.to(roomCode).emit('player_list', {
        players: roomPlayerList(room),
        hostId: room.hostId,
        state: room.state
      });
    }
  }
});

// ---------- پایان بازی ----------
function endGame(room, winner, message) {
  if (room.state !== 'playing' && room.state !== 'waiting' && room.state !== 'starting') return;
  room.state = 'ended';
  room.updatedAt = Date.now();
  io.to(room.code).emit('game_over', {
    winner, // 'farzad' | 'fugitives' | null
    message: message || (winner === 'fugitives' ? 'فرار کردید! 🎉' : winner === 'farzad' ? 'فرزاد گرفت! 😈' : 'بازی تمام شد.'),
    gotCount: room.gotCount
  });
}

// ============================== HTTP API ==============================
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    rooms: rooms.size,
    players: Array.from(rooms.values()).reduce((sum, r) => sum + r.players.size, 0)
  });
});

// ============================== HTTP SERVER ==============================
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log('========================================');
  console.log(`🚀 سایهٔ خندان سرور اجرا شد`);
  console.log(`🌐 آدرس محلی: http://localhost:${PORT}`);
  console.log(`🎮 حالت‌ها: انفرادی | دو نفره | سه نفره`);
  console.log('========================================');
});

// پاکسازی اتاق‌های قدیمی هر ۵ دقیقه
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.updatedAt > ROOM_TTL_MS) {
      rooms.delete(code);
      console.log(`🧹 اتاق قدیمی ${code} پاک شد`);
    }
  }
}, 5 * 60 * 1000);

process.on('SIGINT', () => {
  console.log('\n🛑 در حال بستن سرور...');
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
