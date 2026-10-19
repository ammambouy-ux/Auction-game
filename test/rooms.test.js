import test from 'node:test';
import assert from 'node:assert/strict';
import { createPracticeRoom, startMatch, roomStateFor, submitChoice } from '../src/rooms.js';

class FakeSocket {
  readyState = 1;
  messages = [];
  send(message) { this.messages.push(JSON.parse(message)); }
}

test('practice room starts with the requested bots and bots make automatic bids', async (t) => {
  const ws = new FakeSocket();
  const { room, player } = createPracticeRoom(ws, 'Tester', 'practice-test-player', 2);
  t.after(() => {
    if (room.roundTimer) clearTimeout(room.roundTimer);
    for (const timer of room.botTimers) clearTimeout(timer);
    room.botTimers.clear();
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
  });

  assert.equal(room.mode, 'practice');
  assert.equal(room.players.size, 3);
  assert.equal([...room.players.values()].filter((p) => p.isBot).length, 2);
  assert.throws(() => createPracticeRoom(new FakeSocket(), 'Bad', 'bad-bot-count', 1), /от 2 до 5 ботов/);

  startMatch(room, player);
  let state = roomStateFor(room, player.id);
  assert.equal(state.phase, 'choosing');
  assert.equal(state.round, 1);
  assert.equal(state.players.length, 3);
  assert.equal(state.players.filter((p) => p.isBot).length, 2);

  await new Promise((resolve) => setTimeout(resolve, 2400));
  state = roomStateFor(room, player.id);
  assert.equal(state.choicesSubmitted, 2, 'both bots should submit a bid automatically');

  const lot = room.currentLots[0];
  submitChoice(room, player, lot.lotId, lot.startPrice);
  state = roomStateFor(room, player.id);
  assert.equal(state.phase, 'revealing', 'round should resolve after the human bid is submitted');
  assert.ok(state.outcome);
});

test('practice match assigns unique character portraits and a seller/featured lot each round', (t) => {
  const { room, player } = createPracticeRoom(new FakeSocket(), 'Portrait test', 'portrait-test-player', 5);
  t.after(() => {
    if (room.roundTimer) clearTimeout(room.roundTimer);
    for (const timer of room.botTimers) clearTimeout(timer);
    room.botTimers.clear();
  });
  startMatch(room, player);
  const state = roomStateFor(room, player.id);
  assert.equal(new Set(state.players.map((p) => p.characterId)).size, 6);
  assert.ok(state.players.some((p) => p.id === state.sellerId));
  assert.ok(state.currentLots.some((lot) => lot.lotId === state.featuredLotId));
});
