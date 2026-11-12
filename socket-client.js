// ============================== Socket.IO Client — کلاس اتصال ==============================
class SocketClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.roomCode = null;
    this.playerId = null;
    this.isHost = false;
    this.onConnectionChange = null;
    this.onRoomCreated = null;
    this.onRoomJoined = null;
    this.onPlayerJoined = null;
    this.onPlayerLeft = null;
    this.onPlayerMoved = null;
    this.onChatMessage = null;
    this.onGameStarted = null;
    this.onPlayerList = null;
    this.onError = null;
    this.playSound = null;
  }

  connect() {
    if (this.socket) return;
    const url = window.location.protocol + '//' + window.location.host;
    this.socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 10000
    });

    this.socket.on('connect', () => {
      this.connected = true;
      if (this.onConnectionChange) this.onConnectionChange(true);
    });

    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      if (this.onConnectionChange) this.onConnectionChange(false);
    });

    this.socket.on('connect_error', (err) => {
      this.connected = false;
      if (this.onError) this.onError(err);
    });

    this.socket.on('room_created', (data) => {
      this.roomCode = data.roomCode;
      this.playerId = this.socket.id;
      this.isHost = true;
      if (this.onRoomCreated) this.onRoomCreated(data);
    });

    this.socket.on('room_joined', (data) => {
      this.roomCode = data.roomCode;
      this.playerId = this.socket.id;
      this.isHost = data.hostId === this.socket.id;
      if (this.onRoomJoined) this.onRoomJoined(data);
    });

    this.socket.on('player_joined', (data) => { if (this.onPlayerJoined) this.onPlayerJoined(data); });
    this.socket.on('player_left', (data) => { if (this.onPlayerLeft) this.onPlayerLeft(data); });
    this.socket.on('player_moved', (data) => { if (this.onPlayerMoved) this.onPlayerMoved(data); });
    this.socket.on('chat_message', (data) => { if (this.onChatMessage) this.onChatMessage(data); });
    this.socket.on('game_started', (data) => { if (this.onGameStarted) this.onGameStarted(data); });
    this.socket.on('player_list', (data) => { if (this.onPlayerList) this.onPlayerList(data.players || []); });
  }

  createRoom(username, color) {
    return new Promise((resolve) => {
      this.socket.emit('create_room', { username, color }, (res) => {
        resolve(res || { success: false, error: 'خطای نامشخص' });
      });
    });
  }

  joinRoom(roomCode, username, color) {
    return new Promise((resolve) => {
      this.socket.emit('join_room', { roomCode, username, color }, (res) => {
        resolve(res || { success: false, error: 'خطای نامشخص' });
      });
    });
  }

  movePlayer(x, y, angle) {
    if (!this.socket) return;
    this.socket.emit('player_move', { x, y, angle });
  }

  sendChat(message) {
    if (!this.socket) return;
    this.socket.emit('player_chat', { message });
  }

  startGame() {
    return new Promise((resolve) => {
      this.socket.emit('start_game', {}, (res) => resolve(res || { success: false }));
    });
  }

  leaveRoom() {
    if (this.socket && this.roomCode) {
      this.socket.emit('leave_room');
    }
  }
}

const socketClient = new SocketClient();
window.socketClient = socketClient;
socketClient.connect();