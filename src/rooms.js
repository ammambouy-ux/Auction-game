import crypto from 'node:crypto';
import { MAX_PLAYERS, MIN_PLAYERS, STARTING_CASH, TOTAL_ROUNDS, makeLots } from './catalog.js';

const ROOM_TTL_MS = 1000 * 60 * 60 * 3;
const DISCONNECT_GRACE_MS = 1000 * 45;
const rooms = new Map();

const cleanName = (value) => String(value ?? '').trim().replace(/[<>]/g, '').slice(0, 18) || 'Игрок';
const createId = () => crypto.randomUUID();
const createCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
};

const BOT_PROFILES = [
  { name: 'Туз', style: 'Осторожный', strategy: 'careful' },
  { name: 'Фортуна', style: 'Расчётливый', strategy: 'calculated' },
  { name: 'Валет', style: 'Агрессивный', strategy: 'aggressive' },
  { name: 'Блеф', style: 'Рискованный', strategy: 'risky' },
  { name: 'Джокер', style: 'Непредсказуемый', strategy: 'chaotic' }
];

const CHARACTER_PROFILES = [
  { id: 'sheikh', title: 'Богатый шейх' },
  { id: 'mafia', title: 'Босс мафии' },
  { id: 'heiress', title: 'Светская львица' },
  { id: 'cowboy', title: 'Техасский магнат' },
  { id: 'tycoon', title: 'Теневой бизнесмен' },
  { id: 'collector', title: 'Старый коллекционер' }
];

function assignCharacter(room, player) {
  if (player.characterId) return;
  const used = new Set([...room.players.values()].map((p) => p.characterId).filter(Boolean));
  const available = CHARACTER_PROFILES.filter((profile) => !used.has(profile.id));
  const pool = available.length ? available : CHARACTER_PROFILES;
  const profile = pool[crypto.randomInt(pool.length)];
  player.characterId = profile.id;
  player.characterName = profile.title;
}

function chooseSeller(room) {
  const online = [...room.players.values()].filter((p) => p.online);
  const pool = online.length ? online : [...room.players.values()];
  const seller = pool[crypto.randomInt(pool.length)];
  room.sellerId = seller?.id ?? null;
  const lot = room.currentLots.length ? room.currentLots[crypto.randomInt(room.currentLots.length)] : null;
  room.featuredLotId = lot?.lotId ?? null;
}

function roomFor(code) {
  const room = rooms.get(String(code ?? '').toUpperCase());
  if (!room) throw new Error('Комната не найдена. Проверь код.');
  return room;
}

function playerFor(room, playerId) {
  return room.players.get(playerId);
}

function publicRoom(room, viewerId) {
  const viewer = playerFor(room, viewerId);
  return {
    code: room.code,
    mode: room.mode || 'online',
    sellerId: room.sellerId || null,
    featuredLotId: room.featuredLotId || null,
    phase: room.phase,
    hostId: room.hostId,
    round: room.round,
    totalRounds: TOTAL_ROUNDS,
    players: [...room.players.values()].map((p) => ({
      id: p.id, name: p.name, ready: p.ready, online: p.online,
      cash: p.cash, itemCount: p.inventory.length,
      isHost: p.id === room.hostId, isBot: Boolean(p.isBot), botStyle: p.botStyle || null,
      characterId: p.characterId || 'collector', characterName: p.characterName || 'Коллекционер',
      submitted: Boolean(p.choice)
    })),
    currentLots: room.phase === 'choosing'
      ? room.currentLots.map(({ marketValue, ...lot }) => lot)
      : room.phase === 'revealing' ? room.currentLots : [],
    myChoice: viewer?.choice ? { lotId: viewer.choice.lotId, bid: viewer.choice.bid } : null,
    myInventory: viewer?.inventory ?? [],
    choicesSubmitted: [...room.players.values()].filter((p) => p.choice).length,
    outcome: room.lastOutcome,
    results: room.results,
    error: null
  };
}

function emitRoom(room, broadcast, viewerId = null) {
  for (const player of room.players.values()) {
    if (!player.ws || player.ws.readyState !== 1) continue;
    const state = publicRoom(room, player.id);
    try { player.ws.send(JSON.stringify({ type: 'state', state })); } catch { /* connection may close during send */ }
  }
}

export function broadcastRoom(room) { emitRoom(room); }

export function sendError(player, message) {
  try { player?.ws?.send(JSON.stringify({ type: 'error', message })); } catch { /* ignore */ }
}

export function createRoom(ws, rawName, rawPlayerId) {
  const playerId = typeof rawPlayerId === 'string' && rawPlayerId.length < 80 ? rawPlayerId : createId();
  let code;
  do { code = createCode(); } while (rooms.has(code));
  const player = { id: playerId, name: cleanName(rawName), ws, online: true, ready: false, cash: STARTING_CASH, inventory: [], choice: null, spent: 0 };
  const room = {
    code, hostId: playerId, players: new Map([[playerId, player]]), phase: 'lobby', round: 0,
    currentLots: [], mode: 'online', botTimers: new Set(), sellerId: null, featuredLotId: null,
    lastOutcome: null, results: null, roundTimer: null, cleanupTimer: null, createdAt: Date.now()
  };
  assignCharacter(room, player);
  rooms.set(code, room);
  player.ws = ws;
  return { room, player };
}

export function createPracticeRoom(ws, rawName, rawPlayerId, rawBotCount) {
  const botCount = Number(rawBotCount);
  if (!Number.isInteger(botCount) || botCount < 2 || botCount > 5) {
    throw new Error('Для теста выбери от 2 до 5 ботов.');
  }
  const created = createRoom(ws, rawName, rawPlayerId);
  const { room, player } = created;
  room.mode = 'practice';
  player.ready = true;

  const profiles = [...BOT_PROFILES].sort(() => Math.random() - 0.5);
  for (let i = 0; i < botCount; i += 1) {
    const profile = profiles[i];
    const bot = {
      id: `bot-${createId()}`,
      name: profile.name,
      ws: null,
      online: true,
      ready: true,
      cash: STARTING_CASH,
      inventory: [],
      choice: null,
      spent: 0,
      isBot: true,
      botStyle: profile.style,
      botStrategy: profile.strategy
    };
    assignCharacter(room, bot);
    room.players.set(bot.id, bot);
  }
  return created;
}

export function joinRoom(ws, rawCode, rawName, rawPlayerId) {
  const room = roomFor(rawCode);
  const playerId = typeof rawPlayerId === 'string' && rawPlayerId.length < 80 ? rawPlayerId : createId();
  const existing = playerFor(room, playerId);
  if (existing) {
    if (existing.ws && existing.ws !== ws && existing.ws.readyState === 1) {
      try { existing.ws.close(4000, 'Подключение восстановлено на другом соединении'); } catch { /* ignore */ }
    }
    existing.ws = ws;
    existing.online = true;
    existing.name = cleanName(rawName) || existing.name;
    if (room.cleanupTimer) { clearTimeout(room.cleanupTimer); room.cleanupTimer = null; }
    return { room, player: existing, resumed: true };
  }
  if (room.phase !== 'lobby') throw new Error('Матч уже начался. Подключиться можно только к лобби.');
  if (room.players.size >= MAX_PLAYERS) throw new Error('Комната заполнена: максимум 6 игроков.');
  const player = { id: playerId, name: cleanName(rawName), ws, online: true, ready: false, cash: STARTING_CASH, inventory: [], choice: null, spent: 0 };
  assignCharacter(room, player);
  room.players.set(playerId, player);
  return { room, player, resumed: false };
}

export function toggleReady(room, player) {
  if (room.phase !== 'lobby') throw new Error('Матч уже начался.');
  player.ready = !player.ready;
  emitRoom(room);
}

export function startMatch(room, player) {
  if (player.id !== room.hostId) throw new Error('Начать матч может только создатель комнаты.');
  clearBotTimers(room);
  if (room.phase !== 'lobby') throw new Error('Матч уже запущен.');
  if (room.players.size < MIN_PLAYERS) throw new Error('Нужно минимум 3 игрока.');
  if ([...room.players.values()].some((p) => !p.ready)) throw new Error('Все игроки должны нажать «Готов».');
  room.round = 1;
  room.lastOutcome = null;
  room.results = null;
  for (const p of room.players.values()) {
    p.cash = STARTING_CASH;
    p.inventory = [];
    p.spent = 0;
    p.choice = null;
    p.ready = false;
  }
  beginRound(room);
}

function beginRound(room) {
  room.phase = 'choosing';
  room.currentLots = makeLots();
  chooseSeller(room);
  room.lastOutcome = null;
  for (const p of room.players.values()) p.choice = null;
  emitRoom(room);
  if (room.roundTimer) clearTimeout(room.roundTimer);
  room.roundTimer = setTimeout(() => resolveRound(room), 45000);
  scheduleBotChoices(room);
}

export function submitChoice(room, player, rawLotId, rawBid) {
  if (room.phase !== 'choosing') throw new Error('Сейчас нельзя делать ставку.');
  if (player.choice) throw new Error('Ты уже сделал ставку в этом раунде.');
  const lot = room.currentLots.find((item) => item.lotId === rawLotId);
  if (!lot) throw new Error('Этот предмет не найден в текущем раунде.');
  const bid = Number(rawBid);
  if (!Number.isSafeInteger(bid)) throw new Error('Ставка должна быть целым числом.');
  if (bid < lot.startPrice) throw new Error(`Минимальная ставка — ${lot.startPrice} монет.`);
  if (bid > player.cash) throw new Error('Ставка превышает твой баланс.');
  player.choice = { lotId: lot.lotId, bid, submittedAt: Date.now() };
  emitRoom(room);
  if (allPlayersSubmitted(room)) resolveRound(room);
}

function resolveRound(room) {
  if (room.phase !== 'choosing') return;
  if (room.roundTimer) { clearTimeout(room.roundTimer); room.roundTimer = null; }
  clearBotTimers(room);
  room.phase = 'revealing';
  const winners = [];
  const losers = [];
  const bids = [...room.players.values()].filter((p) => p.choice && !p.choice.pass).sort((a, b) => b.choice.bid - a.choice.bid || a.choice.submittedAt - b.choice.submittedAt);
  const awardedPlayers = new Set();
  for (const lot of room.currentLots) {
    const candidates = bids.filter((p) => p.choice.lotId === lot.lotId && !awardedPlayers.has(p.id));
    if (candidates.length) {
      const winner = candidates[0];
      if (winner.choice.bid <= winner.cash) {
        winner.cash -= winner.choice.bid;
        winner.spent += winner.choice.bid;
        winner.inventory.push({ ...lot, purchasePrice: winner.choice.bid, roundBought: room.round });
        awardedPlayers.add(winner.id);
        winners.push({ playerId: winner.id, playerName: winner.name, lotName: lot.name, bid: winner.choice.bid, marketValue: lot.marketValue, profitPotential: lot.marketValue - winner.choice.bid });
        for (const loser of candidates.slice(1)) losers.push({ playerId: loser.id, playerName: loser.name, lotName: lot.name, bid: loser.choice.bid });
      }
    }
  }
  for (const player of room.players.values()) {
    if (player.choice && !player.choice.pass && !awardedPlayers.has(player.id) && !losers.some((l) => l.playerId === player.id)) {
      losers.push({ playerId: player.id, playerName: player.name, lotName: room.currentLots.find((l) => l.lotId === player.choice.lotId)?.name ?? 'Предмет', bid: player.choice.bid });
    }
    player.choice = null;
  }
  room.lastOutcome = { round: room.round, winners, losers, message: winners.length ? `Раунд ${room.round} завершён` : 'В этом раунде никто не выиграл лот.' };
  emitRoom(room);
  if (room.roundTimer) clearTimeout(room.roundTimer);
  room.roundTimer = setTimeout(() => {
    if (room.round >= TOTAL_ROUNDS) finishMatch(room);
    else { room.round += 1; beginRound(room); }
  }, 6500);
}

function clearBotTimers(room) {
  if (!room.botTimers) room.botTimers = new Set();
  for (const timer of room.botTimers) clearTimeout(timer);
  room.botTimers.clear();
}

function allPlayersSubmitted(room) {
  return [...room.players.values()].every((p) => !p.online || p.choice);
}

function botDecision(room, bot) {
  const affordable = room.currentLots.filter((lot) => lot.startPrice <= bot.cash);
  if (!affordable.length) return null;

  const ranked = affordable.map((lot) => ({
    lot,
    score: lot.marketValue - lot.startPrice + (Math.random() - 0.5) * 240
  })).sort((a, b) => b.score - a.score);

  const shortlistSize = Math.min(ranked.length, Math.random() < 0.72 ? 2 : ranked.length);
  const lot = ranked[Math.floor(Math.random() * shortlistSize)].lot;
  const upside = Math.max(0, lot.marketValue - lot.startPrice);
  let bid;

  switch (bot.botStrategy) {
    case 'careful':
      bid = lot.startPrice + upside * (0.12 + Math.random() * 0.24);
      break;
    case 'calculated':
      bid = lot.startPrice + upside * (0.30 + Math.random() * 0.34);
      break;
    case 'aggressive':
      bid = lot.startPrice + upside * (0.62 + Math.random() * 0.42);
      break;
    case 'risky':
      bid = lot.startPrice + upside * (0.35 + Math.random() * 0.55);
      if (Math.random() < 0.28) bid = Math.max(bid, lot.marketValue + 30 + Math.floor(Math.random() * 140));
      break;
    default:
      bid = lot.startPrice + Math.random() * Math.max(120, Math.min(650, bot.cash - lot.startPrice));
      if (Math.random() < 0.18) bid += 100 + Math.random() * 220;
      break;
  }

  bid = Math.round(bid / 10) * 10;
  bid = Math.min(bot.cash, Math.max(lot.startPrice, bid));
  return { lotId: lot.lotId, bid };
}

function scheduleBotChoices(room) {
  if (room.mode !== 'practice') return;
  const bots = [...room.players.values()].filter((p) => p.isBot && p.online && !p.choice);
  bots.forEach((bot, index) => {
    const delay = 450 + Math.random() * 1300 + index * 160;
    const timer = setTimeout(() => {
      room.botTimers.delete(timer);
      if (room.phase !== 'choosing' || bot.choice) return;
      const decision = botDecision(room, bot);
      if (decision) {
        submitChoice(room, bot, decision.lotId, decision.bid);
      } else {
        bot.choice = { pass: true, lotId: null, bid: 0, submittedAt: Date.now() };
        emitRoom(room);
        if (allPlayersSubmitted(room)) resolveRound(room);
      }
    }, delay);
    room.botTimers.add(timer);
  });
}

function finishMatch(room) {
  if (room.phase === 'results') return;
  room.phase = 'results';
  if (room.roundTimer) { clearTimeout(room.roundTimer); room.roundTimer = null; }
  const finalResults = [...room.players.values()].map((p) => {
    const revenue = p.inventory.reduce((sum, item) => sum + item.marketValue, 0);
    const netProfit = revenue - p.spent;
    return {
      playerId: p.id,
      name: p.name,
      characterId: p.characterId || 'collector',
      characterName: p.characterName || 'Коллекционер',
      isBot: Boolean(p.isBot),
      spent: p.spent,
      revenue,
      netProfit,
      finalBalance: p.cash + revenue,
      items: p.inventory.map((item) => ({ name: item.name, purchasePrice: item.purchasePrice, marketValue: item.marketValue, feature: item.feature }))
    };
  }).sort((a, b) => b.netProfit - a.netProfit);
  if (finalResults.length) {
    const top = finalResults[0].netProfit;
    finalResults.forEach((p) => { p.winner = p.netProfit === top; });
  }
  room.results = finalResults;
  room.lastOutcome = null;
  emitRoom(room);
}

export function nextMatch(room, player) {
  if (player.id !== room.hostId) throw new Error('Новый матч может начать только создатель комнаты.');
  if (room.phase !== 'results') throw new Error('Текущий матч ещё не завершён.');
  clearBotTimers(room);
  room.phase = 'lobby';
  room.round = 0;
  room.currentLots = [];
  room.results = null;
  room.lastOutcome = null;
  const practiceMode = room.mode === 'practice';
  for (const p of room.players.values()) {
    p.ready = practiceMode;
    p.cash = STARTING_CASH;
    p.inventory = [];
    p.spent = 0;
    p.choice = null;
  }
  if (practiceMode) {
    startMatch(room, player);
    return;
  }
  emitRoom(room);
}

export function handleDisconnect(room, player) {
  if (!room || !player) return;
  player.online = false;
  player.ws = null;
  if (room.phase === 'lobby' && player.id === room.hostId) {
    const nextHost = [...room.players.values()].find((p) => p.online);
    if (nextHost) room.hostId = nextHost.id;
  }
  emitRoom(room);
  const realPlayers = [...room.players.values()].filter((p) => !p.isBot);
  if (realPlayers.every((p) => !p.online)) {
    if (room.roundTimer) clearTimeout(room.roundTimer);
    clearBotTimers(room);
    room.cleanupTimer = setTimeout(() => rooms.delete(room.code), ROOM_TTL_MS);
    return;
  }
  setTimeout(() => {
    const stillOffline = room.players.get(player.id);
    if (!stillOffline || stillOffline.online || !rooms.has(room.code)) return;
    if (room.phase === 'lobby') {
      room.players.delete(player.id);
      if (room.hostId === player.id) room.hostId = [...room.players.keys()][0] ?? null;
      emitRoom(room);
    }
  }, DISCONNECT_GRACE_MS);
}

export function currentRoomForPlayer(playerId, roomCode) {
  const room = rooms.get(String(roomCode ?? '').toUpperCase());
  if (!room) return null;
  const player = playerFor(room, playerId);
  return player ? { room, player } : null;
}

export function roomStateFor(room, playerId) { return publicRoom(room, playerId); }
