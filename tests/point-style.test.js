import test from 'node:test';
import assert from 'node:assert/strict';
import { pointMarkerStyle } from '../point-style.js';

test('navštívený a nenavštívený bod mají odlišné barvy', () => {
  const unvisited = pointMarkerStyle(false);
  const visited = pointMarkerStyle(true);
  assert.equal(unvisited.fillColor, '#a74932');
  assert.equal(visited.fillColor, '#277451');
  assert.notEqual(unvisited.fillColor, visited.fillColor);
});
