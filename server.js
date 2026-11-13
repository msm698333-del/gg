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

  // ============================== مینی‌گیم‌ها ==============================
  socket.on('mg_create', (payload, callback) => {
    try {
      const username = sanitizeUsername(payload && payload.username);
      const room = {
        code: generateMiniCode(),
        players: new Map(),
        hostId: socket.id,
        game: null,
        state: 'waiting',
        ttt: { board: Array(9).fill(null), turn: 'X', winner: null },
        chess: { fen: 'startpos', turn: 'w', lastSan: '' },
        td: { order: [], idx: 0 },
        customTruth: [],
        customDare: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      room.players.set(socket.id, { id: socket.id, username, connectedAt: Date.now() });
      miniRooms.set(room.code, room);
      socket.join(room.code);
      socket.data.miniRoom = room.code;
      const summary = miniRoomSummary(room);
      socket.emit('mg_room_updated', summary);
      console.log(`🎮 اتاق مینی‌گیم ${room.code} ساخته شد توسط ${username}`);
      if (callback) callback({ success: true, code: room.code });
    } catch (error) {
      console.error('❌ خطا در mg_create:', error);
      if (callback) callback({ success: false, error: 'خطا در ساخت اتاق مینی‌گیم' });
    }
  });

  socket.on('mg_join', (payload, callback) => {
    try {
      const code = String((payload && payload.code) || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) return callback && callback({ success: false, error: 'کد اتاق باید ۶ حرف لاتین/عدد باشد' });
      const room = miniRooms.get(code);
      if (!room) return callback && callback({ success: false, error: 'اتاقی با این کد یافت نشد' });
      if (room.state !== 'waiting') return callback && callback({ success: false, error: 'بازی قبلاً شروع شده است' });
      if (room.players.size >= MG_MAX_PLAYERS) return callback && callback({ success: false, error: 'اتاق پر است (۴ نفر)' });
      const username = sanitizeUsername(payload && payload.username);
      room.players.set(socket.id, { id: socket.id, username, connectedAt: Date.now() });
      room.updatedAt = Date.now();
      socket.join(room.code);
      socket.data.miniRoom = room.code;
      mgBroadcast(room, 'mg_room_updated', miniRoomSummary(room));
      console.log(`🎮 ${username} به اتاق مینی‌گیم ${room.code} پیوست (${room.players.size}/${MG_MAX_PLAYERS})`);
      if (callback) callback({ success: true, code: room.code });
    } catch (error) {
      console.error('❌ خطا در mg_join:', error);
      if (callback) callback({ success: false, error: 'خطا در ورود به اتاق' });
    }
  });

  socket.on('mg_pick', (payload, callback) => {
    const room = miniRooms.get(socket.data.miniRoom);
    if (!room) return callback && callback({ success: false, error: 'اتاق یافت نشد' });
    if (room.hostId !== socket.id) return callback && callback({ success: false, error: 'فقط میزبان می‌تواند بازی را انتخاب کند' });
    if (room.state !== 'waiting') return callback && callback({ success: false, error: 'بازی شروع شده است' });
    const game = payload && payload.game;
    if (!Object.prototype.hasOwnProperty.call(MG_GAMES, game)) return callback && callback({ success: false, error: 'بازی نامعتبر است' });
    room.game = game;
    room.updatedAt = Date.now();
    mgBroadcast(room, 'mg_room_updated', miniRoomSummary(room));
    if (callback) callback({ success: true });
  });

  socket.on('mg_start', (payload, callback) => {
    try {
      const room = miniRooms.get(socket.data.miniRoom);
      if (!room) return callback && callback({ success: false, error: 'اتاق یافت نشد' });
      if (room.hostId !== socket.id) return callback && callback({ success: false, error: 'فقط میزبان می‌تواند شروع کند' });
      if (room.state !== 'waiting') return callback && callback({ success: false, error: 'بازی قبلاً شروع شده است' });
      if (room.players.size < 2) return callback && callback({ success: false, error: 'حداقل ۲ بازیکن لازم است' });
      room.game = room.game || 'ttt';
      if (room.game === 'ttt' || room.game === 'chess') {
        if (room.players.size !== 2) return callback && callback({ success: false, error: 'برای این بازی دقیقاً ۲ بازیکن لازم است' });
      }
      room.state = 'playing';
      room.updatedAt = Date.now();
      const order = Array.from(room.players.keys());
      if (room.game === 'ttt') {
        room.ttt = { board: Array(9).fill(null), turn: 'X', winner: null };
      } else if (room.game === 'chess') {
        room.chess = { fen: 'startpos', turn: 'w', lastSan: '' };
      } else if (room.game === 'tod') {
        room.td = { order, idx: 0 };
      }
      const roles = {};
      if (room.game === 'ttt') {
        roles[order[0]] = 'X';
        if (order[1]) roles[order[1]] = 'O';
      } else if (room.game === 'chess') {
        roles[order[0]] = 'w';
        if (order[1]) roles[order[1]] = 'b';
      }
      mgBroadcast(room, 'mg_game_started', {
        success: true,
        code: room.code,
        game: room.game,
        gameName: MG_GAMES[room.game],
        roles,
        players: Array.from(room.players.values()).map(p => ({ id: p.id, username: p.username, isHost: p.id === room.hostId })),
        turn: room.game === 'tod' ? room.td.order[0] : null,
        turnName: room.game === 'tod' ? (room.players.get(room.td.order[0]) || {}).username : null
      });
      if (callback) callback({ success: true });
    } catch (error) {
      console.error('❌ خطا در mg_start:', error);
      if (callback) callback({ success: false, error: 'خطا در شروع بازی' });
    }
  });

  socket.on('mg_leave', () => { handleMiniLeave(socket); });

  // ---------- دوز آنلاین ----------
  socket.on('mg_ttt_move', (payload) => {
    const room = miniRooms.get(socket.data.miniRoom);
    if (!room || room.state !== 'playing' || room.game !== 'ttt') return;
    const order = Array.from(room.players.keys());
    const meRole = order[0] === socket.id ? 'X' : (order[1] === socket.id ? 'O' : null);
    const ttt = room.ttt;
    if (!meRole || ttt.winner || ttt.turn !== meRole) return;
    const i = payload && typeof payload.cell === 'number' ? payload.cell : -1;
    if (i < 0 || i > 8 || ttt.board[i]) return;
    ttt.board[i] = meRole;
    ttt.turn = meRole === 'X' ? 'O' : 'X';
    ttt.winner = tttWinner(ttt.board);
    room.updatedAt = Date.now();
    mgBroadcast(room, 'mg_ttt', { board: ttt.board, turn: ttt.turn, winner: ttt.winner });
  });

  // ---------- شطرنج آنلاین (رله + نوبت‌سنجی) ----------
  socket.on('mg_chess_move', (payload) => {
    const room = miniRooms.get(socket.data.miniRoom);
    if (!room || room.state !== 'playing' || room.game !== 'chess') return;
    const order = Array.from(room.players.keys());
    const meColor = order[0] === socket.id ? 'w' : (order[1] === socket.id ? 'b' : null);
    const chess = room.chess;
    if (!meColor || chess.turn !== meColor) return;
    const fen = String((payload && payload.fen) || '').slice(0, 120);
    if (!fen || fen.length > 120 || /[<>]/.test(fen)) return;
    chess.fen = fen;
    chess.turn = chess.turn === 'w' ? 'b' : 'w';
    chess.lastSan = String((payload && payload.san) || '').slice(0, 40);
    room.updatedAt = Date.now();
    mgBroadcast(room, 'mg_chess', { fen: chess.fen, turn: chess.turn, san: chess.lastSan });
  });

  // ---------- جرئت یا حقیقت آنلاین ----------
  socket.on('mg_td_add', (payload, callback) => {
    const room = miniRooms.get(socket.data.miniRoom);
    if (!room) return callback && callback({ success: false, error: 'اتاق یافت نشد' });
    const kind = payload && payload.kind === 'dare' ? 'dare' : 'truth';
    const text = String((payload && payload.text) || '').replace(/[<>]/g, '').trim().slice(0, 200);
    if (text.length < 2) return callback && callback({ success: false, error: 'سؤال دلخواه باید حداقل ۲ حرف باشد' });
    if (kind === 'truth') {
      if (room.customTruth.length >= 60) room.customTruth.shift();
      room.customTruth.push(text);
    } else {
      if (room.customDare.length >= 60) room.customDare.shift();
      room.customDare.push(text);
    }
    room.updatedAt = Date.now();
    mgBroadcast(room, 'mg_td_questions', { truthCount: room.customTruth.length, dareCount: room.customDare.length });
    if (callback) callback({ success: true });
  });

  socket.on('mg_td_draw', (payload) => {
    const room = miniRooms.get(socket.data.miniRoom);
    if (!room || room.state !== 'playing' || room.game !== 'tod') return;
    const me = room.players.get(socket.id);
    if (!me) return;
    const holderId = room.td.order[room.td.idx];
    if (holderId !== socket.id) return; // فقط دست همین بازیکن
    const kind = payload && payload.kind === 'dare' ? 'dare' : 'truth';
    const base = kind === 'truth' ? MG_TRUTHS : MG_DARES;
    const extra = kind === 'truth' ? room.customTruth : room.customDare;
    const pool = base.concat(extra);
    const text = pool[Math.floor(Math.random() * pool.length)];
    room.updatedAt = Date.now();
    mgBroadcast(room, 'mg_td_card', { kind, text, by: socket.id, byName: me.username });
  });

  socket.on('mg_td_pass', (payload, callback) => {
    const room = miniRooms.get(socket.data.miniRoom);
    if (!room || room.state !== 'playing' || room.game !== 'tod') return callback && callback({ success: false });
    const holderId = room.td.order[room.td.idx];
    if (holderId !== socket.id && room.hostId !== socket.id) return callback && callback({ success: false, error: 'فقط میزبان یا دارندهٔ نوبت می‌تواند نوبت را رد کند' });
    room.td.idx = (room.td.idx + 1) % room.td.order.length;
    const nextId = room.td.order[room.td.idx];
    const nextPlayer = room.players.get(nextId);
    mgBroadcast(room, 'mg_td_turn', { by: nextId, byName: nextPlayer ? nextPlayer.username : '', idx: room.td.idx });
    if (callback) callback({ success: true });
  });

  socket.on('mg_play_again', (payload, callback) => {
    const room = miniRooms.get(socket.data.miniRoom);
    if (!room || room.hostId !== socket.id) return callback && callback({ success: false, error: 'فقط میزبان می‌تواند دوباره بازی را شروع کند' });
    room.state = 'waiting';
    room.ttt = { board: Array(9).fill(null), turn: 'X', winner: null };
    room.chess = { fen: 'startpos', turn: 'w', lastSan: '' };
    room.td = { order: room.td.order, idx: 0 };
    mgBroadcast(room, 'mg_back_to_room', miniRoomSummary(room));
    if (callback) callback({ success: true });
  });

  // ---------- خروج صریح ----------
  socket.on('leave_room', () => {
    handlePlayerLeave(socket, 'خروج داوطلبانه');
  });

  // ---------- قطع اتصال ----------
  socket.on('disconnect', () => {
    console.log(`❌ بازیکن قطع شد: ${socket.id}`);
    handlePlayerLeave(socket, 'قطع اتصال');
    handleMiniLeave(socket);
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
function handleMiniLeave(socket) {
  const mcode = socket.data.miniRoom;
  if (!mcode) return;
  const room = miniRooms.get(mcode);
  socket.data.miniRoom = null;
  if (!room) return;
  const wasPlaying = room.state === 'playing';
  room.players.delete(socket.id);
  socket.leave(mcode);
  room.updatedAt = Date.now();
  if (room.players.size === 0) {
    miniRooms.delete(mcode);
    return;
  }
  if (wasPlaying) {
    console.log(`🎮 مینی‌گیم ${mcode} متوقف شد چون یکی از بازیکن‌ها خارج شد`);
    mgBroadcast(room, 'mg_game_over', {
      reason: 'peer_left',
      message: 'یکی از بازیکن‌ها از اتاق خارج شد — بازی متوقف شد'
    });
    miniRooms.delete(mcode);
    return;
  }
  if (room.hostId === socket.id) {
    room.hostId = room.players.keys().next().value;
  }
  mgBroadcast(room, 'mg_room_updated', miniRoomSummary(room));
}

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

// ============================== مینی‌گیم‌ها (دوز، شطرنج، جرئت یا حقیقت) ==============================
const MG_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MG_MAX_PLAYERS = 4;
const MG_GAMES = { ttt: 'دوز', chess: 'شطرنج', tod: 'جرئت یا حقیقت' };

const MG_TRUTHS = [
  'آخرین دروغی که گفتی چه بود؟','بزرگ‌ترین ترسی که داری چیه؟','خجالت‌آورترین کاری که تا حالا کردی چیه؟',
  'آرزوی بزرگی که هنوز نگفتی چیه؟','آخرین لحظه‌ای که گریه کردی چه بود؟','عجیب‌ترین عادت روزانه‌ت چیه؟',
  'اگر یک قدرت خاص داشتی چه می‌خواستی؟','بدترین کادویی که تا حالا گرفتی چیه؟','آخرین بار کی حسودی کردی؟'
];
const MG_DARES = [
  '۱۰ بار با صدای یک شخصیت کارتونی حرف بزن.','یک تبلیغ ۲۰ ثانیه‌ای برای این بازی بساز.','یک رقص خنده‌دار ۳۰ ثانیه‌ای انجام بده.',
  'همه را با سلام نظامی خبر کنید.','تا چند جمله فقط با لهجهٔ دوستت حرف بزن.','یک نمایش ۲۰ ثانیه‌ای از یک مجری تلویزیون بازی کن.'
];

const miniRooms = new Map();

function generateMiniCode() {
  let code;
  do {
    code = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) code += MG_CODE_CHARS[bytes[i] % MG_CODE_CHARS.length];
  } while (miniRooms.has(code) || rooms.has(code));
  return code;
}

function miniRoomSummary(room) {
  return {
    success: true,
    code: room.code,
    game: room.game,
    gameName: room.game ? MG_GAMES[room.game] : null,
    hostId: room.hostId,
    state: room.state,
    players: Array.from(room.players.values()).map(p => ({
      id: p.id, username: p.username, isHost: p.id === room.hostId
    })),
    truthCount: room.customTruth.length,
    dareCount: room.customDare.length,
    turn: room.td.order[room.td.idx] || null
  };
}

function mgBroadcast(room, event, payload) {
  io.to(room.code).emit(event, payload);
}

const MG_TTT_WINS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function tttWinner(board) {
  for (const [a,b,c] of MG_TTT_WINS) if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a];
  return board.every(Boolean) ? 'draw' : null;
}

// ============================== HTTP API ==============================
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    rooms: rooms.size + miniRooms.size,
    players: Array.from(rooms.values()).reduce((sum, r) => sum + r.players.size, 0) +
             Array.from(miniRooms.values()).reduce((sum, r) => sum + r.players.size, 0)
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
  for (const [code, room] of miniRooms.entries()) {
    if (now - room.updatedAt > ROOM_TTL_MS) {
      miniRooms.delete(code);
      console.log(`🧹 اتاق مینی‌گیم قدیمی ${code} پاک شد`);
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
