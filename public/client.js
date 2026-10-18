const $ = (id) => document.getElementById(id);
const screens = ['homeScreen', 'lobbyScreen', 'gameScreen', 'resultsScreen'];
const state = { ws: null, connected: false, playerId: localStorage.getItem('auctionPlayerId') || null, roomCode: null, room: null, chosenLot: null, hasSubmittedBid: false, toastTimer: null, reconnectTimer: null };

const ITEM_SYMBOLS = {
  'pocket-watch': '◷', 'sea-compass': '⌖', telescope: '⌕', 'pocket-mirror': '◉', 'ornate-key': '⚿', 'film-camera': '▣',
  'porcelain-figurine': '♟', 'golden-cup': '♜', 'bronze-statue': '♞', 'framed-painting': '▧', 'crystal-vase': '♢', 'silver-candlestick': '♜',
  'music-box': '♫', 'antique-lamp': '◉', 'ship-in-bottle': '♧', 'old-book': '▤', 'vinyl-record': '◉', 'postcard-set': '▧', 'old-map': '⌖',
  'coin-collection': '◎', 'postage-stamp': '▦', 'engraved-medal': '◎', 'porcelain-cup': '◡', binoculars: '⊙', 'golden-pen': '✎', 'wooden-box': '▣',
  'perfume-bottle': '♧', 'chess-set': '♟', gemstone: '◇', gramophone: '◖'
};
const money = (n) => `${Math.round(n).toLocaleString('ru-RU')} ₵`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function showScreen(id) { screens.forEach((s) => $(s).classList.toggle('hidden', s !== id)); }
function toast(message) {
  const el = $('toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function setConnection(connected, label) {
  state.connected = connected;
  $('connectionLabel').textContent = label;
  $('connectionLabel').parentElement.classList.toggle('connected', connected);
}

function syncFullscreenButton() {
  const isFullscreen = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  const label = $('fullscreenLabel');
  const button = $('fullscreenBtn');
  if (!label || !button) return;
  label.textContent = isFullscreen ? 'Свернуть' : 'Во весь экран';
  button.setAttribute('aria-label', isFullscreen ? 'Выйти из полноэкранного режима' : 'Включить полноэкранный режим');
  button.title = isFullscreen ? 'Выйти из полноэкранного режима' : 'Во весь экран';
  button.classList.toggle('is-active', isFullscreen);
}

async function requestFullscreenFromGesture() {
  if (document.fullscreenElement || document.webkitFullscreenElement) return true;
  try {
    const root = document.documentElement;
    if (root.requestFullscreen) {
      await root.requestFullscreen({ navigationUI: 'hide' });
      syncFullscreenButton();
      return true;
    }
    if (root.webkitRequestFullscreen) {
      root.webkitRequestFullscreen();
      syncFullscreenButton();
      return true;
    }
  } catch { /* Fullscreen is optional; some browsers restrict it or do not support it. */ }
  return false;
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } else {
      const entered = await requestFullscreenFromGesture();
      if (!entered) toast('Этот браузер не разрешил полный экран. Попробуй открыть игру через меню браузера.');
    }
  } catch {
    toast('Не удалось включить полный экран в этом браузере.');
  }
  syncFullscreenButton();
}

document.addEventListener('fullscreenchange', syncFullscreenButton);
document.addEventListener('webkitfullscreenchange', syncFullscreenButton);
function makeSocket() {
  if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) return state.ws;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);
  state.ws = ws;
  setConnection(false, 'Подключение к серверу');
  ws.addEventListener('open', () => setConnection(true, 'Сервер подключён'));
  ws.addEventListener('message', (event) => {
    let message; try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'identity') {
      state.playerId = message.playerId; state.roomCode = message.roomCode;
      localStorage.setItem('auctionPlayerId', state.playerId);
      sessionStorage.setItem('auctionRoomCode', state.roomCode);
      if (message.resumed) toast('Подключение к комнате восстановлено');
      return;
    }
    if (message.type === 'state') { state.room = message.state; renderState(); return; }
    if (message.type === 'error') toast(message.message || 'Произошла ошибка');
    if (message.type === 'pong') return;
  });
  ws.addEventListener('close', () => {
    setConnection(false, 'Нет соединения');
    if (state.roomCode) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = setTimeout(() => reconnectToRoom(), 1800);
    }
  });
  ws.addEventListener('error', () => setConnection(false, 'Ошибка соединения'));
  return ws;
}
function send(type, data = {}) {
  const ws = makeSocket();
  const transmit = () => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...data })); };
  if (ws.readyState === WebSocket.OPEN) transmit(); else ws.addEventListener('open', transmit, { once: true });
}
function getName() {
  const name = $('playerName').value.trim().slice(0, 18);
  if (!name) { $('playerName').focus(); toast('Сначала введи имя игрока'); return null; }
  localStorage.setItem('auctionPlayerName', name); return name;
}
function reconnectToRoom() {
  if (!state.roomCode || !state.playerId) return;
  const ws = makeSocket();
  const join = () => ws.send(JSON.stringify({ type: 'joinRoom', code: state.roomCode, name: localStorage.getItem('auctionPlayerName') || 'Игрок', playerId: state.playerId }));
  if (ws.readyState === WebSocket.OPEN) join(); else ws.addEventListener('open', join, { once: true });
}
function createRoom() {
  const name = getName(); if (!name) return;
  requestFullscreenFromGesture();
  const ws = makeSocket();
  const create = () => ws.send(JSON.stringify({ type: 'createRoom', name, playerId: state.playerId }));
  if (ws.readyState === WebSocket.OPEN) create(); else ws.addEventListener('open', create, { once: true });
}
function joinRoom() {
  const name = getName(); if (!name) return;
  requestFullscreenFromGesture();
  const code = $('roomCode').value.trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) { toast('Введи корректный код из 5 символов'); $('roomCode').focus(); return; }
  state.roomCode = code;
  const ws = makeSocket();
  const join = () => ws.send(JSON.stringify({ type: 'joinRoom', code, name, playerId: state.playerId }));
  if (ws.readyState === WebSocket.OPEN) join(); else ws.addEventListener('open', join, { once: true });
}
function renderState() {
  const room = state.room; if (!room) return;
  state.roomCode = room.code;
  $('roomCodeDisplay').textContent = room.code;
  $('playerCount').textContent = room.players.length;
  $('readyCount').textContent = `${room.players.filter(p => p.ready).length} / ${room.players.length} готовы`;
  $('playerList').innerHTML = room.players.map((p, i) => `<div class="player-row"><div class="player-avatar">${esc((p.name || '?').slice(0,1).toUpperCase())}</div><div class="player-info"><strong>${esc(p.name)}${p.id === state.playerId ? ' (ты)' : ''}</strong><span>${p.isHost ? 'Создатель комнаты' : (p.online ? 'В игре' : 'Переподключение…')}</span></div><div class="player-status ${p.ready ? 'ready' : ''}">${p.ready ? '✓ Готов' : 'Ожидает'}</div></div>`).join('');
  const own = room.players.find(p => p.id === state.playerId);
  $('readyBtn').disabled = !own || room.phase !== 'lobby';
  $('readyBtn').querySelector('span:first-child').textContent = own?.ready ? 'Не готов' : 'Я готов';
  $('readyBtn').querySelector('.btn-icon').textContent = own?.ready ? '↺' : '✓';
  const canStart = Boolean(own?.isHost && room.players.length >= 3 && room.players.every(p => p.ready) && room.phase === 'lobby');
  $('startMatchBtn').classList.toggle('hidden', !own?.isHost);
  $('startMatchBtn').disabled = !canStart;
  $('hostHint').textContent = own?.isHost ? 'Ты создатель комнаты. Начать матч можно, когда все нажмут «Готов».' : 'Ждём запуска от создателя комнаты. Для старта нужны 3–6 игроков и готовность всех участников.';
  $('waitHint').textContent = room.players.length < 3 ? `Нужно ещё ${3 - room.players.length} игрок${3 - room.players.length === 1 ? '' : 'а'} для старта.` : room.players.every(p => p.ready) ? 'Все готовы. Создатель может запускать матч.' : 'Лобби собрано. Нажмите «Готов», чтобы начать.';
  if (room.phase === 'lobby') { showScreen('lobbyScreen'); return; }
  if (room.phase === 'choosing' || room.phase === 'revealing') { showScreen('gameScreen'); renderGame(); return; }
  if (room.phase === 'results') { showScreen('resultsScreen'); renderResults(); }
}
function renderGame() {
  const room = state.room; const own = room.players.find(p => p.id === state.playerId);
  if (!own) return;
  $('roundNumber').textContent = String(room.round).padStart(2, '0');
  $('phaseLabel').textContent = `РАУНД ${room.round} / ${room.totalRounds}`;
  $('balanceLabel').textContent = `Баланс: ${money(own.cash)}`;
  $('inventoryLabel').textContent = `Коллекция: ${own.itemCount}`;
  $('inventoryCount').textContent = `${own.itemCount} предметов`;
  $('inventoryList').innerHTML = room.myInventory?.length ? room.myInventory.map(item => `<div class="inventory-chip"><span class="chip-symbol">${ITEM_SYMBOLS[item.itemId] || '◇'}</span><div><strong>${esc(item.name)}</strong><span>Куплен за ${money(item.purchasePrice)} · оценка ${money(item.marketValue)}</span></div></div>`).join('') : '<div class="inventory-empty">Пока нет предметов. Выиграй первый лот.</div>';
  const choosing = room.phase === 'choosing';
  $('gameTitle').textContent = choosing ? (room.myChoice ? 'СТАВКА ПРИНЯТА.' : 'ВЫБЕРИ СВОЙ ЛОТ.') : 'СТАВКИ ОТКРЫТЫ.';
  $('gameInstruction').textContent = choosing ? (room.myChoice ? `Твоя ставка принята. Ждём остальных игроков (${room.choicesSubmitted} / ${room.players.filter(p => p.online).length}).` : 'Выбери один лот и укажи ставку. Ставки скрыты до завершения раунда; каждый игрок может выиграть максимум один лот за раунд.') : 'Раунд завершён. Победители ставок получили предметы в коллекцию.';
  $('lotGrid').innerHTML = room.currentLots.map((lot, i) => {
    const selected = state.chosenLot === lot.lotId;
    const feature = lot.feature ? `<div class="feature-tag ${lot.feature.delta < 0 ? 'negative' : ''}">${esc(lot.feature.name)} · ${lot.feature.delta > 0 ? '+' : ''}${lot.feature.delta}</div>` : '<div class="feature-tag" style="background:rgba(255,255,255,.04);color:#8390a4">Без особенностей</div>';
    return `<button class="lot-card ${selected ? 'selected' : ''}" data-lot-id="${esc(lot.lotId)}" ${(!choosing || room.myChoice) ? 'disabled' : ''}><div class="lot-art"><span class="lot-number">ЛОТ 0${i+1}</span><span class="lot-symbol">${ITEM_SYMBOLS[lot.itemId] || '◇'}</span></div><div class="lot-body"><div class="lot-name">${esc(lot.name)}</div><div class="lot-description">${esc(lot.description)}</div>${feature}<div class="lot-price-row"><span>СТАРТОВАЯ ЦЕНА</span><strong>${money(lot.startPrice)}</strong></div></div></button>`;
  }).join('');
  $('lotGrid').querySelectorAll('.lot-card').forEach(button => button.addEventListener('click', () => {
    if (room.myChoice || room.phase !== 'choosing') return;
    state.chosenLot = button.dataset.lotId;
    const lot = room.currentLots.find(l => l.lotId === state.chosenLot);
    $('bidAmount').min = lot.startPrice; $('bidAmount').max = own.cash; $('bidAmount').value = Math.min(own.cash, lot.startPrice);
    $('minimumBidLabel').textContent = `Минимум: ${money(lot.startPrice)}`;
    $('bidPanel').classList.remove('hidden');
    $('lotGrid').querySelectorAll('.lot-card').forEach(card => card.classList.toggle('selected', card === button));
    $('bidStatus').textContent = `Укажи ставку от ${money(lot.startPrice)} до ${money(own.cash)}. Если твою ставку перебьют, предмет достанется сопернику.`;
    $('bidAmount').focus();
  }));
  if (choosing && !room.myChoice) {
    $('bidPanel').classList.toggle('hidden', !state.chosenLot);
    $('submitBidBtn').disabled = !state.chosenLot;
    $('revealPanel').classList.add('hidden');
  } else {
    $('bidPanel').classList.add('hidden');
  }
  if (!choosing) renderRoundOutcome(room.lastOutcome);
  renderInventoryFromOutcome(room);
}
function renderInventoryFromOutcome(room) {
  const ownId = state.playerId;
  const itemRecords = [];
  for (const round of (room.history || [])) for (const item of (round.items || [])) if (item.playerId === ownId) itemRecords.push(item);
  if (itemRecords.length) {
    $('inventoryList').innerHTML = itemRecords.map(item => `<div class="inventory-chip"><span class="chip-symbol">${ITEM_SYMBOLS[item.itemId] || '◇'}</span><div><strong>${esc(item.name)}</strong><span>Куплен за ${money(item.purchasePrice)} · оценка ${money(item.marketValue)}</span></div></div>`).join('');
  }
}
function renderRoundOutcome(outcome) {
  $('revealPanel').classList.remove('hidden');
  $('roundOutcomeLabel').textContent = outcome?.message || 'Раунд закрыт';
  const winners = outcome?.winners || [];
  const losers = outcome?.losers || [];
  const rows = [
    ...winners.map(w => `<div class="outcome-row"><strong>✓ ${esc(w.playerName)} — ${esc(w.lotName)}</strong><span>Ставка ${money(w.bid)} · оценка ${money(w.marketValue)}</span></div>`),
    ...losers.map(l => `<div class="outcome-row"><strong>— ${esc(l.playerName)} — ${esc(l.lotName)}</strong><span>Ставка ${money(l.bid)} · не выиграл</span></div>`)
  ];
  $('roundOutcomeList').innerHTML = rows.length ? rows.join('') : '<div class="inventory-empty">Нет выигранных лотов в этом раунде.</div>';
}
function renderResults() {
  const results = state.room.results || [];
  const winner = results[0];
  if (!winner) return;
  $('winnerBanner').innerHTML = `<div><small>ПОБЕДИТЕЛЬ МАТЧА</small><h3>${esc(winner.name)}</h3></div><div class="winner-profit">${winner.netProfit >= 0 ? '+' : ''}${money(winner.netProfit)}</div>`;
  $('resultsList').innerHTML = results.map((p, i) => `<div class="result-row ${p.winner ? 'winner' : ''}"><div class="result-rank">${String(i + 1).padStart(2, '0')}</div><div class="result-player"><strong>${esc(p.name)}${p.playerId === state.playerId ? ' (ты)' : ''}</strong><span>${p.items.length} предметов · потрачено ${money(p.spent)}</span></div><div class="result-metric"><span>ПРОДАЖИ</span><strong>${money(p.revenue)}</strong></div><div class="result-metric profit"><span>ПРИБЫЛЬ</span><strong>${p.netProfit >= 0 ? '+' : ''}${money(p.netProfit)}</strong></div></div>`).join('');
  const own = state.room.players.find(p => p.id === state.playerId);
  $('nextMatchBtn').classList.toggle('hidden', !own?.isHost);
  $('backToHomeBtn').textContent = own?.isHost ? 'Вернуться в лобби' : 'Остаться в комнате';
}

$('createRoomBtn').addEventListener('click', createRoom);
$('joinRoomBtn').addEventListener('click', joinRoom);
$('fullscreenBtn').addEventListener('click', toggleFullscreen);
$('roomCode').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0,5); });
$('roomCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
$('playerName').value = localStorage.getItem('auctionPlayerName') || '';
$('readyBtn').addEventListener('click', () => send('ready'));
$('startMatchBtn').addEventListener('click', () => send('start'));
$('leaveRoomBtn').addEventListener('click', () => { state.roomCode = null; state.room = null; state.chosenLot = null; sessionStorage.removeItem('auctionRoomCode'); if (state.ws) { state.ws.close(); state.ws = null; } showScreen('homeScreen'); setConnection(false, 'Не в комнате'); });
$('copyCodeBtn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(state.roomCode || $('roomCodeDisplay').textContent); toast('Код скопирован'); }
  catch { toast(`Код комнаты: ${state.roomCode || $('roomCodeDisplay').textContent}`); }
});
$('submitBidBtn').addEventListener('click', () => {
  if (!state.chosenLot) { toast('Сначала выбери лот'); return; }
  const bid = Number($('bidAmount').value);
  const lot = state.room?.currentLots.find(l => l.lotId === state.chosenLot);
  if (!lot || !Number.isInteger(bid) || bid < lot.startPrice) { toast(`Минимальная ставка — ${lot?.startPrice ?? 300} монет`); return; }
  const own = state.room.players.find(p => p.id === state.playerId);
  if (!own || bid > own.cash) { toast('Недостаточно денег для такой ставки'); return; }
  send('bid', { lotId: state.chosenLot, bid });
  $('submitBidBtn').disabled = true;
  $('bidStatus').textContent = 'Ставка отправлена и скрыта от других игроков.';
});
$('nextMatchBtn').addEventListener('click', () => send('nextMatch'));
$('backToHomeBtn').addEventListener('click', () => {
  if (state.room?.phase === 'results') { state.roomCode = state.room.code; state.room = null; showScreen('lobbyScreen'); toast('Нажми «Сыграть ещё раз» у создателя комнаты.'); }
});

setConnection(false, 'Подключение');
syncFullscreenButton();
// Rejoin a room after refresh when a room code was saved in this browser.
const savedCode = sessionStorage.getItem('auctionRoomCode');
if (savedCode && state.playerId) {
  state.roomCode = savedCode;
  const ws = makeSocket();
  const join = () => ws.send(JSON.stringify({ type: 'joinRoom', code: savedCode, name: localStorage.getItem('auctionPlayerName') || 'Игрок', playerId: state.playerId }));
  if (ws.readyState === WebSocket.OPEN) join(); else ws.addEventListener('open', join, { once: true });
} else {
  // Open a lightweight connection so the landing screen reflects server availability.
  makeSocket();
}
setInterval(() => { if (state.ws?.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify({ type: 'ping' })); }, 25000);
