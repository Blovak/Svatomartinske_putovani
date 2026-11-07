import test from 'node:test';
import assert from 'node:assert/strict';
import { pointMarkerStyle } from '../point-style.js';

test('bod putování má jednotný styl', () => {
  const style = pointMarkerStyle();
  assert.equal(style.fillColor, '#a74932');
  assert.equal(style.fillOpacity, 1);
});
