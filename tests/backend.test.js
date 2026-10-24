import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
const context = vm.createContext({
  Date, Number, String, Math, JSON, Object, Array,
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) }
});
vm.runInContext(source, context);
const now = Date.now();
const visit = (overrides = {}) => context.visit_({
  sessionToken:'session', pointId:'bod-1', lat:'49', lng:'14',
  accuracy:'5', timestamp:String(now), requestId:'12345678-1234-1234-1234-123456789abc',
  ...overrides
});
context.session_ = () => ({ userId:'u1' });
context.points_ = () => [{ id:'bod-1', lat:49, lng:14 }];
context.hmac_ = () => 'visit-hash';
let writes = [];
let existing = false;
context.fsGet_ = () => existing ? { pointId:'bod-1' } : null;
context.fsWriteSet_ = (path, data, precondition) => ({ path, data, precondition });
context.fsCommit_ = changes => { writes.push(...changes); };

test('souřadnice ze zdrojové tabulky se načtou do mapového bodu', () => {
  const point = context.parsePoint_(['49.9699433N, 14.6600078E', 'Na Žlabku 246']);
  assert.equal(point.lat, 49.9699433);
  assert.equal(point.lng, 14.6600078);
  assert.equal(point.name, 'Na Žlabku 246');
  assert.equal(context.parsePoint_(['neplatné', 'Bod']), null);
});

test('server přijme přesnou čerstvou polohu', () => {
  assert.equal(visit().status, 'OK');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, 'users/u1/visits/visit-hash');
  assert.equal(writes[0].precondition.exists, false);
});
test('server odmítne nepřesnou, vzdálenou a starou polohu', () => {
  assert.equal(visit({ accuracy:'21' }).error, 'INACCURATE_POSITION');
  assert.equal(visit({ lat:'49.0002' }).error, 'OUT_OF_RANGE');
  assert.equal(visit({ timestamp:String(now - 31000) }).error, 'STALE_POSITION');
  assert.equal(writes.length, 1);
});
test('server odmítne duplicitní návštěvu', () => {
  existing = true;
  assert.equal(visit().error, 'ALREADY_VISITED');
  assert.equal(writes.length, 1);
  existing = false;
});
test('současný duplicitní zápis odmítne Firestore precondition', () => {
  context.fsCommit_ = () => { throw Object.assign(new Error('duplicate'), { status:409 }); };
  assert.equal(visit().error, 'ALREADY_VISITED');
});

test('Firestore zápis vynucuje vytvoření nového dokumentu', () => {
  const isolated = vm.createContext({ Date, Number, String, Math, JSON, Object, Array });
  vm.runInContext(source, isolated);
  isolated.settings_ = () => ({ projectId:'martin-test', pointsId:'sheet', pepper:'x'.repeat(32) });
  const write = isolated.fsWriteSet_('users/user-1/visits/point-1', {
    pointId:'point-1', visitedAt:new Date('2026-10-24T12:00:00Z')
  }, { exists:false });
  assert.equal(write.update.name, 'projects/martin-test/databases/(default)/documents/users/user-1/visits/point-1');
  assert.equal(write.currentDocument.exists, false);
  assert.equal(write.update.fields.pointId.stringValue, 'point-1');
  assert.equal(write.update.fields.visitedAt.timestampValue, '2026-10-24T12:00:00.000Z');
});
