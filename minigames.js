// ============================================================
//  minigames.js — «بازی‌های بیشتر»: دوز | شطرنج | جرئت یا حقیقت
//  همهٔ این بازی‌ها روی همین دستگاه و بدون اینترنت هم کار می‌کنند.
// ============================================================
import { Chess } from '/lib/chess.js';

const $ = (id) => document.getElementById(id);

const showScreen = (window.showScreen) || function (name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.toggle('hide', el.id !== name));
};

// ---------- دکمهٔ «بازی‌های بیشتر» و کارت‌ها و دکمه‌های برگشت ----------
$('btn-more-games').addEventListener('click', () => showScreen('more-screen'));
// بازگشت از فرایند «TRUST» → مستقیم صفحه‌ی بازی‌های بیشتر
if (new URLSearchParams(location.search).get('more') === '1') showScreen('more-screen');
// کارت TRUST — صفحه‌ی کامل مجزای trust.html را باز می‌کند
const trustCard = $('open-trust');
if (trustCard) trustCard.addEventListener('click', () => { window.location.href = '/trust'; });
document.querySelectorAll('.more-card[data-open]').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.open));
});
document.querySelectorAll('[data-back]').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.back));
});

// ============================================================
//  دوز (Tic-Tac-Toe)
// ============================================================
(function initTicTacToe() {
  const boardEl = $('ttt-board');
  const statusEl = $('ttt-status');
  const modeButtons = document.querySelectorAll('#ttt-modes .mini-mode');

  const WINS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  let board = Array(9).fill(null);
  let turn = 'X';
  let gameOver = false;
  let mode = 'ai';

  function render() {
    boardEl.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const b = document.createElement('button');
      b.className = 'ttt-cell' + (board[i] ? ' filled' : '');
      b.textContent = board[i] || '';
      b.setAttribute('aria-label', 'خانه ' + (i + 1));
      b.addEventListener('click', () => play(i));
      boardEl.appendChild(b);
    }
  }

  function winnerOf(b) {
    for (const [a, c, d] of WINS) {
      if (b[a] && b[a] === b[c] && b[c] === b[d]) return b[a];
    }
    return b.every(v => v) ? 'draw' : null;
  }

  function minimax(b, isMax, aiMark, human, depth) {
    const w = winnerOf(b);
    if (w === aiMark) return 10 - depth;
    if (w === human) return depth - 10;
    if (w === 'draw') return 0;
    let best = isMax ? -Infinity : Infinity;
    for (let i = 0; i < 9; i++) {
      if (b[i]) continue;
      b[i] = isMax ? aiMark : human;
      const v = minimax(b, !isMax, aiMark, human, depth + 1);
      b[i] = null;
      best = isMax ? Math.max(best, v) : Math.min(best, v);
    }
    return best;
  }

  function bestMove(b, aiMark) {
    const human = aiMark === 'X' ? 'O' : 'X';
    let bestScore = -Infinity, bestIdx = 4;
    if (!b[4]) return 4; // مرکز بهترین خانه است
    for (let i = 0; i < 9; i++) {
      if (b[i]) continue;
      b[i] = aiMark;
      const s = minimax(b, false, aiMark, human, 0);
      b[i] = null;
      if (s > bestScore) { bestScore = s; bestIdx = i; }
    }
    return bestIdx;
  }

  function play(i) {
    if (gameOver || board[i]) return;
    board[i] = turn;
    render();
    const w = winnerOf(board);
    if (w) return finish(w);
    turn = turn === 'X' ? 'O' : 'X';
    if (mode === 'ai' && turn === 'O') {
      statusEl.textContent = 'هوش مصنوعی فکر می‌کند...';
      setTimeout(aiPlay, 350);
    } else {
      statusEl.textContent = 'نوبت ' + (turn === 'X' ? '×' : '○') + ' است';
    }
  }

  function aiPlay() {
    if (gameOver) return;
    const i = bestMove(board, 'O');
    if (i >= 0) board[i] = 'O';
    render();
    const w = winnerOf(board);
    if (w) return finish(w);
    turn = 'X';
    statusEl.textContent = 'نوبت شما (×) است';
  }

  function finish(w) {
    gameOver = true;
    if (w === 'draw') {
      statusEl.textContent = 'مساوی شد! 🤝';
      return;
    }
    if (mode === '2p') {
      statusEl.textContent = 'بازیکن ' + (w === 'X' ? '×' : '○') + ' برنده شد! 🎉';
    } else {
      statusEl.textContent = w === 'X' ? 'شما بردید! 🎉' : 'هوش مصنوعی برنده شد 😈 دوباره تلاش کن!';
    }
  }

  function reset() {
    board = Array(9).fill(null);
    turn = 'X';
    gameOver = false;
    render();
    statusEl.textContent = mode === 'ai' ? 'نوبت شما (×) است' : 'نوبت × است';
  }

  modeButtons.forEach(btn => btn.addEventListener('click', () => {
    modeButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    mode = btn.dataset.mode;
    reset();
  }));
  $('ttt-reset').addEventListener('click', reset);
  reset();
})();

// ============================================================
//  شطرنج (chess.js)
// ============================================================
(function initChess() {
  const boardEl = $('chess-board');
  const statusEl = $('chess-status');
  const infoEl = $('chess-moves-info');
  const modeButtons = document.querySelectorAll('#chess-modes .mini-mode');

  const GLYPH = {
    w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
    b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
  };
  const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 99 };

  let game = new Chess();
  let selected = null;
  let mode = 'ai'; // در مقابل AI شما سفید هستید
  let busy = false;

  function squareAt(row, col) {
    const file = 'abcdefgh'[col];
    return file + (8 - row);
  }

  function legalTargets(sq) {
    return game.moves({ square: sq, verbose: true }).map(m => m.to);
  }

  function render(highlight) {
    boardEl.innerHTML = '';
    const pos = game.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = squareAt(r, c);
        const div = document.createElement('button');
        div.className = 'chess-square ' + (((r + c) % 2 === 0) ? 'light' : 'dark');
        div.dataset.square = sq;
        if (selected === sq) div.classList.add('selected');
        if (highlight && highlight.includes(sq)) div.classList.add('highlight');
        const piece = pos[r][c];
        if (piece) div.textContent = GLYPH[piece.color][piece.type];
        div.addEventListener('click', () => onSquare(sq));
        boardEl.appendChild(div);
      }
    }
    updateStatus();
  }

  function updateStatus() {
    if (game.isCheckmate()) {
      statusEl.textContent = 'کیش‌و‌مات! ' + (game.turn() === 'w' ? 'سیاه' : 'سفید') + ' برنده شد 🎉';
      return;
    }
    if (game.isStalemate()) { statusEl.textContent = 'پات (مساوی) 🤝'; return; }
    if (game.isDraw()) { statusEl.textContent = 'مساوی 🤝'; return; }
    const turnFa = game.turn() === 'w' ? 'سفید' : 'سیاه';
    statusEl.textContent = (game.isCheck() ? '⚠️ کیش! ' : '') + 'نوبت ' + turnFa + ' است';
    infoEl.textContent = 'تعداد حرکت‌ها: ' + game.history().length;
  }

  function onSquare(sq) {
    if (busy || game.isGameOver()) return;
    if (selected) {
      const targets = legalTargets(selected);
      if (targets.includes(sq)) {
        game.move({ from: selected, to: sq, promotion: 'q' });
        selected = null;
        render(null);
        if (!game.isGameOver()) maybeAiMove();
        return;
      }
    }
    const piece = game.get(sq);
    if (piece && piece.color === game.turn()) {
      selected = (selected === sq) ? null : sq;
      render(selected ? legalTargets(selected) : null);
    } else {
      selected = null;
      render(null);
    }
  }

  // هوش مصنوعی ساده: بیشترین امتیازِ قابل گرفتن را انتخاب می‌کند؛ وگرنه تصادفی
  function aiBestMove() {
    const moves = game.moves({ verbose: true });
    let bestVal = -1;
    let bestList = [];
    for (const m of moves) {
      let v = 0;
      if (m.captured) v = PIECE_VALUE[m.captured] * 10 + 5;
      if (m.promotion) v += 80;
      if (v > bestVal) { bestVal = v; bestList = [m]; }
      else if (v === bestVal) bestList.push(m);
    }
    const pickFrom = (bestVal > 0 && bestList.length) ? bestList : moves;
    return pickFrom[Math.floor(Math.random() * pickFrom.length)];
  }

  function maybeAiMove() {
    if (mode !== 'ai') return;
    if (game.isGameOver() || game.turn() !== 'b') return;
    busy = true;
    statusEl.textContent = 'هوش مصنوعی فکر می‌کند...';
    setTimeout(() => {
      const m = aiBestMove();
      if (m) game.move(m);
      busy = false;
      render(null);
    }, 500);
  }

  function reset() {
    game = new Chess();
    selected = null;
    busy = false;
    render(null);
  }

  modeButtons.forEach(btn => btn.addEventListener('click', () => {
    modeButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    mode = btn.dataset.mode;
    reset();
  }));
  $('chess-reset').addEventListener('click', reset);
  reset();
})();

// ============================================================
//  جرئت یا حقیقت
// ============================================================
(function initTruthOrDare() {
  const TRUTHS = [
    'آخرین دروغی که گفتی چه بود؟',
    'بزرگ‌ترین ترسی که داری چیه؟',
    'خجالت‌آورترین کاری که تا حالا کردی چیه؟',
    'آرزوی بزرگی که هنوز نگفتی چیه؟',
    'آخرین لحظه‌ای که گریه کردی چه بود؟',
    'عجیب‌ترین عادت روزانه‌ت چیه؟',
    'اگر یک قدرت خاص داشتی چه می‌خواستی؟',
    'بدترین کادویی که تا حالا گرفتی چیه؟',
    'آخرین بار کی حسودی کردی؟',
    'اگر قرار باشد یک هفته جای یک نفر دیگر زندگی کنی، جای چه کسی می‌شوی؟',
    'آخرین چیز احمقانه‌ای که آنلاین خریدی چی بود؟',
    'اگر بتوانی یک لحظه را فراموش کنی، کدام است؟',
    'به‌نظرت بدترین بهانه‌ای که آوردی چی بوده؟',
    'یک راز بچگی‌ات را بگو.',
    'اگر بتوانی شخصیت یک فیلم بشوی، چه کسی؟',
    'آخرین باری که وانمود کردی خوشحالی چه بود؟',
    'اگر صد میلیون تومان جایزه داشته باشی، اولین چیزی که می‌خری چیه؟',
    'دورترین جایی که تا حالا سفر کردی کجاست؟',
    'آخرین چیزی که قبل از خواب به آن فکر می‌کنی چیه؟',
    'بچگی به کدام کارتون علاقه داشتی؟',
    'بهانه‌ای که تا حالا سر یک قرار گفتی؟',
    'اگر همیشه یک آهنگ در سرت بپیچد، کدام آهنگ؟',
    'کدام غذای عجیب را تا حالا خورده‌ای؟',
    'آخرین بار کی یک دوستت را ناراحت کردی؟',
    'احمقانه‌ترین تصمیمی که تا امروز گرفتی چی بود؟',
    'آخرین قولی که دادی و عمل نکردی؟',
    'اگر مشهور بشوی برای چه چیزی دلت تنگ می‌شود؟',
    'چرا اخیراً بیشتر از حد آنلاین هستی؟',
    'بزرگ‌ترین اشتباهت در دوستی‌ها چی بوده؟',
    'چیزی که به پدر و مادرت نمی‌گی چیه؟',
    'بزرگ‌ترین آرزویت چیه؟',
    'بدترین آهنگی که تا حالا گوش داده‌ای چیه؟',
    'اخیراً کی بهت کلی خندیدی؟',
    'به کدام عادت دیگران حساس هستی؟',
    'اگر یک سال سن کم بگیری، چه سالی را انتخاب می‌کنی؟',
    'خجالت‌آورترین اسم مستعار تو چیه؟',
    'اگر بتوانی هر روز با هر کسی چت کنی با کی؟',
    'بهانه‌ای که سر کلاس آوردی؟',
    'آخرین چیزی که در گوشیت مخفی می‌کنی؟'
  ];
  const DARES = [
    '۱۰ بار با صدای یک شخصیت کارتونی حرف بزن.',
    'یک آهنگ را بدون موسیقی با هم‌سرایی بخوان.',
    'تا پایان این دور موقع حرف زدن «ببخشید» نگو.',
    'یک صدای شگفت‌انگیز برای خودت بساز.',
    'چشم‌هایت را ببند و یک دور اتاق را بگرد (با راهنمایی بقیه).',
    'تا یک دقیقه با لهجهٔ دوستت حرف بزن.',
    'یک تبلیغ ۲۰ ثانیه‌ای برای این بازی بساز.',
    'یک رقص خنده‌دار ۳۰ ثانیه‌ای انجام بده.',
    'تا ۳۰ ثانیه بدون خندیدن چشم‌هایت را ببند.',
    'به همه سلام نظامی بده.',
    'به یکی از دوستانت در همین لحظه پیام بده.',
    'تا پایان دور زیر صندلی برو و از آنجا حرف بزن.',
    'یک لحظه خودت را جای مجری تلویزیون بگذار.',
    'جورابت را برعکس پا کن و تا چند دور این‌طور بمان.',
    'یک دور خودت را «دیپلمات» معرفی کن.',
    'نمایشی از یک ربات خراب‌شده بده.',
    'یک خندهٔ مصنوعی بلند بگیر.',
    'یک مکالمهٔ کوتاه با دیوار انجام بده.',
    'شیرجهٔ کاملاً تقلبی بزن (بدون پریدن!).',
    'تا ۲۰ ثانیه فقط با اخم کردن ارتباط برقرار کن.',
    '۱۰ پرنده را در ۱۰ ثانیه نام ببر.',
    'یک حرکت تمرینی عجیب بساز.',
    'با دست چپ بنویس، اگر چپ‌دستی با دست راست.',
    'تا پایان این دور فقط «آره» بگو نه «نه».',
    'یک ادای معروف از سریال ایرانی رو بازی کن.',
    'در قالب خبرنگار، از این اتاق گزارش بده.',
    '۳ داستان ترسناک ولی خنده‌دار بگو.',
    'تقلید صدای یک حیوان عصبانی را بده.',
    'همهٔ برگه‌های روی میز را با یک دست جابه‌جا کن.',
    'تا چند دقیقه بعد از هر جمله «هاها» بگو.',
    'نمایشی خاموش از یک‌سالگی‌ات بده.',
    'یک بوسهٔ هوایی برای همهٔ اتاق بفرست.',
    '۱۰ ثانیه مثل مجسمه بی‌حرکت بایست.',
    'یک اسم بامزه برای خودت بساز و تا آخر بازی همان را بگو.'
  ];

  const modeButtons = document.querySelectorAll('#td-modes .mini-mode');
  const labelEl = $('td-label');
  const textEl = $('td-text');
  const cardEl = $('td-card');
  const CUSTOM_KEY = 'shadow_td_custom_v1';
  let customTruth = [];
  let customDare = [];
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '{}');
    customTruth = Array.isArray(saved.truth) ? saved.truth : [];
    customDare = Array.isArray(saved.dare) ? saved.dare : [];
  } catch (e) { /* دادهٔ نامعتبر → شروع تمیز */ }
  const allTruths = () => TRUTHS.concat(customTruth);
  const allDares = () => DARES.concat(customDare);
  let truthPool = shuffle(allTruths());
  let darePool = shuffle(allDares());

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function draw(kind) {
    const isTruth = kind === 'truth';
    let pool = isTruth ? truthPool : darePool;
    if (pool.length === 0) pool = shuffle((isTruth ? allTruths() : allDares()));
    const item = pool.pop();
    if (isTruth) truthPool = pool; else darePool = pool;
    labelEl.textContent = isTruth ? '🗣 حقیقت' : '😈 جرئت';
    textEl.textContent = item;
    cardEl.classList.remove('flash', 'truth-card', 'dare-card');
    void cardEl.offsetWidth;
    cardEl.classList.add('flash', isTruth ? 'truth-card' : 'dare-card');
  }

  function saveCustom() {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify({ truth: customTruth, dare: customDare })); } catch (e) { }
    updateCustomCount();
  }

  function updateCustomCount() {
    const countEl = $('td-custom-count');
    if (countEl) countEl.textContent = `دلخواه‌های تو: ${customTruth.length} حقیقت · ${customDare.length} جرئت`;
  }

  function addCustom(kind) {
    const input = $('td-custom-input');
    const text = (input && input.value || '').replace(/[<>]/g, '').trim().slice(0, 200);
    if (text.length < 2) {
      if (textEl) textEl.textContent = 'سؤال دلخواه باید حداقل ۲ حرف باشد.';
      return;
    }
    if (kind === 'truth') {
      if (customTruth.length >= 60) customTruth.shift();
      customTruth.push(text);
      $('td-custom-input').value = '';
      saveCustom();
      truthPool = shuffle(allTruths());
      $('td-custom-input').focus();
      textEl.textContent = `«${text}» به حقیقت‌های شما اضافه شد ✅`;
    } else {
      if (customDare.length >= 60) customDare.shift();
      customDare.push(text);
      $('td-custom-input').value = '';
      saveCustom();
      darePool = shuffle(allDares());
      $('td-custom-input').focus();
      textEl.textContent = `«${text}» به جرئت‌های شما اضافه شد ✅`;
    }
  }

  updateCustomCount();

  modeButtons.forEach(btn => btn.addEventListener('click', () => {
    modeButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const isPair = btn.dataset.mode === 'pair';
    labelEl.textContent = isPair ? '👥 جفتی' : '👨‍👩‍👧‍👦 گروهی';
    textEl.textContent = isPair
      ? 'دو نفر بازی می‌کنید؛ به نوبت حقیقت یا جرئت انتخاب کنید.'
      : 'همه دور یک دستگاه می‌نشینید؛ به نوبت حقیقت یا جرئت انتخاب کنید.';
    cardEl.classList.remove('truth-card', 'dare-card');
  }));
  $('td-truth').addEventListener('click', () => draw('truth'));
  $('td-dare').addEventListener('click', () => draw('dare'));
  const addTruthBtn = $('td-add-truth');
  const addDareBtn = $('td-add-dare');
  if (addTruthBtn) addTruthBtn.addEventListener('click', () => addCustom('truth'));
  if (addDareBtn) addDareBtn.addEventListener('click', () => addCustom('dare'));
  const customInput = $('td-custom-input');
  if (customInput) customInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom('truth'); } });
})();

// ============================================================
//  آنلاین — «لابی مینی‌گیم‌ها با کد» (دوز | شطرنج | جرئت یا حقیقت)
// ============================================================
(function initMiniOnline() {
  const byId = (id) => document.getElementById(id);
  const show = (typeof window.showScreen === 'function')
    ? window.showScreen
    : function (name) { document.querySelectorAll('.screen').forEach(el => el.classList.toggle('hide', el.id !== name)); };

  const MG_GAMES = { ttt: 'دوز', chess: 'شطرنج', tod: 'جرئت یا حقیقت' };

  const state = {
    code: null, isHost: false, myId: null, game: 'ttt', picked: 'ttt', players: [],
    tttBoard: Array(9).fill(null), tttTurn: 'X', tttWinner: null, tttSeat: null,
    chess: null, chessColor: null, chessSelected: null, chessGameOver: false,
    tdHolderId: null, tdIdx: 0
  };

  const toastEl = byId('toast');
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  function myName() {
    const el = byId('mg-username');
    const v = el ? el.value.trim() : '';
    return v.length ? v : 'بازیکن';
  }

  function requireNet() {
    if (!window.Net) return false;
    Net.connect();
    state.myId = Net.socket ? Net.socket.id : null;
    return true;
  }

  function setError(msg) {
    const e = byId('mg-error');
    if (e) e.textContent = msg || '';
  }

  function escapeHtml(s) {
    return String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function refreshMyId() { if (window.Net && Net.socket) state.myId = Net.socket.id; }

  byId('btn-mg-create').addEventListener('click', async () => {
    setError('');
    if (!requireNet()) return setError('اتصال به سرور برقرار نشد');
    const res = await Net.mgCreate(myName());
    if (!res || !res.success) setError((res && res.error) || 'خطا در ساخت اتاق');
  });

  byId('btn-mg-join').addEventListener('click', async () => {
    setError('');
    if (!requireNet()) return setError('اتصال به سرور برقرار نشد');
    const code = (byId('mg-join-code') && byId('mg-join-code').value || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return setError('کد اتاق باید ۶ حرف لاتین/عدد باشد');
    const res = await Net.mgJoin(code, myName());
    if (!res || !res.success) setError((res && res.error) || 'خطا در ورود به اتاق');
  });

  function updateTdCounts(t, d) {
    const el = byId('mg-td-custom-count');
    if (el && typeof t === 'number') el.textContent = `دلخواه‌های شما: ${t} حقیقت · ${d} جرئت`;
  }

  function renderRoom(d) {
    refreshMyId();
    state.code = d.code || state.code;
    state.game = d.game || 'ttt';
    state.players = d.players || [];
    state.isHost = !!(d.hostId && d.hostId === state.myId);
    const codeEl = byId('mg-code');
    if (codeEl) codeEl.textContent = state.code || '------';
    const pickedEl = byId('mg-picked');
    if (pickedEl) pickedEl.textContent = (MG_GAMES[state.game] || 'دوز') + ' انتخاب شده';
    document.querySelectorAll('#mg-game-picker .mini-mode').forEach(b => {
      b.classList.toggle('active', b.dataset.game === state.game);
      b.disabled = !state.isHost;
    });
    const list = byId('mg-players');
    if (list) {
      list.innerHTML = '';
      for (const p of state.players) {
        const row = document.createElement('div');
        row.className = 'lobby-player-row';
        row.innerHTML = '<span>' + escapeHtml(p.username) + (p.isHost ? ' <em class="host-tag">میزبان</em>' : '') + '</span>';
        list.appendChild(row);
      }
    }
    const startBtn = byId('mg-start');
    if (startBtn) startBtn.classList.toggle('hide', !state.isHost);
    const hint = byId('mg-hint');
    if (hint) hint.textContent = state.isHost ? 'دوست‌ت با کد وارد می‌شود؛ بازی را انتخاب و بعد شروع کن.' : 'منتظر میزبان بمان تا بازی را انتخاب و شروع کند...';
    updateTdCounts(d.truthCount, d.dareCount);
  }

  const modeBtns = document.querySelectorAll('#mg-game-picker .mini-mode');
  modeBtns.forEach(btn => btn.addEventListener('click', async () => {
    if (!state.isHost) return;
    state.picked = btn.dataset.game;
    const res = await Net.mgPick(btn.dataset.game);
    if (res && res.success === false) toast(res.error || 'خطا در انتخاب بازی');
  }));

  byId('mg-start').addEventListener('click', async () => {
    const res = await Net.mgStart();
    if (res && res.success === false) toast(res.error || 'خطا در شروع بازی');
  });

  byId('mg-leave').addEventListener('click', () => { Net.mgLeave(); show('more-screen'); });

  const copyBtn = byId('mg-copy-code');
  if (copyBtn) copyBtn.addEventListener('click', () => {
    const code = state.code;
    if (!code) return;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).catch(() => {});
    toast('📋 کد کپی شد: ' + code);
  });

  function onGameStarted(d) {
    refreshMyId();
    state.code = d.code || state.code;
    if (d.game === 'ttt') {
      state.tttSeat = (d.roles && d.roles[state.myId]) || null;
      state.tttBoard = Array(9).fill(null);
      state.tttTurn = 'X';
      state.tttWinner = null;
      byId('mg-ttt-again').classList.add('hide');
      renderTtt();
      show('mg-ttt-screen');
    } else if (d.game === 'chess') {
      state.chessColor = (d.roles && d.roles[state.myId]) || null;
      state.chess = new Chess();
      state.chessSelected = null;
      state.chessGameOver = false;
      const infoEl = byId('mg-chess-info');
      if (infoEl) infoEl.textContent = state.chessColor === 'w' ? 'شما سفید هستید (اول شما حرکت می‌کنید)' : 'شما سیاه هستید (حریف سفید اول حرکت می‌کند)';
      byId('mg-chess-again').classList.add('hide');
      renderChess();
      show('mg-chess-screen');
    } else if (d.game === 'tod') {
      state.tdHolderId = d.turn || null;
      state.tdIdx = 0;
      byId('mg-td-turn').textContent = 'نوبت: ' + (d.turnName || '');
      byId('mg-td-text').textContent = 'دارندهٔ نوبت: حقیقت یا جرئت را انتخاب کن';
      byId('mg-td-label').textContent = '🎲';
      updateTdButtons();
      show('mg-td-screen');
    }
  }

  if (window.Net) {
    Net.on('mg_room_updated', (d) => { renderRoom(d); show('mg-room'); });
    Net.on('mg_back_to_room', (d) => { renderRoom(d); show('mg-room'); });
    Net.on('mg_game_started', (d) => onGameStarted(d));
    Net.on('mg_ttt', (d) => onTttState(d));
    Net.on('mg_chess', (d) => onChessState(d));
    Net.on('mg_td_questions', (d) => updateTdCounts(d.truthCount, d.dareCount));
    Net.on('mg_td_card', (d) => onTdCard(d));
    Net.on('mg_td_turn', (d) => onTdTurn(d));
    Net.on('mg_game_over', (d) => { toast((d && d.message) || 'بازی متوقف شد'); show('more-screen'); });
  }

  /* ---------- دوز آنلاین ---------- */
  function renderTtt() {
    const boardEl = byId('mg-ttt-board');
    boardEl.innerHTML = '';
    const myTurn = !!state.tttSeat && !state.tttWinner && state.tttTurn === state.tttSeat;
    for (let i = 0; i < 9; i++) {
      const cell = state.tttBoard[i];
      const b = document.createElement('button');
      b.className = 'ttt-cell' + (cell ? ' filled' : '');
      b.textContent = cell || '';
      b.disabled = !myTurn || !!cell;
      b.addEventListener('click', () => Net.mgTttMove(i));
      boardEl.appendChild(b);
    }
    const s = byId('mg-ttt-status');
    if (state.tttWinner) {
      s.textContent = state.tttWinner === 'draw' ? 'مساوی شد!' : (state.tttWinner === state.tttSeat ? 'شما بردید 🎉' : 'حریفت برد 😈');
      if (state.isHost) byId('mg-ttt-again').classList.remove('hide');
    } else if (state.tttSeat) {
      s.textContent = myTurn ? 'نوبت شما (' + state.tttSeat + ')' : 'نوبت حریف است';
    } else {
      s.textContent = 'در انتظار حریف...';
    }
  }

  function onTttState(d) {
    state.tttBoard = d.board || [];
    state.tttTurn = d.turn;
    state.tttWinner = d.winner;
    renderTtt();
  }

  byId('mg-ttt-again').addEventListener('click', async () => {
    const res = await Net.mgPlayAgain();
    if (res && res.success === false) toast(res.error || 'خطا');
  });
  byId('mg-ttt-leave').addEventListener('click', () => { Net.mgLeave(); show('more-screen'); });

  /* ---------- شطرنج آنلاین ---------- */
  const WHITE_G = { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' };
  const BLACK_G = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

  function boardSquares() {
    if (!state.chess) return [];
    const out = [];
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const cell = state.chess.board()[r][f];
      out.push({ r, f, sq: 'abcdefgh'[f] + (8 - r), cell });
    }
    return out;
  }

  function renderChess() {
    const boardEl = byId('mg-chess-board');
    if (!state.chess) return;
    boardEl.innerHTML = '';
    const myTurn = !state.chessGameOver && state.chess.turn() === state.chessColor;
    const targets = new Set();
    if (state.chessSelected && myTurn) {
      try { state.chess.moves({ square: state.chessSelected, verbose: true }).forEach(mv => targets.add(mv.to)); } catch (e) { }
    }
    for (const item of boardSquares()) {
      const btn = document.createElement('button');
      btn.className = 'chess-square' + ((item.r + item.f) % 2 ? ' dark' : ' light')
        + (state.chessSelected === item.sq ? ' selected' : '')
        + (targets.has(item.sq) ? ' target' : '');
      btn.dataset.sq = item.sq;
      btn.innerHTML = item.cell ? (item.cell.color === 'w' ? WHITE_G[item.cell.type] : BLACK_G[item.cell.type]) : '';
      btn.addEventListener('click', () => onChessCell(item.sq, item.cell));
      boardEl.appendChild(btn);
    }
    const statusEl = byId('mg-chess-status');
    if (state.chessGameOver) {
      statusEl.textContent = chessResult();
      if (state.isHost) byId('mg-chess-again').classList.remove('hide');
    } else {
      statusEl.textContent = myTurn ? 'نوبت شما' : 'نوبت حریف';
    }
  }

  function chessResult() {
    const g = state.chess;
    if (g.isCheckmate()) return 'مات شد! ' + (g.turn() === 'w' ? 'سیاه' : 'سفید') + ' برد 🎉';
    if (g.isStalemate()) return 'رخوت — مساوی شد';
    if (g.isDraw()) return 'مساوی شد';
    return 'پایان بازی';
  }

  function onChessCell(sq, cellData) {
    if (!state.chess || state.chessGameOver) return;
    if (state.chess.turn() !== state.chessColor) return;
    if (state.chessSelected && state.chessSelected !== sq) {
      const mv = state.chess.move({ from: state.chessSelected, to: sq, promotion: 'q' });
      if (mv) {
        Net.mgChessMove(state.chess.fen(), mv.san);
        state.chessSelected = null;
        state.chessGameOver = state.chess.isGameOver();
        renderChess();
        return;
      }
    }
    if (cellData && cellData.color === state.chessColor) {
      state.chessSelected = state.chessSelected === sq ? null : sq;
    } else {
      state.chessSelected = null;
    }
    renderChess();
  }

  function onChessState(d) {
    if (!state.chess) return;
    try { state.chess.load(d.fen); } catch (e) { return; }
    state.chessSelected = null;
    state.chessGameOver = state.chess.isGameOver();
    renderChess();
  }

  byId('mg-chess-again').addEventListener('click', async () => {
    const res = await Net.mgPlayAgain();
    if (res && res.success === false) toast(res.error || 'خطا');
  });
  byId('mg-chess-leave').addEventListener('click', () => { Net.mgLeave(); show('more-screen'); });

  /* ---------- جرئت یا حقیقت آنلاین ---------- */
  function isHolder() { return window.Net && Net.socket && state.tdHolderId === Net.socket.id; }

  function updateTdButtons() {
    const holder = isHolder();
    const truth = byId('mg-td-truth');
    const dare = byId('mg-td-dare');
    const pass = byId('mg-td-pass');
    if (truth) truth.disabled = !holder;
    if (dare) dare.disabled = !holder;
    if (pass) pass.disabled = !(holder || state.isHost);
  }

  function onTdCard(d) {
    const labelEl = byId('mg-td-label');
    const textEl = byId('mg-td-text');
    const cardEl = byId('mg-td-card');
    if (!labelEl || !textEl || !cardEl) return;
    labelEl.textContent = d.kind === 'truth' ? '🗣 حقیقت' : '😈 جرئت';
    textEl.textContent = d.text;
    cardEl.classList.remove('flash', 'truth-card', 'dare-card');
    void cardEl.offsetWidth;
    cardEl.classList.add('flash', d.kind === 'truth' ? 'truth-card' : 'dare-card');
  }

  function onTdTurn(d) {
    state.tdIdx = d.idx;
    state.tdHolderId = d.by;
    const turnEl = byId('mg-td-turn');
    if (turnEl) turnEl.textContent = 'نوبت: ' + (d.byName || '');
    updateTdButtons();
  }

  byId('mg-td-truth').addEventListener('click', () => Net.mgTdDraw('truth'));
  byId('mg-td-dare').addEventListener('click', () => Net.mgTdDraw('dare'));
  byId('mg-td-pass').addEventListener('click', () => Net.mgTdPass());

  async function addOnlineCustom(kind) {
    const input = byId('mg-td-custom-input');
    const text = (input && input.value || '').replace(/[<>]/g, '').trim().slice(0, 200);
    if (text.length < 2) { toast('حداقل ۲ حرف بنویس'); return; }
    const res = await Net.mgTdAdd(kind, text);
    if (res && res.success === false) { toast(res.error || 'خطا در افزودن'); return; }
    input.value = '';
    toast(kind === 'truth' ? '✅ به حقیقت‌ها اضافه شد' : '✅ به جرئت‌ها اضافه شد');
  }

  const addT = byId('mg-td-add-truth');
  const addD = byId('mg-td-add-dare');
  if (addT) addT.addEventListener('click', () => addOnlineCustom('truth'));
  if (addD) addD.addEventListener('click', () => addOnlineCustom('dare'));

  byId('mg-td-leave').addEventListener('click', () => { Net.mgLeave(); show('more-screen'); });
})();
