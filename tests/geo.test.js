import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceMeters, visitEligibility } from '../geo.js';
const point = { lat: 49, lng: 14 };
test('vzdálenost stejného místa je nulová', () => assert.equal(distanceMeters(point, point), 0));
test('potvrzení vyžaduje celý kruh přesnosti do 20 m', () => {
  const now = Date.now();
  assert.equal(visitEligibility(point, { ...point, accuracy: 19, timestamp: now }, now).ok, true);
  assert.equal(visitEligibility(point, { ...point, accuracy: 21, timestamp: now }, now).ok, false);
  assert.equal(visitEligibility(point, { lat: 49.0001, lng: 14, accuracy: 10, timestamp: now }, now).ok, false);
  assert.equal(visitEligibility(point, { ...point, accuracy: 1, timestamp: now - 16000 }, now).ok, false);
});
