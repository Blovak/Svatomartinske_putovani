import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
const context = vm.createContext({ Date, Number, String, Math, JSON, Object, Array, Map, console });
vm.runInContext(source, context);

test('zdrojový řádek vytvoří bod', () => {
  const point = context.parsePoint_(['49.9699433N, 14.6600078E', 'Na Žlabku 246']);
  assert.equal(point.id, 'gps-49.9699433-14.6600078');
  assert.equal(point.name, 'Na Žlabku 246');
  assert.equal(point.lat, 49.9699433);
  assert.equal(context.parsePoint_(['neplatné', 'Bod']), null);
});

test('Apps Script vystavuje veřejné body bez přihlašovacího endpointu', () => {
  assert.equal(typeof context.doGet, 'function');
  assert.equal(typeof context.pointsResponse_, 'function');
  assert.equal(typeof context.doPost, 'undefined');
  assert.equal(typeof context.requestVerificationCode_, 'undefined');
  assert.equal(typeof context.recordVisit_, 'undefined');
});

test('Apps Script obsahuje hodinovou synchronizaci bodů', () => {
  assert.equal(typeof context.syncPoints, 'function');
  assert.equal(typeof context.installHourlyTrigger, 'function');
});
