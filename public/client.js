const $ = (id) => document.getElementById(id);
const screens = ['homeScreen', 'lobbyScreen', 'gameScreen', 'resultsScreen'];
const state = { ws: null, connected: false, playerId: localStorage.getItem('auctionPlayerId') || null, roomCode: null, room: null, chosenLot: null, lastBidLotId: null, hasSubmittedBid: false, toastTimer: null, reconnectTimer: null, stageAnimationKey: null, lastRenderedRound: null };

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

function startIntroAnimation() {
  const intro = $('introScreen');
  if (!intro) return;
  let finished = false;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let timer;
  const dismiss = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    intro.classList.add('is-leaving');
    const cleanup = () => intro.classList.add('is-gone');
    intro.addEventListener('transitionend', cleanup, { once: true });
    window.setTimeout(cleanup, reducedMotion ? 30 : 850);
  };
  $('skipIntroBtn')?.addEventListener('click', dismiss, { once: true });
  timer = window.setTimeout(dismiss, reducedMotion ? 850 : 3300);
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
      else if (message.practice) toast('Тестовый матч запущен. Боты делают ставки автоматически.');
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
function startPractice() {
  const name = getName(); if (!name) return;
  requestFullscreenFromGesture();
  state.chosenLot = null;
  const botCount = Number($('botCount').value);
  const ws = makeSocket();
  const create = () => ws.send(JSON.stringify({ type: 'createPracticeRoom', name, playerId: state.playerId, botCount }));
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
  $('playerList').innerHTML = room.players.map((p) => `<div class="player-row"><div class="player-avatar"><img src="/characters/${esc(p.characterId || 'collector')}.svg" alt=""></div><div class="player-info"><strong>${esc(p.name)}${p.id === state.playerId ? ' (ты)' : ''}</strong><span>${esc(p.characterName || 'Коллекционер')}${p.isBot ? ` · бот: ${esc(p.botStyle || 'ИИ')}` : p.isHost ? ' · создатель' : ''}</span></div><div class="player-status ${p.ready ? 'ready' : ''}">${p.ready ? '✓ Готов' : 'Ожидает'}</div></div>`).join('');
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
  if (room.phase === 'sellerChoosing' || room.phase === 'choosing' || room.phase === 'revealing') { showScreen('gameScreen'); renderGame(); return; }
  if (room.phase === 'results') { showScreen('resultsScreen'); renderResults(); }
}
function renderPlayerRail(players, room, side) {
  const root = side === 'left' ? $('leftPlayers') : $('rightPlayers');
  root.innerHTML = players.map((p) => {
    const seller = p.id === room.sellerId;
    const status = seller
      ? (room.phase === 'sellerChoosing' ? 'ВЫБИРАЕТ ЛОТ' : 'ПРОДАВЕЦ')
      : p.submitted ? 'СТАВКА ГОТОВА' : p.id === state.playerId ? 'ТЫ' : 'В ИГРЕ';
    return `<div class="side-player ${seller ? 'is-seller' : ''} ${p.id === state.playerId ? 'is-you' : ''}">
      <div class="side-player-portrait"><img src="/characters/${esc(p.characterId || 'collector')}.svg" alt=""></div>
      <div class="side-player-name">${esc(p.id === state.playerId ? 'Ты' : p.name)}</div>
      <div class="side-player-cash">${money(p.cash)}</div>
      <div class="side-player-status">${status}</div>
    </div>`;
  }).join('');
}

function renderSellerStage(room, own) {
  const seller = room.players.find((p) => p.id === room.sellerId) || own;
  const isSeller = seller.id === state.playerId;
  const selecting = room.phase === 'sellerChoosing';
  const lot = selecting
    ? (isSeller ? room.currentLots.find((item) => item.lotId === state.chosenLot) || null : null)
    : room.currentLots[0] || null;
  const stage = $('sellerStage');
  const sellerIndex = room.players.findIndex((p) => p.id === seller.id);
  const splitAt = Math.ceil(room.players.length / 2);
  const enterFrom = sellerIndex < splitAt ? 'seller-from-left' : 'seller-from-right';
  const key = `${room.round}:${seller.id}`;
  const animate = state.stageAnimationKey !== key;
  if (animate) {
    state.stageAnimationKey = key;
    stage.classList.remove('seller-enter', 'seller-from-left', 'seller-from-right');
    stage.classList.add('seller-pre-enter', enterFrom);
  }
  const lotMarkup = lot ? `
    <div class="seller-item-overlay">
      <div class="seller-item-symbol">${ITEM_SYMBOLS[lot.itemId] || '◇'}</div>
      <div class="seller-item-details"><strong>${esc(lot.name)}</strong><span>Стартовая цена: ${money(lot.startPrice)}</span></div>
    </div>` : `
    <div class="seller-select-placeholder">
      <strong>${isSeller ? 'ТРИ ПРЕДМЕТА НА ВЫБОР' : 'ПРОДАВЕЦ ГОТОВИТ ЛОТ'}</strong>
      <span>${isSeller ? 'Выбери один предмет ниже и выставь его на торги.' : `${esc(seller.name)} выбирает, какой предмет выставить.`}</span>
    </div>`;
  stage.innerHTML = `
    <div class="seller-enter-label">${selecting ? (isSeller ? 'ТВОЙ ХОД — ВЫБЕРИ ПРЕДМЕТ' : 'ПОДГОТОВКА К ТОРГАМ') : 'ЛОТ НА ТОРГАХ'}</div>
    <div class="seller-portrait-wrap"><img class="seller-avatar" src="/characters/${esc(seller.characterId || 'collector')}.svg" alt="${esc(seller.characterName || 'Персонаж')}"></div>
    ${lotMarkup}
    <div class="seller-caption"><strong>${esc(seller.name)}${seller.id === state.playerId ? ' · ТЫ' : ''}</strong><span>${esc(seller.characterName || 'Продавец')} · ${selecting ? (isSeller ? 'тебе предоставлены три предмета' : 'выбирает один из трёх предметов') : 'продаёт выбранный предмет'}</span></div>`;
  if (animate) requestAnimationFrame(() => {
    stage.classList.remove('seller-pre-enter');
    stage.classList.add('seller-enter');
  });
}

function renderGame() {
  const room = state.room;
  const own = room.players.find((p) => p.id === state.playerId);
  if (!own) return;

  if (state.lastRenderedRound !== room.round) {
    state.chosenLot = null;
    state.lastBidLotId = null;
    state.lastRenderedRound = room.round;
  }
  $('modeBadge').classList.toggle('hidden', room.mode !== 'practice');
  $('roundNumber').textContent = String(room.round).padStart(2, '0');
  $('phaseLabel').textContent = `РАУНД ${room.round} / ${room.totalRounds}`;
  $('balanceLabel').textContent = `Баланс: ${money(own.cash)}`;
  $('inventoryLabel').textContent = `Коллекция: ${own.itemCount}`;

  const isSeller = own.id === room.sellerId;
  const selecting = room.phase === 'sellerChoosing';
  const waitingForSeller = selecting && !isSeller;
  const sellerPicking = selecting && isSeller;
  const bidding = room.phase === 'choosing';
  const lot = room.currentLots[0] || null;

  const splitAt = Math.ceil(room.players.length / 2);
  renderPlayerRail(room.players.slice(0, splitAt), room, 'left');
  renderPlayerRail(room.players.slice(splitAt), room, 'right');
  renderSellerStage(room, own);

  $('sellerPrompt').textContent = selecting
    ? (isSeller ? 'Выбери один предмет и выставь его' : `${room.players.find(p => p.id === room.sellerId)?.name || 'Продавец'} выбирает предмет`)
    : bidding ? (isSeller ? 'Ты выставил лот — ждём покупателя' : 'Кто предложит больше?')
    : 'Ставки раскрыты';
  $('inventoryCount').textContent = `${own.itemCount} предметов`;
  $('inventoryList').innerHTML = room.myInventory?.length ? room.myInventory.map(item => `<div class="inventory-chip"><span class="chip-symbol">${ITEM_SYMBOLS[item.itemId] || '◇'}</span><div><strong>${esc(item.name)}</strong><span>${item.unsold ? 'Не продан · будет оценён в конце матча' : `Куплен за ${money(item.purchasePrice)} · оценка ${money(item.marketValue)}`}</span></div></div>`).join('') : '<div class="inventory-empty">Пока нет предметов. Выиграй первый лот.</div>';

  $('gameTitle').textContent = selecting
    ? (isSeller ? 'ВЫБЕРИ ПРЕДМЕТ ДЛЯ ПРОДАЖИ' : 'ПРОДАВЕЦ ВЫБИРАЕТ ЛОТ')
    : bidding ? (isSeller ? 'ТВОЙ ЛОТ НА ТОРГАХ' : room.myChoice ? 'СТАВКА ПРИНЯТА' : 'АУКЦИОН ИДЁТ')
    : 'СТАВКИ РАСКРЫТЫ';
  $('gameInstruction').textContent = selecting
    ? (isSeller ? 'Тебе предоставили три предмета. Выбери один — он станет лотом этого раунда. После этого остальные игроки смогут делать ставки.' : `Ждём, пока ${room.players.find(p => p.id === room.sellerId)?.name || 'продавец'} выберет один из трёх предметов. Ставки пока закрыты.`)
    : bidding ? (isSeller
      ? 'Ты выставил предмет и получишь деньги, если кто-то его купит. На собственный лот ставить нельзя.'
      : room.myChoice
        ? `Твоя ставка принята. Ждём остальных игроков (${room.choicesSubmitted} / ${room.players.filter(p => p.online && p.id !== room.sellerId).length}).`
        : 'Продавец выставил один предмет. Выбери размер ставки и подтверди её.')
    : 'Раунд завершён. Продавец получает выигравшую ставку, а купленный предмет остаётся у покупателя до финальной оценки.';

  $('lotSectionTitle').classList.toggle('hidden', !sellerPicking);
  $('gameMeta').classList.toggle('hidden', !sellerPicking);
  $('lotGrid').classList.toggle('hidden', !sellerPicking);
  $('sellerChoicePanel').classList.toggle('hidden', !sellerPicking);
  $('sellerWaitPanel').classList.toggle('hidden', !waitingForSeller);
  $('sellerChoiceHint').textContent = state.chosenLot
    ? `Выбран: ${room.currentLots.find(l => l.lotId === state.chosenLot)?.name || 'предмет'}. Подтверди выставление.`
    : 'Выбери один из трёх предметов. После подтверждения начнутся торги.';
  $('exhibitLotBtn').disabled = !sellerPicking || !state.chosenLot || !room.currentLots.some(l => l.lotId === state.chosenLot);

  const offeredLots = sellerPicking ? room.currentLots : [];
  $('lotGrid').innerHTML = offeredLots.map((item, i) => {
    const selected = state.chosenLot === item.lotId;
    const feature = item.feature ? `<div class="feature-tag ${item.feature.delta < 0 ? 'negative' : ''}">${esc(item.feature.name)} · ${item.feature.delta > 0 ? '+' : ''}${item.feature.delta}</div>` : '<div class="feature-tag">Без особенностей</div>';
    return `<button class="lot-card ${selected ? 'selected' : ''}" data-lot-id="${esc(item.lotId)}"><div class="lot-art"><span class="lot-number">ВЫБОР 0${i+1}</span><span class="lot-symbol">${ITEM_SYMBOLS[item.itemId] || '◇'}</span></div><div class="lot-body"><div class="lot-name">${esc(item.name)}</div><div class="lot-description">${esc(item.description)}</div>${feature}<div class="lot-price-row"><span>СТАРТОВАЯ ЦЕНА</span><strong>${money(item.startPrice)}</strong></div></div></button>`;
  }).join('');

  $('lotGrid').querySelectorAll('.lot-card').forEach((button) => button.addEventListener('click', () => {
    if (room.phase !== 'sellerChoosing' || own.id !== room.sellerId) return;
    state.chosenLot = button.dataset.lotId;
    $('lotGrid').querySelectorAll('.lot-card').forEach(card => card.classList.toggle('selected', card === button));
    $('sellerChoiceHint').textContent = `Выбран: ${room.currentLots.find(item => item.lotId === state.chosenLot)?.name || 'предмет'}. Подтверди выставление.`;
    $('exhibitLotBtn').disabled = false;
    renderSellerStage(room, own);
  }));

  $('bidPanel').classList.toggle('hidden', !bidding || isSeller || Boolean(room.myChoice));
  if (bidding && !isSeller && lot) {
    if (state.lastBidLotId !== lot.lotId) {
      state.lastBidLotId = lot.lotId;
      state.chosenLot = lot.lotId;
      $('bidAmount').min = lot.startPrice;
      $('bidAmount').max = own.cash;
      $('bidAmount').value = Math.min(own.cash, lot.startPrice);
      $('minimumBidLabel').textContent = `Минимум: ${money(lot.startPrice)}`;
      $('submitBidBtn').disabled = false;
      $('bidStatus').textContent = `Укажи ставку от ${money(lot.startPrice)} до ${money(own.cash)}.`;
    }
  }
  if (bidding && !isSeller && room.myChoice) $('bidStatus').textContent = 'Ставка отправлена и скрыта от других игроков.';
  if (bidding || selecting) $('revealPanel').classList.add('hidden');
  if (!selecting && !bidding) renderRoundOutcome(room.lastOutcome);
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
  const sellerLine = outcome
    ? `<div class="outcome-row seller-outcome"><strong>Продавец: ${esc(outcome.sellerName)} — ${esc(outcome.lotName)}</strong><span>${outcome.sold ? `Получено ${money(outcome.sellerIncome)}` : 'Лот остался у продавца'}</span></div>`
    : '';
  const rows = [
    sellerLine,
    ...winners.map(w => `<div class="outcome-row"><strong>✓ ${esc(w.playerName)} купил «${esc(w.lotName)}»</strong><span>Ставка ${money(w.bid)} · оценка ${money(w.marketValue)}</span></div>`),
    ...losers.map(l => `<div class="outcome-row"><strong>— ${esc(l.playerName)} — ${esc(l.lotName)}</strong><span>Ставка ${money(l.bid)} · не выиграл</span></div>`)
  ];
  $('roundOutcomeList').innerHTML = rows.length ? rows.join('') : '<div class="inventory-empty">Нет выигранных лотов в этом раунде.</div>';
}
function renderResults() {
  const results = state.room.results || [];
  const winner = results[0];
  if (!winner) return;
  $('winnerBanner').innerHTML = `<div><small>ПОБЕДИТЕЛЬ МАТЧА</small><h3>${esc(winner.name)}</h3></div><div class="winner-profit">${winner.netProfit >= 0 ? '+' : ''}${money(winner.netProfit)}</div>`;
  $('resultsList').innerHTML = results.map((p, i) => `<div class="result-row ${p.winner ? 'winner' : ''}"><div class="result-rank">${String(i + 1).padStart(2, '0')}</div><div class="result-avatar"><img src="/characters/${esc(p.characterId || 'collector')}.svg" alt=""></div><div class="result-player"><strong>${esc(p.name)}${p.playerId === state.playerId ? ' (ты)' : ''}</strong><span>${esc(p.characterName || 'Коллекционер')} · ${p.items.length} предметов</span></div><div class="result-metric profit"><span>ЧИСТАЯ ПРИБЫЛЬ</span><strong>${p.netProfit >= 0 ? '+' : ''}${money(p.netProfit)}</strong></div></div>`).join('');
  const own = state.room.players.find(p => p.id === state.playerId);
  $('nextMatchBtn').classList.toggle('hidden', !own?.isHost);
  $('backToHomeBtn').textContent = own?.isHost ? 'Вернуться в лобби' : 'Остаться в комнате';
}

$('createRoomBtn').addEventListener('click', createRoom);
$('joinRoomBtn').addEventListener('click', joinRoom);
$('startPracticeBtn').addEventListener('click', startPractice);
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
$('exhibitLotBtn').addEventListener('click', () => {
  if (!state.chosenLot || !state.room || state.room.phase !== 'sellerChoosing') return;
  send('sellLot', { lotId: state.chosenLot });
  $('exhibitLotBtn').disabled = true;
  $('sellerChoiceHint').textContent = 'Выставляем предмет на торги…';
});
$('submitBidBtn').addEventListener('click', () => {
  const lot = state.room?.currentLots.find(l => l.lotId === state.chosenLot);
  if (!lot || state.room?.phase !== 'choosing') { toast('Дождись, пока продавец выставит предмет'); return; }
  const own = state.room.players.find(p => p.id === state.playerId);
  if (own?.id === state.room.sellerId) { toast('Нельзя ставить на собственный предмет'); return; }
  const bid = Number($('bidAmount').value);
  if (!Number.isInteger(bid) || bid < lot.startPrice) { toast(`Минимальная ставка — ${lot.startPrice} монет`); return; }
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
startIntroAnimation();
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
