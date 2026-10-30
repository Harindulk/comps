import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearestPlace, placeLabel } from './places.js';

test('nearestPlace finds the city at its own coordinates', () => {
  assert.equal(nearestPlace(42.89, -78.88).name, 'Buffalo');
  assert.equal(nearestPlace(42.89, -78.88).cc, 'US');
  assert.equal(nearestPlace(6.93, 79.85).name, 'Colombo');
});

test('placeLabel says rural when the nearest town is far away', () => {
  assert.equal(placeLabel(42.89, -78.88), 'near Buffalo, US');
  assert.match(placeLabel(-25, 135), /^rural, ~\d+ km from /);
});
