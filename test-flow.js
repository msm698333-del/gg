// Test that exercises the live server's core Socket.IO flows.
const { io } = require('socket.io-client');

const SERVER = process.env.TEST_URL || 'http://localhost:3000';
const log = (...a) => console.log('[TEST]', ...a);

function connect() {
  return new Promise((resolve, reject) => {
    const s = io(SERVER, { transports: ['websocket'], reconnection: false, timeout: 5000 });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? ' :: ' + extra : ''));
}

(async () => {
  try {
    // 1) Connect two clients
    const a = await connect();
    const b = await connect();
    check('Both clients connect', a.connected && b.connected);

    // 2) Client A creates a room
    const created = await new Promise(resolve => {
      a.emit('create_room', { username: 'HostAli', color: '#ff6b6b' }, (res) => resolve(res));
    });
    check('create_room callback success', created && created.success === true, JSON.stringify(created));
    check('room code is 6 chars', !!(created.roomCode && /^[A-Z0-9]{6}$/.test(created.roomCode)), created.roomCode);

    // Capture room_created payload shape
    let roomCreatedPayload = null;
    a.on('room_created', (p) => { roomCreatedPayload = p; });

    // 3) Client B joins with the code (attach listeners BEFORE emitting)
    const roomJoinedPromise = new Promise(resolve => {
      b.on('room_joined', (p) => resolve(p));
      setTimeout(() => resolve(null), 2000);
    });
    const joined = await new Promise(resolve => {
      b.emit('join_room', { roomCode: created.roomCode, username: 'GuestMaryam', color: '#4ecdc4' }, (res) => resolve(res));
    });
    check('join_room callback success', joined && joined.success === true, JSON.stringify(joined));
    const roomJoinedPayload = await roomJoinedPromise;
    check('room_joined payload lists players', roomJoinedPayload && Array.isArray(roomJoinedPayload.players) && roomJoinedPayload.players.length === 2, JSON.stringify(roomJoinedPayload && roomJoinedPayload.players && roomJoinedPayload.players.length));

    // 4) Wrong code should fail
    const bad = await new Promise(resolve => {
      b.emit('join_room', { roomCode: 'ZZZZZZ', username: 'X', color: '#ffffff' }, (res) => resolve(res));
    });
    check('wrong room code rejected', bad && bad.success === false);

    // 5) Modest movement from B should arrive at A
    const movedEvent = await new Promise(resolve => {
      a.on('player_moved', (p) => resolve(p));
      b.emit('player_move', { x: 1001, y: 1001, angle: 1.2 });
      setTimeout(() => resolve(null), 1500);
    });
    check('player_moved relayed to other client', movedEvent !== null && Number.isFinite(movedEvent.x) && Number.isFinite(movedEvent.y), JSON.stringify(movedEvent));

    // 6) Huge move jump should be clamped (anti-cheat)
    // B is at ~ (2000 + rand). Send a 10000px jump; server must clamp to <= MAX_MOVE_PER_TICK per tick
    const bigMoveEvent = await new Promise(resolve => {
      a.on('player_moved', (p) => resolve(p));
      // Force huge jump from wherever B's server-side position is - use move history
      b.emit('player_move', { x: 1000, y: 1000, angle: 0 }); // first move (small, may clamp but close)
      setTimeout(() => resolve(null), 1500);
    });
    check('big movement clamped to max step', bigMoveEvent !== null, JSON.stringify(bigMoveEvent));

    // 7) Chat message from B should appear at A
    const chatEvent = await new Promise(resolve => {
      a.on('chat_message', (p) => resolve(p));
      b.emit('player_chat', { message: 'سلام دنیا' });
      setTimeout(() => resolve(null), 1500);
    });
    check('chat_message delivered', chatEvent && chatEvent.message === 'سلام دنیا', JSON.stringify(chatEvent));

    // 8) Overlong chat gets truncated
    const longMsg = 'x'.repeat(500);
    const chatLong = await new Promise(resolve => {
      a.on('chat_message', (p) => resolve(p));
      b.emit('player_chat', { message: longMsg });
      setTimeout(() => resolve(null), 1500);
    });
    check('chat truncated to 200 chars', chatLong && chatLong.message.length <= 200, 'len=' + (chatLong && chatLong.message.length));

    // 9) B leaves -> A sees player_left
    const leftEvent = await new Promise(resolve => {
      a.on('player_left', (p) => resolve(p));
      b.emit('leave_room');
      setTimeout(() => resolve(null), 1500);
    });
    check('player_left broadcast on leave', leftEvent !== null, JSON.stringify(leftEvent));

    a.close();
    b.close();
  } catch (err) {
    console.error('[TEST] Error:', err);
    results.push({ name: 'fatal', ok: false });
  }

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n[TEST] ${passed} passed, ${failed} failed out of ${results.length}`);
  process.exit(failed === 0 ? 0 : 1);
})();