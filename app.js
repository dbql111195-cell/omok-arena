const SIZE = 15;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
const channel = "BroadcastChannel" in window ? new BroadcastChannel("omok-arena-v1") : null;
const seenMessages = new Set();
let socket = null;

const state = {
  id: crypto.randomUUID(),
  name: "",
  roomId: "",
  opponent: null,
  color: null,
  turn: BLACK,
  board: makeBoard(),
  inQueue: false,
  active: false,
  gameOver: false,
  lastMove: null,
  botMode: false,
  waitingRoomCode: "",
};

const $ = (id) => document.getElementById(id);
const els = {
  loginView: $("loginView"),
  lobbyView: $("lobbyView"),
  nickname: $("nickname"),
  loginBtn: $("loginBtn"),
  matchBtn: $("matchBtn"),
  botBtn: $("botBtn"),
  createRoomBtn: $("createRoomBtn"),
  roomCodeInput: $("roomCodeInput"),
  joinRoomBtn: $("joinRoomBtn"),
  shareBox: $("shareBox"),
  shareLink: $("shareLink"),
  copyRoomLinkBtn: $("copyRoomLinkBtn"),
  queueText: $("queueText"),
  playerName: $("playerName"),
  playerId: $("playerId"),
  avatar: $("avatar"),
  gameStatus: $("gameStatus"),
  myStone: $("myStone"),
  turnText: $("turnText"),
  rematchBtn: $("rematchBtn"),
  leaveBtn: $("leaveBtn"),
  roomTitle: $("roomTitle"),
  blackName: $("blackName"),
  whiteName: $("whiteName"),
  board: $("board"),
  overlay: $("overlay"),
  chatLog: $("chatLog"),
  chatForm: $("chatForm"),
  chatInput: $("chatInput"),
  chatBtn: $("chatBtn"),
};

function makeBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
}

function renderBoard() {
  els.board.innerHTML = "";
  const starPoints = new Set(["3,3", "3,11", "7,7", "11,3", "11,11"]);

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.type = "button";
      cell.dataset.row = row;
      cell.dataset.col = col;
      cell.style.setProperty("--row", row);
      cell.style.setProperty("--col", col);
      cell.setAttribute("aria-label", `${row + 1}행 ${col + 1}열`);
      if (starPoints.has(`${row},${col}`)) cell.classList.add("star");
      if (state.lastMove?.row === row && state.lastMove?.col === col) cell.classList.add("last");
      cell.addEventListener("click", () => placeStone(row, col));

      const value = state.board[row][col];
      if (value !== EMPTY) {
        const piece = document.createElement("span");
        piece.className = `piece ${value === BLACK ? "black" : "white"}`;
        cell.appendChild(piece);
      }
      els.board.appendChild(cell);
    }
  }
  positionBoardCells();
}

function positionBoardCells() {
  const width = els.board.clientWidth;
  if (!width) return;
  const pad = Number.parseFloat(getComputedStyle(els.board).getPropertyValue("--board-pad")) || 24;
  const gap = (width - pad * 2) / 14;

  els.board.querySelectorAll(".cell").forEach((cell) => {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    cell.style.left = `${pad + gap * col}px`;
    cell.style.top = `${pad + gap * row}px`;
    cell.style.width = `${gap}px`;
    cell.style.height = `${gap}px`;
  });
}

function render() {
  const loggedIn = Boolean(state.name);
  els.loginView.classList.toggle("hidden", loggedIn);
  els.lobbyView.classList.toggle("hidden", !loggedIn);
  els.playerName.textContent = state.name || "플레이어";
  els.playerId.textContent = loggedIn ? `접속 코드 ${state.id.slice(0, 6)}` : "대기 중";
  els.avatar.textContent = state.name ? state.name.slice(0, 1).toUpperCase() : "?";
  els.myStone.textContent = state.color ? stoneName(state.color) : "-";
  els.turnText.textContent = state.active ? stoneName(state.turn) : "-";
  els.rematchBtn.disabled = !state.active && !state.gameOver;
  els.leaveBtn.disabled = !state.active && !state.inQueue && !state.gameOver;
  els.chatInput.disabled = !state.active;
  els.chatBtn.disabled = !state.active;
  els.matchBtn.disabled = state.inQueue || state.active;
  els.botBtn.disabled = state.inQueue || state.active;
  els.createRoomBtn.disabled = state.inQueue || state.active;
  els.joinRoomBtn.disabled = state.inQueue || state.active;
  els.roomCodeInput.disabled = state.inQueue || state.active;
  els.shareBox.classList.toggle("hidden", !state.waitingRoomCode);

  if (!loggedIn) {
    els.gameStatus.textContent = "로그인이 필요해요";
  } else if (state.inQueue) {
    els.gameStatus.textContent = state.waitingRoomCode ? "친구 기다리는 중" : "상대 찾는 중";
  } else if (state.gameOver) {
    els.gameStatus.textContent = "대국 종료";
  } else if (state.active) {
    els.gameStatus.textContent = isMyTurn() ? "내 차례" : "상대 차례";
  } else {
    els.gameStatus.textContent = "대기실";
  }

  els.queueText.textContent = state.inQueue
    ? state.waitingRoomCode
      ? `방 코드 ${state.waitingRoomCode} 를 친구에게 보내세요.`
      : "새 탭에서 다른 닉네임으로 입장하면 바로 연결돼요."
    : "방 코드는 같은 주소에 접속한 사람끼리 연결됩니다.";
  els.shareLink.value = state.waitingRoomCode ? makeRoomLink(state.waitingRoomCode) : "";
  els.roomTitle.textContent = state.roomId ? `방 ${displayRoomCode(state.roomId)}` : state.waitingRoomCode ? `방 ${state.waitingRoomCode}` : "대기실";
  els.blackName.textContent = state.color === BLACK ? state.name || "흑" : state.opponent?.color === BLACK ? state.opponent.name : "흑";
  els.whiteName.textContent = state.color === WHITE ? state.name || "백" : state.opponent?.color === WHITE ? state.opponent.name : "백";
  els.overlay.classList.toggle("hidden", state.active || state.gameOver);
  renderBoard();
}

function stoneName(value) {
  if (value === BLACK) return "흑";
  if (value === WHITE) return "백";
  return "-";
}

function isMyTurn() {
  return state.active && !state.gameOver && state.turn === state.color;
}

function login() {
  const name = els.nickname.value.trim() || `플레이어${Math.floor(Math.random() * 900 + 100)}`;
  state.name = name.slice(0, 14);
  localStorage.setItem("omokName", state.name);
  addChat("system", `${state.name} 님이 입장했어요.`);
  render();
}

function startQueue() {
  if (!state.name) return;
  state.inQueue = true;
  state.waitingRoomCode = "";
  post({ type: "queue", id: state.id, name: state.name, at: Date.now() });
  addChat("system", "상대를 찾는 중입니다.");
  render();
}

function createRoom() {
  if (!state.name) return;
  const code = makeRoomCode();
  state.inQueue = true;
  state.waitingRoomCode = code;
  state.roomId = `room-${code}`;
  post({ type: "room-wait", id: state.id, name: state.name, roomCode: code });
  addChat("system", `방 ${code} 를 만들었어요.`);
  render();
}

function joinRoom() {
  if (!state.name) return;
  const code = normalizeRoomCode(els.roomCodeInput.value);
  if (!code) {
    addChat("system", "방 코드를 입력해주세요.");
    return;
  }
  state.inQueue = true;
  state.waitingRoomCode = code;
  post({ type: "room-join", id: state.id, name: state.name, roomCode: code });
  addChat("system", `방 ${code} 에 입장 요청을 보냈어요.`);
  render();
}

function startBotGame() {
  const bot = { id: "bot", name: "연습 상대", color: WHITE };
  beginGame({
    roomId: `bot-${Date.now()}`,
    color: BLACK,
    opponent: bot,
    botMode: true,
  });
}

function beginGame({ roomId, color, opponent, board = makeBoard(), turn = BLACK, botMode = false }) {
  state.roomId = roomId;
  state.color = color;
  state.opponent = opponent;
  state.board = board;
  state.turn = turn;
  state.lastMove = null;
  state.active = true;
  state.gameOver = false;
  state.inQueue = false;
  state.botMode = botMode;
  state.waitingRoomCode = "";
  els.overlay.classList.add("hidden");
  addChat("system", `${opponent.name} 님과 대국이 시작됐어요.`);
  render();
}

function placeStone(row, col) {
  if (!isMyTurn() || state.board[row][col] !== EMPTY) return;
  applyMove(row, col, state.color);
  const winner = getWinner(row, col, state.color);
  post({ type: "move", roomId: state.roomId, from: state.id, row, col, color: state.color, winner });
  afterMove(winner, state.color);

  if (!winner && state.botMode) {
    window.setTimeout(botMove, 340);
  }
}

function applyMove(row, col, color) {
  state.board[row][col] = color;
  state.lastMove = { row, col };
  state.turn = color === BLACK ? WHITE : BLACK;
}

function afterMove(winner, color) {
  if (winner) {
    state.active = false;
    state.gameOver = true;
    addChat("system", `${stoneName(color)} 승리!`);
  }
  render();
}

function botMove() {
  if (!state.active || state.turn !== WHITE) return;
  const move = chooseBotMove();
  applyMove(move.row, move.col, WHITE);
  afterMove(getWinner(move.row, move.col, WHITE), WHITE);
}

function chooseBotMove() {
  const candidates = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (state.board[row][col] === EMPTY) {
        candidates.push({ row, col, score: scorePoint(row, col, WHITE) + scorePoint(row, col, BLACK) * 0.85 });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || { row: 7, col: 7 };
}

function scorePoint(row, col, color) {
  const center = 14 - Math.abs(7 - row) - Math.abs(7 - col);
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  return dirs.reduce((sum, [dr, dc]) => {
    const run = countDirection(row, col, dr, dc, color) + countDirection(row, col, -dr, -dc, color);
    return sum + run * run * 8;
  }, center);
}

function countDirection(row, col, dr, dc, color) {
  let count = 0;
  let r = row + dr;
  let c = col + dc;
  while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && state.board[r][c] === color) {
    count += 1;
    r += dr;
    c += dc;
  }
  return count;
}

function getWinner(row, col, color) {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  return dirs.some(([dr, dc]) => 1 + countDirection(row, col, dr, dc, color) + countDirection(row, col, -dr, -dc, color) >= 5);
}

function rematch() {
  if (!state.roomId) return;
  if (state.botMode) {
    startBotGame();
    return;
  }
  state.board = makeBoard();
  state.turn = BLACK;
  state.lastMove = null;
  state.active = true;
  state.gameOver = false;
  post({ type: "rematch", roomId: state.roomId, from: state.id });
  addChat("system", "재대국을 시작했어요.");
  render();
}

function leave() {
  if (state.roomId) post({ type: "leave", roomId: state.roomId, from: state.id });
  resetToLobby("대기실로 돌아왔어요.");
}

function resetToLobby(message) {
  state.roomId = "";
  state.opponent = null;
  state.color = null;
  state.turn = BLACK;
  state.board = makeBoard();
  state.inQueue = false;
  state.active = false;
  state.gameOver = false;
  state.lastMove = null;
  state.botMode = false;
  state.waitingRoomCode = "";
  if (message) addChat("system", message);
  render();
}

function addChat(kind, text, mine = false) {
  const item = document.createElement("div");
  item.className = `chat-message ${mine ? "me" : ""}`;
  item.textContent = kind === "system" ? text : `${kind}: ${text}`;
  els.chatLog.appendChild(item);
  els.chatLog.scrollLeft = els.chatLog.scrollWidth;
}

function sendChat(event) {
  event.preventDefault();
  const text = els.chatInput.value.trim();
  if (!text || !state.active) return;
  els.chatInput.value = "";
  addChat(state.name, text, true);
  post({ type: "chat", roomId: state.roomId, from: state.id, name: state.name, text });
}

function post(payload) {
  const message = { ...payload, messageId: crypto.randomUUID(), sentAt: Date.now() };
  seenMessages.add(message.messageId);
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
  if (channel) {
    channel.postMessage(message);
  }
}

function onMessage(event) {
  const msg = event.data;
  if (msg?.messageId) {
    if (seenMessages.has(msg.messageId)) return;
    seenMessages.add(msg.messageId);
  }
  if (!msg || msg.from === state.id || msg.id === state.id) return;

  if (msg.type === "queue" && state.inQueue && state.name) {
    const roomId = `room-${Math.min(state.id, msg.id).slice(0, 6)}-${Math.max(state.id, msg.id).slice(0, 6)}`;
    state.inQueue = false;
    post({
      type: "match",
      roomId,
      host: state.id,
      guest: msg.id,
      hostName: state.name,
      guestName: msg.name,
    });
    beginGame({
      roomId,
      color: BLACK,
      opponent: { id: msg.id, name: msg.name, color: WHITE },
    });
  }

  if (msg.type === "match" && msg.guest === state.id) {
    beginGame({
      roomId: msg.roomId,
      color: WHITE,
      opponent: { id: msg.host, name: msg.hostName, color: BLACK },
    });
  }

  if (msg.type === "room-join" && state.inQueue && state.waitingRoomCode === msg.roomCode && state.name) {
    const roomId = `room-${msg.roomCode}`;
    post({
      type: "room-match",
      roomId,
      roomCode: msg.roomCode,
      host: state.id,
      guest: msg.id,
      hostName: state.name,
      guestName: msg.name,
    });
    beginGame({
      roomId,
      color: BLACK,
      opponent: { id: msg.id, name: msg.name, color: WHITE },
    });
  }

  if (msg.type === "room-match" && msg.guest === state.id) {
    beginGame({
      roomId: msg.roomId,
      color: WHITE,
      opponent: { id: msg.host, name: msg.hostName, color: BLACK },
    });
  }

  if (msg.roomId !== state.roomId) return;

  if (msg.type === "move") {
    applyMove(msg.row, msg.col, msg.color);
    afterMove(msg.winner, msg.color);
  }

  if (msg.type === "chat") {
    addChat(msg.name, msg.text);
  }

  if (msg.type === "rematch") {
    state.board = makeBoard();
    state.turn = BLACK;
    state.lastMove = null;
    state.active = true;
    state.gameOver = false;
    addChat("system", "상대가 재대국을 시작했어요.");
    render();
  }

  if (msg.type === "leave") {
    resetToLobby("상대가 대국을 나갔어요.");
  }
}

els.loginBtn.addEventListener("click", login);
els.nickname.addEventListener("keydown", (event) => {
  if (event.key === "Enter") login();
});
els.matchBtn.addEventListener("click", startQueue);
els.botBtn.addEventListener("click", startBotGame);
els.createRoomBtn.addEventListener("click", createRoom);
els.joinRoomBtn.addEventListener("click", joinRoom);
els.roomCodeInput.addEventListener("input", () => {
  els.roomCodeInput.value = normalizeRoomCode(els.roomCodeInput.value);
});
els.roomCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinRoom();
});
els.copyRoomLinkBtn.addEventListener("click", copyRoomLink);
els.rematchBtn.addEventListener("click", rematch);
els.leaveBtn.addEventListener("click", leave);
els.chatForm.addEventListener("submit", sendChat);
channel?.addEventListener("message", onMessage);
window.addEventListener("resize", positionBoardCells);
connectSocket();

els.nickname.value = localStorage.getItem("omokName") || "";
els.roomCodeInput.value = normalizeRoomCode(new URLSearchParams(location.search).get("room") || "");
render();

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function normalizeRoomCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function displayRoomCode(roomId) {
  return roomId.replace(/^room-/, "").slice(0, 8);
}

function makeRoomLink(code) {
  const url = new URL(location.href);
  url.searchParams.set("room", code);
  return url.href;
}

async function copyRoomLink() {
  const link = els.shareLink.value;
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    addChat("system", "초대 링크를 복사했어요.");
  } catch {
    els.shareLink.select();
    addChat("system", "링크를 선택해뒀어요. 복사해서 보내주세요.");
  }
}

function connectSocket() {
  if (!["http:", "https:"].includes(location.protocol) || !("WebSocket" in window)) return;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}`);
  socket.addEventListener("message", (event) => {
    try {
      onMessage({ data: JSON.parse(event.data) });
    } catch {
      addChat("system", "서버 메시지를 읽지 못했어요.");
    }
  });
  socket.addEventListener("open", () => {
    addChat("system", "온라인 연결이 준비됐어요.");
  });
  socket.addEventListener("close", () => {
    if (location.protocol !== "file:") addChat("system", "온라인 연결이 끊겼어요. 새로고침하면 다시 연결됩니다.");
  });
}
