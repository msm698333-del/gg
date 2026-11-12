// ============================== نقشه مهاجران — موتور بازی (Canvas 2D) ==============================
const ARENA_SIZE = 4000;

class GameEngine {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.isPlaying = false;
    this.playerId = null;
    this.roomCode = null;
    this.players = new Map();
    this.localPlayer = null;

    this.camera = { x: 0, y: 0 };
    this.screenWidth = window.innerWidth;
    this.screenHeight = window.innerHeight;
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.keys = {};
    window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    this.touch = { active: false, dx: 0, dy: 0 };
    this._setupTouchControls();

    this.lastTime = performance.now();
    this.moveSendTimer = 0;
    this.animationId = null;

    // دنیا: درخت، ساختمان، خیابان، سنگ
    this.obstacles = [];
    this._generateWorld();

    this.animationId = null;
  }

  resizeCanvas() {
    this.screenWidth = window.innerWidth;
    this.screenHeight = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(this.screenWidth * dpr);
    this.canvas.height = Math.floor(this.screenHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.canvas.style.width = this.screenWidth + 'px';
    this.canvas.style.height = this.screenHeight + 'px';
  }

  _generateWorld() {
    let seed = 42;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    // ساختمان‌ها
    for (let i = 0; i < 45; i++) {
      const w = 120 + rand() * 180;
      const h = 90 + rand() * 160;
      this.obstacles.push({ type: 'building', x: rand() * ARENA_SIZE, y: rand() * ARENA_SIZE, width: w, height: h, color: ['#1e3a5f', '#3f3f46', '#45305f', '#273449', '#30424e'][Math.floor(rand() * 5)] });
    }
    // درخت‌ها
    for (let i = 0; i < 80; i++) {
      this.obstacles.push({ type: 'tree', x: rand() * ARENA_SIZE, y: rand() * ARENA_SIZE, radius: 14 + rand() * 18 });
    }
    // سنگ‌ها
    for (let i = 0; i < 40; i++) {
      this.obstacles.push({ type: 'rock', x: rand() * ARENA_SIZE, y: rand() * ARENA_SIZE, width: 30 + rand() * 60, height: 20 + rand() * 40 });
    }
  }

  _setupTouchControls() {
    const zone = document.getElementById('joystick-zone');
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');
    const maxDist = 45;

    const start = (clientX, clientY) => {
      this.touch.active = true;
      this.touch.base = { x: clientX, y: clientY };
      moveImpl(clientX, clientY);
      base.style.left = clientX - 60 + 'px';
      base.style.top = clientY - 60 + 'px';
    };

    const moveImpl = (clientX, clientY) => {
      if (!this.touch.active) return;
      let dx = clientX - this.touch.base.x;
      let dy = clientY - this.touch.base.y;
      const dist = Math.hypot(dx, dy);
      if (dist > maxDist) { dx = dx / dist * maxDist; dy = dy / dist * maxDist; }
      this.touch.dx = dx;
      this.touch.dy = dy;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };

    const end = () => {
      this.touch.active = false;
      this.touch.dx = 0;
      this.touch.dy = 0;
      knob.style.transform = 'translate(-50%, -50%)';
    };

    zone.addEventListener('touchstart', (e) => { const t = e.touches[0]; start(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
    zone.addEventListener('touchmove', (e) => { const t = e.touches[0]; moveImpl(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
    zone.addEventListener('touchend', end);
    zone.addEventListener('touchcancel', end);
  }

  start(playerId, players, roomCode) {
    this.playerId = playerId;
    this.roomCode = roomCode;
    this.players = new Map();
    (players || []).forEach(p => this.players.set(p.id, { ...p, moving: false }));
    this.localPlayer = this.players.get(playerId);
    if (this.localPlayer) {
      this.camera.x = Math.max(0, this.localPlayer.x - this.screenWidth / 2);
      this.camera.y = Math.max(0, this.localPlayer.y - this.screenHeight / 2);
    }
    this.isPlaying = true;
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('settings-screen').classList.add('hidden');
    document.getElementById('hud-room-code').textContent = roomCode;
    this.lastTime = performance.now();
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this._animate();
  }

  stop() {
    this.isPlaying = false;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('menu-screen').classList.remove('hidden');
  }

  updateRemotePlayers(players) {
    (players || []).forEach(p => {
      const local = this.players.get(p.id);
      if (local) {
        // lerp نرم برای حرکت روانبازیکن‌های دیگر
        local.x = p.x;
        local.y = p.y;
        local.angle = p.angle;
      } else {
        this.players.set(p.id, { ...p, moving: false });
      }
    });
  }

  setRemotePlayer(p) {
    const local = this.players.get(p.id);
    if (local) {
      local.x = p.x; local.y = p.y; local.angle = p.angle;
    } else {
      this.players.set(p.id, { ...p, moving: false });
    }
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
  }

  addChatMessage(data) {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'chat-message';
    el.innerHTML = '<strong style="color:' + (data.color || '#fff') + '">' + this._esc(data.username) + ':</strong> ' + this._esc(data.message);
    box.appendChild(el);
    while (box.children.length > 60) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }

  addSystemMessage(text) {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'chat-message chat-system';
    el.textContent = '» ' + text;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
  }

  _esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  renderPlayerList(players) {
    const list = document.getElementById('players-list');
    const hud = document.getElementById('players-box');
    if (!list || !hud) return;
    list.innerHTML = '';
    players.forEach(p => {
      const el = document.createElement('div');
      el.className = 'player-tag';
      el.innerHTML = '<span class="player-dot" style="background:' + p.color + '"></span>' + this._esc(p.username);
      list.appendChild(el);
    });
    hud.style.display = players.length > 0 ? 'flex' : 'none';
  }

  _animate() {
    if (!this.isPlaying) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    this._updateLocalMovement(dt);
    this._updateCamera();
    this._draw();

    this.animationId = requestAnimationFrame(() => this._animate());
  }

  _updateLocalMovement(dt) {
    const lp = this.localPlayer;
    if (!lp) return;

    let vx = 0, vy = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) vy -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) vy += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) vx -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) vx += 1;
    if (this.touch.active) { vx += this.touch.dx / 45; vy += this.touch.dy / 45; }

    const len = Math.hypot(vx, vy);
    if (len > 0.01) {
      vx /= len; vy /= len;
      const speed = 200;
      lp.x += vx * speed * dt;
      lp.y += vy * speed * dt;
      lp.angle = Math.atan2(vy, vx);
      lp.moving = true;
      lp.x = Math.max(20, Math.min(ARENA_SIZE - 20, lp.x));
      lp.y = Math.max(20, Math.min(ARENA_SIZE - 20, lp.y));
      this._resolveCollision(lp);

      // همگام‌سازی با سرور (حدود ۲۰ بار در ثانیه)
      this.moveSendTimer += dt;
      if (this.moveSendTimer >= 0.05) {
        this.moveSendTimer = 0;
        if (window.socketClient && window.socketClient.socket) {
          window.socketClient.movePlayer(lp.x, lp.y, lp.angle);
        }
      }
    } else {
      lp.moving = false;
    }
  }

  _resolveCollision(p) {
    for (const o of this.obstacles) {
      if (o.type === 'building' || o.type === 'rock') {
        const hw = o.width / 2 + 18;
        const hh = o.height / 2 + 18;
        if (Math.abs(p.x - o.x) < hw && Math.abs(p.y - o.y) < hh) {
          const dx = p.x - o.x;
          const dy = p.y - o.y;
          const overlapX = hw - Math.abs(dx);
          const overlapY = hh - Math.abs(dy);
          if (overlapX < overlapY) p.x = o.x + Math.sign(dx || 1) * hw;
          else p.y = o.y + Math.sign(dy || 1) * hh;
        }
      } else if (o.type === 'tree') {
        const dx = p.x - o.x, dy = p.y - o.y;
        const dist = Math.hypot(dx, dy), minD = o.radius + 16;
        if (dist < minD && dist > 0.001) { p.x = o.x + dx / dist * minD; p.y = o.y + dy / dist * minD; }
      }
    }
  }

  _updateCamera() {
    const lp = this.localPlayer;
    if (!lp) return;
    const targetX = lp.x - this.screenWidth / 2;
    const targetY = lp.y - this.screenHeight / 2;
    this.camera.x += (targetX - this.camera.x) * 0.1;
    this.camera.y += (targetY - this.camera.y) * 0.1;
    this.camera.x = Math.max(0, Math.min(ARENA_SIZE - this.screenWidth, this.camera.x));
    this.camera.y = Math.max(0, Math.min(ARENA_SIZE - this.screenHeight, this.camera.y));
    if (this.screenWidth >= ARENA_SIZE) this.camera.x = (ARENA_SIZE - this.screenWidth) / 2;
    if (this.screenHeight >= ARENA_SIZE) this.camera.y = (ARENA_SIZE - this.screenHeight) / 2;
  }

  _draw() {
    const ctx = this.ctx;
    ctx.fillStyle = '#87ceeb';
    ctx.fillRect(0, 0, this.screenWidth, this.screenHeight);

    ctx.save();
    ctx.translate(-this.camera.x, -this.camera.y);

    // زمین
    ctx.fillStyle = '#5a9e5a';
    ctx.fillRect(0, 0, ARENA_SIZE, ARENA_SIZE);

    // خیابان‌ها
    ctx.fillStyle = '#3d3d3d';
    for (let i = 0; i <= 6; i++) {
      const pos = 600 + i * 550;
      ctx.fillRect(pos, 0, 70, ARENA_SIZE); // عمودی
      ctx.fillRect(0, pos, ARENA_SIZE, 70); // افقی
    }

    // موانع در viewport
    const viewL = this.camera.x - 200, viewR = this.camera.x + this.screenWidth + 200;
    const viewT = this.camera.y - 200, viewB = this.camera.y + this.screenHeight + 200;
    for (const o of this.obstacles) {
      if (o.x < viewL || o.x > viewR || o.y < viewT || o.y > viewB) continue;
      if (o.type === 'building') this._drawBuilding(o);
      else if (o.type === 'tree') this._drawTree(o);
      else this._drawRock(o);
    }

    // بازیکنان
    for (const p of this.players.values()) this._drawPlayer(p);

    ctx.restore();

    // حاشیه دطاق
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 6;
    ctx.strokeRect(0 - this.camera.x, 0 - this.camera.y, ARENA_SIZE, ARENA_SIZE);
  }

  _drawBuilding(o) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(o.x - o.width/2 + 12, o.y - o.height/2 + 12, o.width, o.height);
    ctx.fillStyle = o.color || '#334155';
    ctx.fillRect(o.x - o.width/2, o.y - o.height/2, o.width, o.height);
    ctx.fillStyle = '#1a2532';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0f172a';
    ctx.strokeRect(o.x - o.width/2, o.y - o.height/2, o.width, o.height);
    // پنجره‌ها
    ctx.fillStyle = '#ffd700';
    const rows = Math.floor(o.height / 45);
    const cols = Math.floor(o.width / 45);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = o.x - o.width/2 + 22 + c * 45;
        const wy = o.y - o.height/2 + 22 + r * 45;
        ctx.fillRect(wx, wy, 20, 16);
      }
    }
  }

  _drawTree(o) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(o.x + 6, o.y + 6, o.radius, o.radius * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8B5A2B';
    ctx.fillRect(o.x - 5, o.y, 10, 22);
    ctx.fillStyle = '#1f6e43';
    ctx.beginPath();
    ctx.arc(o.x, o.y - 6, o.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2e8b57';
    ctx.beginPath();
    ctx.arc(o.x - 6, o.y - 12, o.radius * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawRock(o) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(o.x + 8, o.y + 6, o.width/2, o.height/2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a7a7a';
    ctx.beginPath();
    ctx.ellipse(o.x, o.y, o.width/2, o.height/2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  _drawPlayer(p) {
    const ctx = this.ctx;
    const t = Date.now();
    ctx.save();
    ctx.translate(p.x, p.y);

    // سایه
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 14, 20, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // بدن
    ctx.save();
    ctx.rotate(p.angle);
    ctx.fillStyle = p.color;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    // پاها (انیمیشن راه رفتن)
    const walkOffset = p.moving ? Math.sin(t / 90) * 8 : 0;
    ctx.fillRect(-10, 8, 7, 16 + walkOffset);
    ctx.fillRect(3, 8, 7, 16 - walkOffset);
    // تنه گرد
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // جهت نماند
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(14, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // نام بالای سر
    const showNames = !document.getElementById('setting-names') || document.getElementById('setting-names').checked;
    if (showNames) {
      ctx.font = 'bold 14px Vazirmatn, Tahoma';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const w = ctx.measureText(p.username).width + 12;
      ctx.fillRect(-w/2, -44, w, 20);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(p.username, 0, -29);
    }
    ctx.restore();
  }
}

const game = new GameEngine();
window.game = game;
