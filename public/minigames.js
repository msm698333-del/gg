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
  let truthPool = shuffle(TRUTHS.slice());
  let darePool = shuffle(DARES.slice());

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
    if (pool.length === 0) pool = shuffle((isTruth ? TRUTHS : DARES).slice());
    const item = pool.pop();
    if (isTruth) truthPool = pool; else darePool = pool;
    labelEl.textContent = isTruth ? '🗣 حقیقت' : '😈 جرئت';
    textEl.textContent = item;
    cardEl.classList.remove('flash', 'truth-card', 'dare-card');
    void cardEl.offsetWidth;
    cardEl.classList.add('flash', isTruth ? 'truth-card' : 'dare-card');
  }

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
})();
