// تست پروتکل بازی «سایهٔ خندان» - نیازمند اجرای سرور قبل از آن (npm start)
const { io } = require('socket.io-client');
const http = require('http');

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
  log((ok ? '✅ PASS' : '❌ FAIL') + ' - ' + name + (extra ? ' :: ' + extra : ''));
}

const waitEvent = (s, event, timeout = 1500) =>
  new Promise(resolve => { s.on(event, resolve); setTimeout(() => resolve(null), timeout); });
const emitAck = (s, event, payload, timeout = 2500) =>
  new Promise(resolve => { s.emit(event, payload, resolve); setTimeout(() => resolve(null), timeout); });

(async () => {
  try {
    // ============================================
    //  سناریوی سه نفره کامل: ساخت → پیوستن → بازی → برد فراری‌دهنده‌ها
    // ============================================
    const host = await connect();   // فردین (میزبان)
    const c2 = await connect();     // دیان
    const c3 = await connect();     // فرزاد
    check('سه کلاینت متصل شدند', host.connected && c2.connected && c3.connected);

    // 1) ساخت اتاق
    const created = await emitAck(host, 'create_room', { mode: 'trio', username: 'فردین' });
    check('ساخت اتاق موفقیت‌آمیز', created && created.success === true, JSON.stringify(created));
    const roomCode = created && created.roomCode;
    check('کد اتاق ۶ کاراکتری', !!(roomCode && /^[A-Z0-9]{6}$/.test(roomCode)), roomCode);

    // 2) پیوستن دو نفر دیگر
    const joined2 = await emitAck(c2, 'join_room', { roomCode, username: 'دیان' });
    check('دیان پیوست', joined2 && joined2.success === true);
    const joined3 = await emitAck(c3, 'join_room', { roomCode, username: 'فرزاد' });
    check('فرزاد پیوست', joined3 && joined3.success === true);

    // 3) نفر چهارم رد می‌شود (اتاق پر)
    const c4 = await connect();
    const joined4 = await emitAck(c4, 'join_room', { roomCode, username: 'اضافه' });
    check('نفر چهارم رد شد (اتاق پر)', joined4 && joined4.success === false);

    // 4) کد اشتباه رد می‌شود
    const bad = await emitAck(c4, 'join_room', { roomCode: 'ZZZZZZ', username: 'X' });
    check('کد اشتباه رد شد', bad && bad.success === false);
    c4.close();

    // 5) شروع بازی — رویداد game_started به همه می‌رسد
    const startedHost = waitEvent(host, 'game_started', 2000);
    const started3 = waitEvent(c3, 'game_started', 2000);
    const startAck = await emitAck(host, 'start_game', {});
    check('میزبان بازی را شروع کرد', startAck && startAck.success === true, JSON.stringify(startAck));
    const gameData = await startedHost;
    check('game_started دریافت شد', gameData && gameData.mode === 'trio', JSON.stringify(gameData && gameData.mode));
    check('نقش‌ها درست هستند (فردین/دیان/فرزاد)',
      gameData && gameData.players.length === 3 &&
      gameData.players.some(p => p.role === 'fardeen') &&
      gameData.players.some(p => p.role === 'dian') &&
      gameData.players.some(p => p.role === 'farzad'));
    check('seed نقشه برای همه یکسان است', Number.isFinite(gameData && gameData.seed));
    await started3;

    // 6) حرکت دیان به فردین می‌رسد
    const moved = await new Promise((resolve) => {
      host.on('player_moved', (p) => { if (p.role === 'dian') resolve(p); });
      c2.emit('player_move', { x: 200, y: 200, angle: 1.0 });
      setTimeout(() => resolve(null), 1500);
    });
    check('حرکت دیان به فردین رسید', moved !== null && moved.x === 200, JSON.stringify(moved));

    // 7) پرش بزرگ محدود می‌شود (ضدچیت)
    const movedBig = await new Promise((resolve) => {
      host.on('player_moved', (p) => { if (p.role === 'dian') resolve(p); });
      c2.emit('player_move', { x: 900, y: 900, angle: 0 });
      setTimeout(() => resolve(null), 1500);
    });
    check('پرش بزرگ محدود شد (کمتر از ۱۴ پیکسل)',
      movedBig !== null && Math.hypot(movedBig.x - 200, movedBig.y - 200) <= 14.01,
      JSON.stringify(movedBig));

    // 8) فردین نمی‌تواند فلش دیان بزند (فقط دیان)
    const flashWrong = await emitAck(host, 'flash_burst', {});
    check('فردین فلش دیان را رد می‌شود', flashWrong && flashWrong.success === false);

    // 9) دیان فلش می‌زند → همه farzad_stunned می‌گیرند
    const stunAck = await emitAck(c2, 'flash_burst', {});
    check('فلش دیان پذیرفته شد', stunAck && stunAck.success === true);

    // 10) پاسخ غلط در پرسش → farzad_enraged پخش می‌شود
    const enraged = waitEvent(host, 'farzad_enraged', 2000);
    c3.emit('quiz_wrong', {});
    const enr = await enraged;
    check('farzad_enraged پخش شد', enr && enr.playerId);

    // 11) چت بین بازیکنان کار می‌کند
    const chat = waitEvent(host, 'chat_message', 1500);
    c3.emit('player_chat', { message: 'میگیرمتون 😈' });
    const chatMsg = await chat;
    check('چت فرزاد به فردین رسید', chatMsg && chatMsg.message === 'میگیرمتون 😈');

    // 12) جمع‌شدن ۴ کلید → reached_exit → برد فراری‌دهنده‌ها
    const over = waitEvent(host, 'game_over', 3000);
    for (let i = 0; i < 4; i++) {
      await emitAck(host, 'key_collected', { keyIndex: i });
    }
    c2.emit('player_move', { x: 150, y: 150, angle: 0 }); // اولین حرکت دیان (ایمن)
    host.emit('reached_exit', {});
    const overData = await over;
    check('برد فراری‌دهنده‌ها (بازی ختم شد)', overData && overData.winner === 'fugitives', JSON.stringify(overData));

    // ============================================
    //  سناریوی دو نفره: فرزاد بازیکن فردین را می‌گیرد → فرزاد برنده
    // ============================================
    const p1 = await connect();
    const p2 = await connect();
    const created2 = await emitAck(p1, 'create_room', { mode: 'duo', username: 'فردین۲' });
    const code2 = created2 && created2.roomCode;
    await emitAck(p2, 'join_room', { roomCode: code2, username: 'فرزاد۲' });
    await emitAck(p1, 'start_game', {});
    // فردین اول حرکت می‌کند تا جایش مشخص شود
    p1.emit('player_move', { x: 300, y: 300, angle: 0 });
    await new Promise(r => setTimeout(r, 200));
    const over2 = waitEvent(p1, 'game_over', 3000);
    // فرزاد روی فردین می‌رود
    p2.emit('player_move', { x: 300, y: 302, angle: 0 });
    const over2Data = await over2;
    check('فرزاد فردین را گرفت (برد فرزاد)', over2Data && over2Data.winner === 'farzad', JSON.stringify(over2Data));

    // ============================================
    //  سناریوی قطع اتصال وسط بازی → game_over
    // ============================================
    const p3 = await connect();
    const p4 = await connect();
    const created3 = await emitAck(p3, 'create_room', { mode: 'duo', username: 'فردین۳' });
    const code3 = created3 && created3.roomCode;
    await emitAck(p4, 'join_room', { roomCode: code3, username: 'فرزاد۳' });
    await emitAck(p3, 'start_game', {});
    const over3 = waitEvent(p3, 'game_over', 3000);
    p4.close();
    const over3Data = await over3;
    check('قطع اتصال وسط بازی پایان بازی اعلام شد', over3Data && over3Data.winner === null, JSON.stringify(over3Data));

    host.close(); c2.close(); c3.close(); p1.close(); p2.close(); p3.close(); p4.close();
  } catch (err) {
    console.error('[TEST] Error:', err);
    results.push({ name: 'fatal', ok: false });
  }

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n[TEST] ${passed} passed, ${failed} failed out of ${results.length}`);
  process.exit(failed === 0 ? 0 : 1);
})();
