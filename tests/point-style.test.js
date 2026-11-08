import test from 'node:test';
import assert from 'node:assert/strict';
import { pointMarkerStyle, isFinishPoint } from '../point-style.js';

test('bod putování má jednotný styl', () => {
  const style = pointMarkerStyle();
  assert.equal(style.fillColor, '#a74932');
  assert.equal(style.fillOpacity, 1);
});

test('cíl má vlastní symbol s diakritikou i bez ní', () => {
  for (const name of ['Cil', 'Cíl', ' CÍL ', 'Cíl – u čerta']) assert.equal(isFinishPoint({ name }), true);
  for (const name of ['Stanoviště 1', 'Cílová ulice', '']) assert.equal(isFinishPoint({ name }), false);
});
