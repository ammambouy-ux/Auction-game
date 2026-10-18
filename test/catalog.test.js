import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, FEATURES, STARTING_CASH, MAX_PLAYERS, MIN_PLAYERS, TOTAL_ROUNDS, makeLots } from '../src/catalog.js';

test('catalog has more than 20 distinct items', () => {
  assert.ok(ITEMS.length >= 20);
  assert.equal(new Set(ITEMS.map((item) => item.id)).size, ITEMS.length);
});

test('all base purchase prices are in the expected range', () => {
  for (const item of ITEMS) {
    assert.ok(item.basePrice >= 300 && item.basePrice <= 1200, `${item.name} has invalid base price`);
    assert.ok(item.marketValue > 0, `${item.name} must have positive market value`);
  }
});

test('there are no rarity fields and features have numeric deltas', () => {
  assert.ok(FEATURES.length >= 6);
  for (const item of ITEMS) assert.equal('rarity' in item, false);
  for (const feature of FEATURES) assert.equal(typeof feature.delta, 'number');
});

test('makeLots creates three unique item offers with optional features', () => {
  const values = [0.01, 0.2, 0.99, 0.02, 0.2, 0.99, 0.03, 0.2, 0.99];
  let i = 0;
  const lots = makeLots(() => values[i++ % values.length], 3);
  assert.equal(lots.length, 3);
  assert.equal(new Set(lots.map((lot) => lot.itemId)).size, 3);
  for (const lot of lots) {
    assert.ok(lot.startPrice >= 300 && lot.startPrice <= 1200);
    assert.ok(lot.marketValue >= 0);
    if (lot.feature) assert.equal(lot.marketValue, ITEMS.find((item) => item.id === lot.itemId).marketValue + lot.feature.delta);
  }
});

test('shared game settings match concept', () => {
  assert.equal(STARTING_CASH, 5000);
  assert.equal(MIN_PLAYERS, 3);
  assert.equal(MAX_PLAYERS, 6);
  assert.equal(TOTAL_ROUNDS, 5);
});
