// ============================================================
//  Net — ارتباط Socket.IO بین کلاینت و سرور بازی «سایهٔ خندان»
// ============================================================
window.Net = (() => {
  let socket = null;
  const cb = {}; // callback registry: event -> handler

  function connect() {
    if (socket && socket.connected) return socket;
    socket = io('/', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    socket.on('connect', () => cb.connect && cb.connect());
    socket.on('disconnect', () => cb.disconnect && cb.disconnect());
    socket.on('connect_error', (err) => cb.error && cb.error('اتصال به سرور برقرار نشد: ' + err.message));

    socket.on('room_created', (data) => cb.room && cb.room(data));
    socket.on('room_joined', (data) => cb.room && cb.room(data));
    socket.on('player_joined', (data) => cb.playerJoined && cb.playerJoined(data));
    socket.on('player_left', (data) => cb.playerLeft && cb.playerLeft(data));
    socket.on('player_list', (data) => cb.playerList && cb.playerList(data));

    socket.on('game_started', (data) => cb.gameStarted && cb.gameStarted(data));
    socket.on('player_moved', (data) => cb.playerMoved && cb.playerMoved(data));
    socket.on('flashlight_toggle', (data) => cb.flashlight && cb.flashlight(data));

    socket.on('key_collected', (data) => cb.keyCollected && cb.keyCollected(data));
    socket.on('farzad_enraged', (data) => cb.farzadEnraged && cb.farzadEnraged(data));
    socket.on('farzad_stunned', (data) => cb.farzadStunned && cb.farzadStunned(data));
    socket.on('game_over', (data) => cb.gameOver && cb.gameOver(data));

    socket.on('chat_message', (data) => cb.chat && cb.chat(data));

    socket.on('mg_room_updated', (data) => cb.mgRoomUpdated && cb.mgRoomUpdated(data));
    socket.on('mg_game_started', (data) => cb.mgGameStarted && cb.mgGameStarted(data));
    socket.on('mg_ttt', (data) => cb.mgTtt && cb.mgTtt(data));
    socket.on('mg_chess', (data) => cb.mgChess && cb.mgChess(data));
    socket.on('mg_td_questions', (data) => cb.mgTdQuestions && cb.mgTdQuestions(data));
    socket.on('mg_td_card', (data) => cb.mgTdCard && cb.mgTdCard(data));
    socket.on('mg_td_turn', (data) => cb.mgTdTurn && cb.mgTdTurn(data));
    socket.on('mg_game_over', (data) => cb.mgGameOver && cb.mgGameOver(data));
    socket.on('mg_back_to_room', (data) => cb.mgBackToRoom && cb.mgBackToRoom(data));

    return socket;
  }

  function emit(name, payload, callback) {
    if (!socket) connect();
    if (callback) socket.emit(name, payload, callback);
    else socket.emit(name, payload);
  }

  return {
    connect,
    on(event, handler) { cb[event] = handler; },
    createRoom(mode, username) {
      return new Promise(resolve => emit('create_room', { mode, username }, resolve));
    },
    joinRoom(roomCode, username) {
      return new Promise(resolve => emit('join_room', { roomCode, username }, resolve));
    },
    startGame() {
      return new Promise(resolve => emit('start_game', {}, resolve));
    },
    sendMove(x, y, angle) { emit('player_move', { x, y, angle }); },
    sendFlashToggle(on) { emit('flashlight_toggle', { on }); },
    sendKeyCollected(keyIndex) {
      return new Promise(resolve => emit('key_collected', { keyIndex }, resolve));
    },
    sendQuizWrong() { emit('quiz_wrong', {}); },
    sendFlashBurst() {
      return new Promise(resolve => emit('flash_burst', {}, resolve));
    },
    sendReachedExit() { emit('reached_exit', {}); },
    sendChat(message) { emit('player_chat', { message }); },
    leaveRoom() { emit('leave_room', {}); },
    // ============================== مینی‌گیم‌ها ==============================
    mgCreate(username) {
      return new Promise(resolve => emit('mg_create', { username }, resolve));
    },
    mgJoin(code, username) {
      return new Promise(resolve => emit('mg_join', { code, username }, resolve));
    },
    mgPick(game) {
      return new Promise(resolve => emit('mg_pick', { game }, resolve));
    },
    mgStart() {
      return new Promise(resolve => emit('mg_start', {}, resolve));
    },
    mgLeave() { emit('mg_leave', {}); },
    mgTttMove(cell) { emit('mg_ttt_move', { cell }); },
    mgChessMove(fen, san) { emit('mg_chess_move', { fen, san }); },
    mgTdAdd(kind, text) {
      return new Promise(resolve => emit('mg_td_add', { kind, text }, resolve));
    },
    mgTdDraw(kind) { emit('mg_td_draw', { kind }); },
    mgTdPass() { emit('mg_td_pass', {}); },
    mgPlayAgain() {
      return new Promise(resolve => emit('mg_play_again', {}, resolve));
    },
    get socket() { return socket; }
  };
})();
