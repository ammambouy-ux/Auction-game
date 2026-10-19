import test from 'node:test';
import assert from 'node:assert/strict';
import { createPracticeRoom, startMatch, roomStateFor, submitChoice, selectLotForSale } from '../src/rooms.js';

class FakeSocket {
  readyState = 1;
  messages = [];
  send(message) { this.messages.push(JSON.parse(message)); }
}

function cleanup(room) {
  if (room.roundTimer) clearTimeout(room.roundTimer);
  if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
  for (const timer of room.botTimers) clearTimeout(timer);
  room.botTimers.clear();
}

test('practice mode offers three items to the selected seller and advances after bidding', async (t) => {
  const { room, player } = createPracticeRoom(new FakeSocket(), 'Tester', 'practice-test-player', 2);
  t.after(() => cleanup(room));
  assert.equal(room.mode, 'practice');
  assert.equal(room.players.size, 3);
  assert.equal([...room.players.values()].filter((p) => p.isBot).length, 2);
  assert.throws(() => createPracticeRoom(new FakeSocket(), 'Bad', 'bad-bot-count', 1), /от 2 до 5 ботов/);

  startMatch(room, player);
  assert.equal(room.phase, 'sellerChoosing');
  assert.equal(room.sellerOptions.length, 3);
  assert.equal(room.round, 1);
  const seller = room.players.get(room.sellerId);
  assert.ok(seller);
  assert.equal(roomStateFor(room, player.id).currentLots.length, seller.id === player.id ? 3 : 0);

  if (seller.id === player.id) {
    selectLotForSale(room, seller, room.sellerOptions[0].lotId);
  }
  await new Promise((resolve) => setTimeout(resolve, 2200));
  if (seller.id !== player.id && room.phase === 'choosing') {
    const lot = room.currentLots[0];
    submitChoice(room, player, lot.lotId, lot.startPrice);
  }
  await new Promise((resolve) => setTimeout(resolve, 2200));
  assert.equal(room.phase, 'revealing', 'round should resolve after seller selection and bidder choices');
  assert.ok(room.lastOutcome);
});

test('practice room assigns unique characters and seller receives three private options', (t) => {
  const { room, player } = createPracticeRoom(new FakeSocket(), 'Portrait test', 'portrait-test-player', 5);
  t.after(() => cleanup(room));
  startMatch(room, player);
  const state = roomStateFor(room, player.id);
  assert.equal(new Set(state.players.map((p) => p.characterId)).size, 6);
  assert.ok(state.players.some((p) => p.id === room.sellerId));
  assert.equal(room.phase, 'sellerChoosing');
  assert.equal(room.sellerOptions.length, 3);
  assert.equal(state.currentLots.length, player.id === room.sellerId ? 3 : 0);
});

test('seller chooses one of three lots; winning bid is transferred to seller', (t) => {
  const { room, player } = createPracticeRoom(new FakeSocket(), 'Seller test', 'seller-test-player', 2);
  t.after(() => cleanup(room));
  startMatch(room, player);
  const seller = room.players.get(room.sellerId);
  assert.equal(room.sellerOptions.length, 3);
  assert.throws(
    () => submitChoice(room, seller, room.sellerOptions[0].lotId, room.sellerOptions[0].startPrice),
    /Сейчас нельзя делать ставку|не можешь делать ставку/
  );

  const selected = room.sellerOptions[0];
  const balanceBefore = seller.cash;
  selectLotForSale(room, seller, selected.lotId);
  assert.equal(room.phase, 'choosing');
  assert.equal(room.currentLots.length, 1);
  for (const timer of room.botTimers) clearTimeout(timer);
  room.botTimers.clear();

  const bidders = [...room.players.values()].filter((p) => p.id !== seller.id);
  for (const bidder of bidders) submitChoice(room, bidder, selected.lotId, selected.startPrice);
  assert.equal(seller.cash, balanceBefore + selected.startPrice);
  assert.equal(seller.salesIncome, selected.startPrice);
  assert.equal(room.phase, 'revealing');
  assert.equal(room.lastOutcome.sold, true);
  assert.equal(room.lastOutcome.sellerId, seller.id);
});
