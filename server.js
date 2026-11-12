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
  pingTimeout: 15000,
  pingInterval: 5000
});

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================== GAME CONSTANTS ==============================
const ARENA_WIDTH = 4000;
const ARENA_HEIGHT = 4000;
const MAX_PLAYERS_PER_ROOM = 12;
const CODE_LENGTH = 6;
const MAX_MOVE_PER_TICK = 10;      // حداکثر فاصله مجاز حرکت در هر پیام (جلوگیری از سرعت غیرواقعی)
const CHAT_MESSAGE_MAX_LENGTH = 200;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours lifetime for a room

const PLAYER_COLORS = [
  '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#d63031',
  '#6c5ce7', '#fdcb6e', '#00b894', '#e17055', '#74b9ff', '#a29bfe'
];

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

function createRoom() {
  const room = {
    code: generateRoomCode(),
    players: new Map(), // socketId -> playerData
    createdAt: Date.now(),
    updatedAt: Date.now(),
    state: 'waiting',   // waiting | playing
    hostId: null
  };
  rooms.set(room.code, room);
  return room;
}

function getRoomByCode(code) {
  if (!code || typeof code !== 'string') return null;
  return rooms.get(code.toUpperCase()) || null;
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
  // انتقال میزبانی به بازیکن بعدی
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

function roomPlayerList(room) {
  return Array.from(room.players.values()).map(p => ({
    id: p.id,
    username: p.username,
    color: p.color,
    x: p.x,
    y: p.y,
    angle: p.angle,
    isHost: p.id === room.hostId
  }));
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

      const room = createRoom();
      const playerData = {
        id: socket.id,
        username: sanitizeUsername(payload.username),
        color: isValidHexColor(payload.color) ? payload.color : PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)],
        x: ARENA_WIDTH / 2 + (Math.random() - 0.5) * 600,
        y: ARENA_HEIGHT / 2 + (Math.random() - 0.5) * 600,
        angle: 0,
        health: 100,
        score: 0,
        connectedAt: Date.now(),
        lastActive: Date.now()
      };

      room.players.set(socket.id, playerData);
      room.hostId = socket.id;
      rooms.set(room.code, room);

      socket.join(room.code);
      socket.data.roomCode = room.code;

      socket.emit('room_created', {
        success: true,
        roomCode: room.code,
        player: playerData,
        players: roomPlayerList(room),
        hostId: room.hostId
      });

      io.to(room.code).emit('player_list', {
        players: roomPlayerList(room),
        hostId: room.hostId
      });

      console.log(`🏠 اتاق جدید ساخته شد: ${room.code} توسط ${playerData.username}`);
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

      if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
        return callback && callback({ success: false, error: 'اتاق پر است (حداکثر ۱۲ نفر)' });
      }

      const playerData = {
        id: socket.id,
        username: sanitizeUsername(payload.username),
        color: isValidHexColor(payload.color) ? payload.color : PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)],
        x: ARENA_WIDTH / 2 + (Math.random() - 0.5) * 600,
        y: ARENA_HEIGHT / 2 + (Math.random() - 0.5) * 600,
        angle: 0,
        health: 100,
        score: 0,
        connectedAt: Date.now(),
        lastActive: Date.now()
      };

      room.players.set(socket.id, playerData);
      room.updatedAt = Date.now();
      socket.join(room.code);
      socket.data.roomCode = room.code;

      socket.emit('room_joined', {
        success: true,
        roomCode: room.code,
        player: playerData,
        players: roomPlayerList(room),
        hostId: room.hostId,
        gameState: room.state
      });

      // به همه بازیکنان اعلام کن که بازیکن جدید آمده
      socket.broadcast.to(room.code).emit('player_joined', {
        player: {
          id: playerData.id,
          username: playerData.username,
          color: playerData.color,
          x: playerData.x,
          y: playerData.y,
          angle: playerData.angle,
          isHost: false
        },
        roomCode: room.code
      });

      io.to(room.code).emit('player_list', {
        players: roomPlayerList(room),
        hostId: room.hostId
      });

      console.log(`👤 ${playerData.username} به اتاق ${room.code} پیوست (${room.players.size} نفر)`);
      callback && callback({ success: true, roomCode: room.code });
    } catch (error) {
      console.error('❌ خطا در join_room:', error);
      callback && callback({ success: false, error: 'خطا در ورود به اتاق' });
    }
  });

  // ---------- شروع بازی ----------
  socket.on('start_game', (payload, callback) => {
    try {
      const room = getRoomByCode(socket.data.roomCode);
      if (!room) return callback && callback({ success: false, error: 'اتاق یافت نشد' });
      if (room.hostId !== socket.id) {
        return callback && callback({ success: false, error: 'فقط میزبان می‌تواند بازی را شروع کند' });
      }
      room.state = 'playing';
      room.updatedAt = Date.now();
      io.to(room.code).emit('game_started', { roomCode: room.code });
      callback && callback({ success: true });
    } catch (error) {
      callback && callback({ success: false, error: 'خطا در شروع بازی' });
    }
  });

  // ---------- حرکت بازیکن ----------
  socket.on('player_move', (payload) => {
    const room = getRoomByCode(socket.data.roomCode);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    if (!payload || typeof payload !== 'object') return;

    let x = Number(payload.x);
    let y = Number(payload.y);
    let angle = Number(payload.angle);

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(angle)) return;

    // جلوگیری از دستکاری موقعیت: محدود کردن فاصله حرکت
    const dx = x - player.x;
    const dy = y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > MAX_MOVE_PER_TICK) {
      const ratio = MAX_MOVE_PER_TICK / dist;
      x = player.x + dx * ratio;
      y = player.y + dy * ratio;
    }

    // محدود کردن به مرزهای نقشه
    x = Math.max(20, Math.min(ARENA_WIDTH - 20, x));
    y = Math.max(20, Math.min(ARENA_HEIGHT - 20, y));
    angle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    player.x = x;
    player.y = y;
    player.angle = angle;
    player.lastActive = Date.now();
    room.updatedAt = Date.now();

    // ارسال موقعیت به بقیه بازیکنان اتاق
    socket.broadcast.to(room.code).emit('player_moved', {
      id: socket.id,
      x: player.x,
      y: player.y,
      angle: player.angle
    });
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
      color: player.color,
      message: message,
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

    const player = removePlayerFromRoom(room, sock.id);
    sock.leave(roomCode);
    sock.data.roomCode = null;

    if (player) {
      console.log(`🚪 ${player.username} از اتاق ${roomCode} خارج شد (${reason})`);
    }

    if (room.players.size > 0) {
      io.to(roomCode).emit('player_left', { playerId: sock.id, roomCode, reason });
      io.to(roomCode).emit('player_list', {
        players: roomPlayerList(room),
        hostId: room.hostId
      });
    }
  }
});

// ============================== HTTP API ==============================
app.get('/health', (req, res) => {
  res.json({ ok: true, rooms: rooms.size, players: Array.from(rooms.values()).reduce((sum, r) => sum + r.players.size, 0) });
});

// ============================== HTTP SERVER ==============================
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // گوش دادن روی همه رابط‌ها تا از بیرون هم در دسترس باشد

server.listen(PORT, HOST, () => {
  console.log('========================================');
  console.log(`🚀 سرور بازی در حال اجرا است`);
  console.log(`🌐 آدرس محلی: http://localhost:${PORT}`);
  console.log(`🌐 آدرس شبکه:  http://${getLocalIP()}:${PORT}`);
  console.log(`🎮 حداکثر بازیکنان هر اتاق: ${MAX_PLAYERS_PER_ROOM}`);
  console.log('========================================');
});

function getLocalIP() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'YOUR_LOCAL_IP';
}

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

// بستن آرام سرور
process.on('SIGINT', () => {
  console.log('\n🛑 در حال بستن سرور...');
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
