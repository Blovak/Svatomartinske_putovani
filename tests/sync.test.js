import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
const context = vm.createContext({ Date, Number, String, Math, JSON, Object, Array, Map, console });
vm.runInContext(source, context);
test('zdrojový řádek vytvoří bod a metrech za stupeň délky', () => {
  const p = context.parsePoint_(['49.9699433N, 14.6600078E', 'Na Žlabku 246']);
  assert.equal(p.id, 'gps-49.9699433-14.6600078');
  assert.equal(p.name, 'Na Žlabku 246');
  assert.equal(p.lat, 49.9699433);
  assert.equal(context.parsePoint_(['neplatné', 'Bod']), null);
});
test('Apps Script vystavuje vstupy pro číselný kód a relaci', () => {
  assert.equal(typeof context.doGet, 'function');
  assert.equal(typeof context.doPost, 'function');
});
test('role jsou omezené na user a admin', () => {
  assert.equal(context.normalizeRole_('admin'), 'admin');
  assert.equal(context.normalizeRole_(' ADMIN '), 'admin');
  assert.equal(context.normalizeRole_('owner'), 'user');
  assert.equal(context.normalizeRole_(''), 'user');
});
test('záhlaví uživatelské tabulky toleruje diakritiku a mezery', () => {
  assert.equal(context.normalizeHeader_(' Typ účtu '), 'typ uctu');
  assert.equal(context.normalizeHeader_('Datum   registrace'), 'datum registrace');
});
test('ověřovací request ID musí být dostatečně dlouhé a bezpečné', () => {
  assert.equal(context.normalizeVerificationRequestId_('verify_1234567890abcdef'), 'verify_1234567890abcdef');
  assert.equal(context.normalizeVerificationRequestId_('verify_short'), '');
});
test('server odmítne starou, nepřesnou a vzdálenou návštěvu', () => {
  const now = Date.now();
  const point = { lat: 49.9699433, lng: 14.6600078, lonMPerDeg: 71465 };
  assert.equal(context.visitIsEligible_(point, { measuredAtMs: now, lat: point.lat, lng: point.lng, accuracy: 5 }, now), true);
  assert.equal(context.visitIsEligible_(point, { measuredAtMs: now - 31000, lat: point.lat, lng: point.lng, accuracy: 5 }, now), false);
  assert.equal(context.visitIsEligible_(point, { measuredAtMs: now, lat: point.lat, lng: point.lng, accuracy: 21 }, now), false);
  assert.equal(context.visitIsEligible_(point, { measuredAtMs: now, lat: point.lat + 0.001, lng: point.lng, accuracy: 5 }, now), false);
});
