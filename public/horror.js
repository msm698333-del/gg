// ============================================================
//  سایهٔ خندان — موتور بازی (کانواس ۲ بعدی)
//  نقش‌ها: فردین (fugitive) | دیان (fugitive + flash) | فرزاد (hunter)
//  حالت‌ها: solo (فرزاد AI) | duo | trio
// ============================================================
window.Horror = (() => {
  const T = 76, N = 7, GN = 2 * N + 1, DIR = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const TAU = Math.PI * 2;

  // ---------- ابزار تصادفی با seed ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- وضعیت ----------
  const S = {
    screen: 'menu',      // menu | play | quiz | over
    grid: null,
    keys: [],            // {tx, ty, x, y, got, ph}
    door: { x: 0, y: 0 },
    seed: 1,
    mode: 'trio',
    players: {},         // id -> {id, role, username, x, y, ang, la, li, mv, fl, sp}
    localId: null,
    localRole: null,
    farzadAI: false,
    dianAI: false,
    gotCount: 0,
    cam: { x: 0, y: 0 },
    t: 0,
    shake: 0,
    pt: [],              // ذرات
    flashT: 0,
    hb: 0,
    bph: 0,
    abilityT: 0,      // زمان باقی‌مانده‌ی «برق‌زدگی» فرزاد (ثانیه)
    abilityCd: 0,     // خنک‌شدن ابیلتی فرزاد (ثانیه)
    last: 0,
    mt: 0,
    joy: { on: 0, id: null, ox: 0, oy: 0, kx: 0, ky: 0, dx: 0, dy: 0 },
    kb: {},
    shx: 0,
    shy: 0,
    prox: 0
  };

  // ---------- تنظیمات محیطی ----------
  let canvas, ctx, L, LX, W, H, D, ui;
  const LS = 0.5;

  function resize() {
    D = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = W * D; canvas.height = H * D;
    L.width = Math.ceil(W * LS); L.height = Math.ceil(H * LS);
  }

  // ---------- نقشه ----------
  function bfs(gridData, sx, sy) {
    const d = Array.from({ length: GN }, () => Array(GN).fill(-1));
    d[sy][sx] = 0;
    const q = [[sx, sy]];
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i];
      for (const [a, b] of DIR) {
        const nx = x + a, ny = y + b;
        if (nx >= 0 && ny >= 0 && nx < GN && ny < GN && !gridData[ny][nx] && d[ny][nx] < 0) {
          d[ny][nx] = d[y][x] + 1; q.push([nx, ny]);
        }
      }
    }
    return d;
  }

  function solid(x, y) {
    const tx = (x / T) | 0, ty = (y / T) | 0;
    return x < 0 || y < 0 || tx >= GN || ty >= GN || S.grid[ty][tx];
  }
  function mv(o, dx, dy, r) {
    const t = (x, y) => solid(x - r, y - r) || solid(x + r, y - r) || solid(x - r, y + r) || solid(x + r, y + r);
    if (!t(o.x + dx, o.y)) o.x += dx;
    if (!t(o.x, o.y + dy)) o.y += dy;
  }

  // ساخت نقشه با seed (همه‌ی کلاینت‌ها یکسان می‌سازند)
  function gen(seed) {
    const rnd = mulberry32(seed >>> 0);
    S.grid = Array.from({ length: GN }, () => Array(GN).fill(1));
    const st = [[0, 0]], seen = { '0,0': 1 };
    S.grid[1][1] = 0;
    while (st.length) {
      const [cx, cy] = st[st.length - 1];
      const nb = DIR.map(([a, b]) => [cx + a, cy + b, a, b]).filter(([x, y]) => x >= 0 && y >= 0 && x < N && y < N && !seen[x + ',' + y]);
      if (!nb.length) { st.pop(); continue; }
      const [nx, ny, a, b] = nb[(rnd() * nb.length) | 0];
      seen[nx + ',' + ny] = 1;
      S.grid[2 * ny + 1][2 * nx + 1] = 0;
      S.grid[2 * cy + 1 + b][2 * cx + 1 + a] = 0;
      st.push([nx, ny]);
    }
    for (let i = 0; i < 16; i++) {
      const x = 1 + ((rnd() * (GN - 2)) | 0), y = 1 + ((rnd() * (GN - 2)) | 0);
      if (S.grid[y][x] && ((x & 1) != (y & 1))) S.grid[y][x] = 0;
    }
    const sd = bfs(S.grid, 1, 1);
    const cells = [];
    for (let y = 1; y < GN; y += 2) for (let x = 1; x < GN; x += 2) cells.push([x, y]);
    S.keys = [];
    let tr = 0;
    while (S.keys.length < 4 && tr++ < 3000) {
      const [x, y] = cells[(rnd() * cells.length) | 0];
      const minD = tr > 400 ? 3 : 7;
      if (sd[y][x] < minD) continue;
      if (S.keys.some(k => Math.hypot(k.tx - x, k.ty - y) < (tr > 400 ? 2 : 5))) continue;
      S.keys.push({ tx: x, ty: y, x: (x + .5) * T, y: (y + .5) * T, got: false, ph: rnd() * 6 });
    }
    S.door = { x: (GN - 1.5) * T, y: (GN - 1.5) * T };
    S.gotCount = 0;
    return sd;
  }

  function farStart(sd, rnd) {
    const cells = [];
    for (let y = 1; y < GN; y += 2) for (let x = 1; x < GN; x += 2) cells.push([x, y, sd[y][x]]);
    const far = cells.filter(c => c[2] >= 9);
    const pool = far.length ? far : cells;
    const [x, y] = pool[(rnd() * pool.length) | 0];
    return { x: (x + .5) * T, y: (y + .5) * T };
  }

  // ---------- شخصیت‌ها ----------
  const LOOKS = {
    fardeen: { col: '#2d7dd2', skin: '#d9a066', hair: '#2a1a10', fl: false },
    dian:    { col: '#ff4fa3', skin: '#ffd5b5', hair: '#d63a2f', acc: '#5ee7ff', pony: true },
    farzad:  { shadow: true }
  };

  function drawChara(c, role, x, y, s, t, mvFlag, fl) {
    const o = LOOKS[role];
    c.save();
    c.translate(x, y); c.scale(s * fl, s);
    const b = mvFlag ? Math.sin(t * 14) * 2 : Math.sin(t * 3);
    const l = mvFlag ? Math.sin(t * 14) * 4 : 0;
    // سایه زیر پا
    c.fillStyle = 'rgba(0,0,0,.45)';
    c.beginPath(); c.ellipse(0, 17, 13, 4.5, 0, 0, TAU); c.fill();
    // پاها
    c.fillStyle = '#1b1b2f';
    c.fillRect(-7 + l, 8, 5, 9); c.fillRect(2 - l, 8, 5, 9);
    // لباس
    c.fillStyle = o.col;
    c.beginPath(); roundedRect(c, -10, -8 + b, 20, 19, 6); c.fill();
    // صورت
    c.fillStyle = o.skin;
    c.beginPath(); c.arc(0, -16 + b, 11, 0, TAU); c.fill();
    // مو
    c.fillStyle = o.hair;
    c.beginPath(); c.arc(0, -17 + b, 11.5, Math.PI, 0); c.fill();
    if (o.pony) {
      c.beginPath(); c.ellipse(-12, -12 + b + Math.sin(t * 6) * 2, 4, 9, .3, 0, TAU); c.fill();
      c.fillStyle = o.acc; c.fillRect(-11.5, -21 + b, 23, 3);
    }
    // چشم‌ها
    c.fillStyle = '#111';
    [-3, 5].forEach(ex => { c.beginPath(); c.arc(ex, -15 + b, 1.8, 0, TAU); c.fill(); });
    c.fillStyle = '#fff';
    [-3, 5].forEach(ex => { c.beginPath(); c.arc(ex + .6, -15.6 + b, .6, 0, TAU); c.fill(); });
    if (o.fl) { c.fillStyle = '#ffd36e'; c.fillRect(9, -1 + b, 9, 5); }
    c.restore();
  }

  function roundedRect(c, x, y, w, h, r) {
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawShadow(c, x, y, s, t, eyesOnly, a) {
    c.save();
    c.translate(x, y); c.scale(s, s); c.globalAlpha = a;
    if (!eyesOnly) {
      c.shadowColor = '#8a3cff'; c.shadowBlur = 16;
      c.fillStyle = '#050008';
      const w = Math.sin(t * 5) * 2;
      c.beginPath(); c.moveTo(-13, 18); c.lineTo(-10 + w, -6);
      c.quadraticCurveTo(0, -14, 10 + w, -6); c.lineTo(13, 18); c.closePath(); c.fill();
      c.beginPath(); c.arc(w * .5, -18, 12, 0, TAU); c.fill();
      for (let k = 0; k < 5; k++) {
        c.beginPath(); c.moveTo(-10 + k * 5, -27); c.lineTo(-7.5 + k * 5, -39); c.lineTo(-5 + k * 5, -27); c.fill();
      }
      c.fillRect(-18 + w, -4, 6, 22); c.fillRect(12 + w, -4, 6, 22);
      c.shadowBlur = 0;
    }
    // چشم‌ها و لبخند روشن
    c.shadowColor = '#fff'; c.shadowBlur = 10; c.fillStyle = '#fff';
    [-5, 5].forEach(ex => { c.beginPath(); c.ellipse(ex, -20, 3.4, 4.6, ex > 0 ? -.3 : .3, 0, TAU); c.fill(); });
    c.strokeStyle = '#fff'; c.lineWidth = 2.2;
    c.beginPath(); c.arc(0, -19, 10, .12, Math.PI - .12); c.stroke();
    c.lineWidth = 1.2;
    for (let k = -3; k <= 3; k++) {
      const an = Math.PI / 2 + k * .33;
      c.beginPath(); c.moveTo(Math.cos(an) * 10, -19 + Math.sin(an) * 10);
      c.lineTo(Math.cos(an) * 7.5, -19 + Math.sin(an) * 7.5); c.stroke();
    }
    c.restore();
  }

  const WT = ['نفس نکش', 'پشتته!', 'کارن؟', 'هنوز اینجام :)', 'فرزاد'];

  // ---------- سوراخ نور ----------
  function lightHole(x, y, a, sp, n, Rg, al) {
    const cx = (x - S.cam.x + W / 2 + S.shx) * LS;
    const cy = (y - S.cam.y + H / 2 + S.shy) * LS;
    LX.beginPath(); LX.moveTo(cx, cy);
    for (let i = 0; i <= n; i++) {
      const an = a + sp * (i / n * 2 - 1);
      const c = Math.cos(an), s = Math.sin(an);
      let d = 0;
      while (d < Rg && !solid(x + c * (d + 6), y + s * (d + 6))) d += 6;
      LX.lineTo(cx + c * (d + 8) * LS, cy + s * (d + 8) * LS);
    }
    LX.closePath();
    const g = LX.createRadialGradient(cx, cy, 0, cx, cy, Rg * LS);
    g.addColorStop(0, `rgba(0,0,0,${al})`);
    g.addColorStop(.55, `rgba(0,0,0,${al * .7})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    LX.fillStyle = g; LX.fill();
  }

  // ---------- متن‌ها ----------
  function showBanner(t) { ui.onBanner(t); }
  function burst(x, y, n, c, sp) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = Math.random() * sp, l = .5 + Math.random() * .8;
      S.pt.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l, m: l, c, s: 1.5 + Math.random() * 3 });
    }
  }

  // ---------- ضبط ورودی ----------
  function bindInput() {
    const cvs = canvas;
    addEventListener('keydown', e => {
      S.kb[e.code] = 1;
      if (e.code === 'KeyF') { e.preventDefault(); toggleFlash(); }
      if (e.code === 'KeyE') { e.preventDefault(); flashBurst(); }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { e.preventDefault(); useAbility(); }
    });
    addEventListener('keyup', e => { S.kb[e.code] = 0; });

    cvs.addEventListener('pointerdown', e => {
      if (S.screen !== 'play' || S.joy.on) return;
      cvs.setPointerCapture(e.pointerId);
      S.joy.on = 1; S.joy.id = e.pointerId;
      S.joy.ox = S.joy.kx = e.clientX; S.joy.oy = S.joy.ky = e.clientY;
      S.joy.dx = S.joy.dy = 0;
    });
    cvs.addEventListener('pointermove', e => {
      if (!S.joy.on || e.pointerId !== S.joy.id) return;
      let dx = e.clientX - S.joy.ox, dy = e.clientY - S.joy.oy;
      const l = Math.hypot(dx, dy);
      if (l > 50) { dx *= 50 / l; dy *= 50 / l; }
      S.joy.kx = S.joy.ox + dx; S.joy.ky = S.joy.oy + dy;
      S.joy.dx = dx / 50; S.joy.dy = dy / 50;
    });
    const up = e => { if (e.pointerId === S.joy.id) { S.joy.on = 0; S.joy.dx = S.joy.dy = 0; } };
    cvs.addEventListener('pointerup', up); cvs.addEventListener('pointercancel', up);
  }

  function toggleFlash() {
    const local = S.players[S.localId];
    if (!local || S.screen !== 'play') return;
    local.li = !local.li;
    ui.onFlashToggle(local.li);
    net().sendFlashToggle(local.li);
  }

  function flashBurst() {
    const local = S.players[S.localId];
    if (!local || S.screen !== 'play') return;
    if (local.role !== 'dian') { ui.onToast('فقط دیان می‌تواند فلش بزند'); return; }
    net().sendFlashBurst();
  }

  // ابیلتی فرزاد: «برق‌زدگی» — ۴ ثانیه ۴۰٪ سریع‌تر، خنک‌شدن ۱۵ ثانیه
  function useAbility() {
    const local = S.players[S.localId];
    if (!local || local.role !== 'farzad' || S.screen !== 'play') return;
    if (S.abilityCd > 0) { ui.onToast('⏳ برق‌زدگی هنوز خنک نشده...'); return; }
    if (local.stun && local.stun > 0) { ui.onToast('💫 stunned!'); return; }
    S.abilityT = 4;
    S.abilityCd = 15;
    burst(local.x, local.y, 28, '#c07dff', 240);
    showBanner('⚡ برق‌زدگی! سرعتتان بالا رفت!');
    playTone(180, .35, 'sawtooth', .12, -120);
  }

  function abilityState() {
    return { t: S.abilityT, cd: S.abilityCd };
  }

  function net() { return window.Net; }

  // ---------- بروزرسانی ----------
  let lastSend = 0;
  function upd(dt) {
    S.mt += dt;
    const me = S.players[S.localId];
    if (!me) return;

    let dx = ((S.kb.KeyD || S.kb.ArrowRight) ? 1 : 0) - ((S.kb.KeyA || S.kb.ArrowLeft) ? 1 : 0);
    let dy = ((S.kb.KeyS || S.kb.ArrowDown) ? 1 : 0) - ((S.kb.KeyW || S.kb.ArrowUp) ? 1 : 0);
    if (S.joy.on) { dx = S.joy.dx; dy = S.joy.dy; }
    const l = Math.hypot(dx, dy);
    me.mv = (S.screen === 'play') && l > .12;
    if (l > 1) { dx /= l; dy /= l; }
    if (S.screen === 'quiz') { dx = 0; dy = 0; }

    const farzadStunned = me.stun && me.stun > 0;
    if (me.mv && !farzadStunned) {
      mv(me, dx * me.sp * dt, dy * me.sp * dt, 9);
      me.ang = Math.atan2(dy, dx);
      if (dx) me.fl = dx > 0 ? 1 : -1;
    }
    if (farzadStunned) me.stun -= dt;

    // دوربین
    S.cam.x += (me.x - S.cam.x) * Math.min(1, 8 * dt);
    S.cam.y += (me.y - S.cam.y) * Math.min(1, 8 * dt);
    S.shake = Math.max(0, S.shake - 45 * dt);
    S.flashT -= dt;
    if (S.abilityT > 0) S.abilityT = Math.max(0, S.abilityT - dt);
    if (S.abilityCd > 0) S.abilityCd = Math.max(0, S.abilityCd - dt);

    // 30ms یک‌بار موقعیت را به سرور بفرست
    const now = performance.now();
    if (now - lastSend > 50) {
      lastSend = now;
      net().sendMove(me.x, me.y, me.ang);
    }

    // فرزاد فعلی (یک‌بار در ابتدای هر فریم)
    const farzad = Object.values(S.players).find(p => p.role === 'farzad');

    // برخورد با کلید (فقط فراری‌دهنده‌ها)
    if (me.role !== 'farzad' && S.screen === 'play') {
      for (const k of S.keys) {
        if (!k.got && Math.hypot(k.x - me.x, k.y - me.y) < 26) {
          S.screen = 'quiz';
          S.joy.on = 0; S.joy.dx = S.joy.dy = 0;
          ui.onQuiz(k);
          return;
        }
      }
      // گرفتن بازیکن توسط فرزاد هوش مصنوعی (حالت انفرادی)
      if (farzad && farzad.ai && Math.hypot(farzad.x - me.x, farzad.y - me.y) < 24) {
        ui.onGameOver('farzad', '😈 فرزاد گرفتت! ... دوباره تلاش کن');
        S.screen = 'over';
        return;
      }
      // رسیدن به در
      if (S.gotCount >= 4 && Math.hypot(S.door.x - me.x, S.door.y - me.y) < 34) {
        net().sendReachedExit();
      }
    }

    // نزدیکی فرزاد → برای فراری‌دهنده‌ها ضربان قلب
    S.prox = 0;
    if (farzad && farzad.x !== undefined) {
      const d = Math.hypot(farzad.x - me.x, farzad.y - me.y);
      S.prox = Math.max(0, 1 - d / 380);
      S.hb -= dt;
      if (S.hb <= 0 && S.prox > .12) {
        playTone(58, .22, 'sine', .4, -28);
        setTimeout(() => playTone(58, .18, 'sine', .3, -24), 170);
        S.hb = 1.15 - S.prox * .7;
      }
    }

    // فرزاد خشمگین (و «برق‌زدگی» = ابیلتی سرعت)
    if (me.angry && me.angry > 0) me.angry -= dt;
    me.sp = me.role === 'farzad'
      ? (S.abilityT > 0 ? 1.4 : 1) * (me.angry > 0 ? 108 : 62 + S.gotCount * 9)
      : 120;

    // فرزاد هوش مصنوعی (فقط در حالت solo برای همان کلاینت)
    if (S.farzadAI && farzad && farzad.x !== undefined && farzad.ai) {
      if (farzad.stun && farzad.stun > 0) farzad.stun -= dt;
      const target = Object.values(S.players).find(p => p.role !== 'farzad');
      if (target && S.screen === 'play' && !(farzad.stun && farzad.stun > 0)) {
        // ابیلتی هوش مصنوعی فرزاد (وقتی نزدیک شد سرعتش بیشتر می‌شود)
        const dFar = Math.hypot(farzad.x - target.x, farzad.y - target.y);
        if (S.abilityCd <= 0 && dFar < 430 && Math.random() < dt * 0.8) {
          S.abilityT = 4; S.abilityCd = 15;
          burst(farzad.x, farzad.y, 26, '#c07dff', 240);
          showBanner('😈 فرزاد رگ غیرت کشید!');
        }
        chaseAI(farzad, target, dt);
      }
    }
    // دیان هوش مصنوعی (solo: دنبال فردین)
    if (S.dianAI) {
      const dian = Object.values(S.players).find(p => p.role === 'dian');
      const frd = Object.values(S.players).find(p => p.role === 'fardeen');
      if (dian && frd) {
        const d = Math.hypot(frd.x - dian.x, frd.y - dian.y);
        if (d > 50) {
          const a = Math.atan2(frd.y - dian.y, frd.x - dian.x);
          dian.x += Math.cos(a) * 108 * dt;
          dian.y += Math.sin(a) * 108 * dt;
          dian.ang = a;
          dian.mv = true;
          dian.fl = Math.cos(a) >= 0 ? 1 : -1;
        } else dian.mv = false;
        // فلش خودکار دیان AI
        if (farzad && Math.hypot(farzad.x - dian.x, farzad.y - dian.y) < 170 && dian.fcFlash !== true) {
          dian.fcFlash = true;
          setTimeout(() => { dian.fcFlash = false; }, 20000);
          burst(farzad.x, farzad.y, 30, '#fff', 220);
          farzad.stun = 3.5;
          showBanner('✨ دیان: نور رو بهش زدم! بدو!!');
          playTone(1400, .5, 'sine', .1, -1000);
        }
      }
    }

    // انیمیشن ذرات
    for (const p of S.pt) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= .97; p.vy *= .97;
      p.l -= dt;
    }
    S.pt = S.pt.filter(p => p.l > 0);
    if (Math.random() < dt * 2) {
      for (const k of S.keys) {
        if (!k.got) S.pt.push({ x: k.x + Math.random() * 20 - 10, y: k.y, vx: 0, vy: -15, l: .8, m: .8, c: '#ffd36e', s: 2 });
      }
    }
  }

  // هوش مصنوعی فرزاد: ساده‌ترین مسیر با BFS نسبت به بازیکن
  let cachePD = {}, cacheKey = '';
  function chaseAI(far, target, dt) {
    const tx = (far.x / T) | 0, ty = (far.y / T) | 0;
    const px = (target.x / T) | 0, py = (target.y / T) | 0;
    const key = px + ',' + py;
    if (cacheKey !== key) {
      cachePD = bfs(S.grid, px, py);
      cacheKey = key;
    }
    let gx = target.x, gy = target.y;
    if (tx !== px || ty !== py) {
      let best = 1e9;
      for (const [a, c] of DIR) {
        const nx = tx + a, ny = ty + c;
        if (nx < 0 || ny < 0 || nx >= GN || ny >= GN) continue;
        const v = cachePD[ny][nx];
        if (v >= 0 && v < best) { best = v; gx = (nx + .5) * T; gy = (ny + .5) * T; }
      }
    }
    const a = Math.atan2(gy - far.y, gx - far.x);
    const sp = (far.angry > 0 ? 108 : 62 + S.gotCount * 9) * (S.abilityT > 0 ? 1.4 : 1);
    far.x += Math.cos(a) * sp * dt;
    far.y += Math.sin(a) * sp * dt;
    far.ang = a;
  }

  // ---------- رسم ----------
  function world() {
    const x0 = Math.max(0, Math.floor((S.cam.x - W / 2) / T) - 1);
    const x1 = Math.min(GN - 1, Math.floor((S.cam.x + W / 2) / T) + 1);
    const y0 = Math.max(0, Math.floor((S.cam.y - H / 2) / T) - 1);
    const y1 = Math.min(GN - 1, Math.floor((S.cam.y + H / 2) / T) + 1);

    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const h = ((x * 73856093) ^ (y * 19349663)) >>> 0, px = x * T, py = y * T;
      if (!S.grid[y][x]) {
        ctx.fillStyle = (x + y) & 1 ? '#1f1a2b' : '#191522';
        ctx.fillRect(px, py, T, T);
        ctx.strokeStyle = 'rgba(255,255,255,.04)';
        ctx.strokeRect(px, py, T, T);
        if (h % 5 == 0) {
          ctx.strokeStyle = 'rgba(0,0,0,.5)';
          ctx.beginPath(); ctx.moveTo(px + 10 + h % 30, py + 8);
          ctx.lineTo(px + 28 + h % 20, py + 30); ctx.lineTo(px + 22, py + 52); ctx.stroke();
        }
        if (h % 23 == 0) {
          ctx.fillStyle = 'rgba(120,0,20,.5)';
          ctx.beginPath(); ctx.ellipse(px + 38, py + 40, 17, 10, h % 3, 0, TAU); ctx.fill();
        }
      }
    }
    // دیوارها
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!S.grid[y][x]) continue;
      const h = ((x * 73856093) ^ (y * 19349663)) >>> 0, px = x * T, py = y * T;
      ctx.fillStyle = '#352c4a'; ctx.fillRect(px, py, T, T);
      ctx.fillStyle = '#4a3f66'; ctx.fillRect(px, py, T, 3);
      if (y + 1 < GN && !S.grid[y + 1][x]) {
        const fy = py + T;
        ctx.fillStyle = '#241d36'; ctx.fillRect(px, fy, T, 26);
        ctx.strokeStyle = '#150f22'; ctx.lineWidth = 1;
        for (let r = 0; r < 2; r++) {
          ctx.strokeRect(px + (r ? -12 : 0), fy + r * 13, T / 2 + 6, 13);
          ctx.strokeRect(px + T / 2 + 6 + (r ? -12 : 0), fy + r * 13, T / 2 + 6, 13);
        }
        if (h % 5 == 2) {
          ctx.font = '800 12px Vazirmatn,Tahoma,sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(200,30,50,.75)';
          ctx.fillText(WT[h % 5], px + T / 2, fy + 18);
        }
      }
    }
    // کلیدها
    for (const k of S.keys) {
      if (k.got) continue;
      const y = k.y + Math.sin(S.mt * 3 + k.ph) * 3;
      ctx.save();
      ctx.translate(k.x, y);
      ctx.rotate(Math.sin(S.mt * 2 + k.ph) * .2);
      ctx.shadowColor = '#ffd36e'; ctx.shadowBlur = 18;
      ctx.strokeStyle = '#ffd36e'; ctx.fillStyle = '#ffd36e'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(-6, 0, 6, 0, TAU); ctx.stroke();
      ctx.fillRect(0, -1.5, 14, 3); ctx.fillRect(9, 0, 3, 6); ctx.fillRect(13, 0, 3, 4);
      ctx.restore();
    }
    // در
    const ok = S.gotCount >= 4, dx = S.door.x, dy = S.door.y;
    ctx.fillStyle = '#3a2414'; ctx.fillRect(dx - 28, dy - 36, 56, 66);
    ctx.fillStyle = '#6b4524'; ctx.fillRect(dx - 23, dy - 31, 46, 61);
    ctx.shadowColor = ok ? '#38ff8a' : '#ff2a4d';
    ctx.shadowBlur = 14 + 6 * Math.sin(S.mt * 4);
    ctx.fillStyle = ok ? '#38ff8a' : '#ff2a4d';
    ctx.beginPath(); ctx.arc(dx, dy - 6, 7, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#111'; ctx.fillRect(dx - 2, dy - 6, 4, 10);

    // کاراکترها (به ترتیب دمای y)
    const list = Object.values(S.players).filter(p => p.x !== null);
    list.sort((a, b) => a.y - b.y);
    for (const p of list) {
      if (p.role === 'farzad') drawShadow(ctx, p.x, p.y, 1.35, S.mt, 0, 1);
      else drawChara(ctx, p.role, p.x, p.y, p.role === 'fardeen' ? 1.25 : 1.15, S.mt, p.mv, p.fl || 1);
    }

    // ذرات
    ctx.globalCompositeOperation = 'lighter';
    for (const p of S.pt) {
      ctx.globalAlpha = Math.max(0, p.l / p.m);
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function draw() {
    ctx.setTransform(D, 0, 0, D, 0, 0);
    ctx.fillStyle = '#050308';
    ctx.fillRect(0, 0, W, H);
    if (!S.grid || S.screen === 'menu') return;

    S.shx = S.shake > 0 ? (Math.random() - .5) * S.shake : 0;
    S.shy = S.shake > 0 ? (Math.random() - .5) * S.shake : 0;

    ctx.save();
    ctx.translate(W / 2 - S.cam.x + S.shx, H / 2 - S.cam.y + S.shy);
    world();
    ctx.restore();

    // ===== تاریکی =====
    LX.setTransform(1, 0, 0, 1, 0, 0);
    LX.globalCompositeOperation = 'source-over';
    const local = S.players[S.localId];
    const dimmer = local && local.role === 'farzad'; // فرزاد همه‌جا را کم‌کاملاً می‌بیند (هاله‌ی روح)
    LX.fillStyle = dimmer ? 'rgba(2,1,6,.40)' : 'rgba(2,1,6,.975)';
    LX.fillRect(0, 0, L.width, L.height);
    LX.globalCompositeOperation = 'destination-out';
    const fl = .93 + .07 * Math.sin(S.mt * 31) * Math.random();
    for (const p of Object.values(S.players)) {
      if (p.x === null) continue;
      if (p.role === 'farzad') {
        // هاله‌ی بزرگ روشن برای روح (هر وقت stun باشد هم تغییری نمی‌کند)
        lightHole(p.x, p.y, 0, Math.PI, 24, 340, 1);
        continue;
      }
      const Rg = p.li ? (p.angry > 0 ? 270 : 330) : 95;
      if (p.li) lightHole(p.x, p.y, p.ang, .5, 34, Rg * fl, 1);
      lightHole(p.x, p.y, 0, Math.PI, 22, p.li ? 95 : 60, .95);
    }
    for (const k of S.keys) if (!k.got) lightHole(k.x, k.y, 0, Math.PI, 10, 50, .9);
    if (S.gotCount >= 4) lightHole(S.door.x, S.door.y, 0, Math.PI, 10, 110, .9);
    ctx.drawImage(L, 0, 0, W, H);

    // چشم‌های فرزاد در تاریکی (فقط برای فراری‌دهنده‌ها ترسناک باشد)
    const fz = Object.values(S.players).find(p => p.role === 'farzad');
    if (fz && fz.x !== null && fz.stun <= 0 && local && local.role !== 'farzad') {
      const d = Math.hypot(fz.x - local.x, fz.y - local.y);
      if (d < 330) {
        drawShadow(ctx, fz.x - S.cam.x + W / 2 + S.shx, fz.y - S.cam.y + H / 2 + S.shy, 1.35, S.mt, 1, Math.min(1, (330 - d) / 200) * (.75 + .25 * Math.sin(S.mt * 9)));
      }
    }

    // ویگنت قرمز وقتی فرزاد نزدیک است (فقط فراری‌دهنده‌ها)
    if (local && local.role !== 'farzad' && S.prox > .1) {
      const g = ctx.createRadialGradient(W / 2, H / 2, H * .25, W / 2, H / 2, H * .85);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(${Math.round(90 * S.prox)},0,0,.85)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    // فلش سفید هنگام stun
    if (S.flashT > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(.8, S.flashT * 2.2)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // لرزش جوی‌استیک
    if (S.joy.on) {
      ctx.strokeStyle = '#fff4'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(S.joy.ox, S.joy.oy, 50, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#fff3';
      ctx.beginPath(); ctx.arc(S.joy.kx, S.joy.ky, 22, 0, TAU); ctx.fill();
    }
  }

  function frame(ts) {
    const dt = Math.min(.05, (ts - S.last) / 1000 || 0);
    S.last = ts;
    S.t += dt;
    if (S.screen === 'play' || S.screen === 'quiz') upd(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // ---------- صدا ----------
  function playTone(f, d = .2, ty = 'sine', v = .1, sl = 0) {
    try {
      if (!window.AC) window.AC = new (window.AudioContext || window.webkitAudioContext)();
      const AC = window.AC, t = AC.currentTime;
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = ty; o.frequency.setValueAtTime(f, t);
      if (sl) o.frequency.exponentialRampToValueAtTime(Math.max(25, f + sl), t + d);
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(.001, t + d);
      o.connect(g); g.connect(AC.destination);
      o.start(); o.stop(t + d);
    } catch (e) { }
  }

  // ============================== API ==============================
  function init(refs) {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');
    L = document.createElement('canvas');
    LX = L.getContext('2d');
    ui = refs;
    resize();
    addEventListener('resize', resize);
    bindInput();
    requestAnimationFrame(frame);
  }

  // شروع تطابق جدید
  function startMatch(opts) {
    S.mode = opts.mode;
    S.seed = opts.seed >>> 0;
    S.localId = opts.localId;
    S.localRole = opts.role;
    S.screen = 'play';
    S.t = 0; S.gotCount = 0; S.pt = []; S.flashT = 0; S.shake = 0;
    S.kb = {};
    S.joy.on = 0; S.joy.dx = S.joy.dy = 0;
    S.players = {};
    cacheKey = '';

    const rnd = mulberry32((S.seed ^ 0x9e3779b9) >>> 0);
    const sd = gen(S.seed);
    const farSpawn = farStart(sd, rnd);
    // اینندکس کلیدها برای ارتباط با سرور
    S.keys.forEach((k, i) => { k._idx = i; });

    const farStartPos = farSpawn;
    for (const p of opts.players) {
      const base = {
        id: p.id,
        username: p.username,
        role: p.role,
        x: null, y: null, ang: 0, la: 0, li: true, mv: false,
        fl: 1, sp: p.role === 'farzad' ? 80 : 120,
        stun: 0, angry: 0, ai: false
      };
      if (p.role === 'fardeen') { base.x = 1.5 * T; base.y = 1.5 * T; base.li = true; }
      else if (p.role === 'dian') { base.x = 1.5 * T; base.y = 1.5 * T + 22; base.li = true; }
      else if (p.role === 'farzad') { base.x = farStartPos.x; base.y = farStartPos.y; base.li = false; }
      S.players[p.id] = base;
    }

    S.cam.x = 1.5 * T; S.cam.y = 1.5 * T;

    S.farzadAI = S.mode === 'solo';
    S.dianAI = S.mode === 'solo';

    // در حالت انفرادی: فرزاد و دیان را به‌صورت هوش مصنوعی روی همین کلاینت بساز
    if (S.mode === 'solo') {
      S.players['ai-dian'] = {
        id: 'ai-dian', username: 'دیان (AI)', role: 'dian',
        x: 1.5 * T, y: 1.5 * T + 22, ang: 0, la: 0, li: true, mv: false,
        fl: 1, sp: 120, stun: 0, angry: 0, ai: true, fcFlash: false
      };
      S.players['ai-farzad'] = {
        id: 'ai-farzad', username: 'فرزاد (AI)', role: 'farzad',
        x: farStartPos.x, y: farStartPos.y, ang: 0, la: 0, li: false, mv: false,
        fl: 1, sp: 80, stun: 0, angry: 0, ai: true
      };
    }

    const me = S.players[S.localId];
    if (me) { me.x = me.x; me.li = me.li; S.cam.x = me.x; S.cam.y = me.y; }

    if (S.mode === 'solo' && opts.players.length === 1) {
      const shown = Object.values(S.players)[0];
      S.cam.x = shown.x; S.cam.y = shown.y;
    }

    showBanner(S.localRole === 'farzad' ? '😈 فرزاد بیدار شد... بگیرشون!' : '🔦 ۴ تا کلید پیدا کن!');
    ui.onKeys(0);
  }

  function updateRemotePlayer(info) {
    const p = S.players[info.id];
    if (!p) return;
    if (S.localId === info.id) return; // موقعیت خودی از سرور قبول نکن
    p.x = info.x; p.y = info.y; p.ang = info.angle ?? p.ang;
  }

  function applyFlashToggle(id, on) {
    const p = S.players[id];
    if (p) p.li = on;
  }

  function applyKeyCollected(keyIndex, gotCount) {
    if (S.keys[keyIndex]) S.keys[keyIndex].got = true;
    S.gotCount = gotCount;
    ui.onKeys(gotCount);
    burst(S.keys[keyIndex] ? S.keys[keyIndex].x : S.door.x,
          S.keys[keyIndex] ? S.keys[keyIndex].y : S.door.y,
          24, '#ffd36e', 170);
    playTone(880, .4, 'triangle', .12, 500);
    if (gotCount >= 4) showBanner('🚪 همهٔ کلیدها رو داری! برو سمت در');
    else showBanner('🔑 یک کلید برداشتی!');
    if (S.screen === 'quiz') S.screen = 'play';
  }

  function applyFarzadEnraged() {
    const fz = Object.values(S.players).find(p => p.role === 'farzad');
    if (fz) { fz.angry = 10; fz.stun = 0; }
    // فرزادِ هوش مصنوعی (حالت انفرادی): تلپورت به فاصله‌ی ۳ خانه از بازیکن
    const me = S.players[S.localId];
    const aiFz = Object.values(S.players).find(p => p.role === 'farzad' && p.ai);
    if (me && aiFz) {
      const sd = bfs(S.grid, (me.x / T) | 0, (me.y / T) | 0);
      const cand = [];
      for (let y = 0; y < GN; y++) for (let x = 0; x < GN; x++) if (sd[y][x] === 3) cand.push([x, y]);
      if (cand.length) {
        const [x, y] = cand[(Math.random() * cand.length) | 0];
        aiFz.x = (x + .5) * T;
        aiFz.y = (y + .5) * T;
      }
    }
    S.shake = 24;
    S.flashT = .35;
    showBanner('😱 فرزاد پشت سرته! فرار کن!!');
    try { navigator.vibrate && navigator.vibrate([200, 80, 200]); } catch (e) { }
    playTone(90, .8, 'sawtooth', .3, -40);
    // شوک صوتی شبیه صدای جیغ/سایش
    try {
      if (!window.AC) window.AC = new (window.AudioContext || window.webkitAudioContext)();
      const AC = window.AC, n = AC.sampleRate * .4, b = AC.createBuffer(1, n, AC.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = AC.createBufferSource(); s.buffer = b;
      const g = AC.createGain(); g.gain.value = .5;
      s.connect(g); g.connect(AC.destination); s.start();
    } catch (e) { }
  }

  function applyFarzadStunned() {
    const fz = Object.values(S.players).find(p => p.role === 'farzad');
    if (fz) { fz.stun = 3.5; fz.angry = 0; }
    if (fz) burst(fz.x, fz.y, 40, '#ffffff', 260);
    S.flashT = .45;
    showBanner('✨ نور خیره‌کننده! فرزاد برای چند ثانیه خشکش زد!');
    playTone(1400, .5, 'sine', .1, -1000);
  }

  function applyGameOver() {
    S.screen = 'over';
    S.joy.on = 0; S.joy.dx = S.joy.dy = 0;
  }

  function resumeFromQuiz(correct) {
    S.screen = 'play';
    return S.screen;
  }

  return {
    init, startMatch, updateRemotePlayer, applyFlashToggle,
    applyKeyCollected, applyFarzadEnraged, applyFarzadStunned, applyGameOver,
    resumeFromQuiz, useAbility, abilityState,
    // برای دیباگ:
    _state: S
  };
})();
