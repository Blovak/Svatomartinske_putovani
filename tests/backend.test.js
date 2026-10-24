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
let writes = 0;
context.rows_ = () => ({ rows:[], sheet:{ appendRow() { writes++; } } });

test('server přijme přesnou čerstvou polohu', () => {
  assert.equal(visit().status, 'OK');
  assert.equal(writes, 1);
});
test('server odmítne nepřesnou, vzdálenou a starou polohu', () => {
  assert.equal(visit({ accuracy:'21' }).error, 'INACCURATE_POSITION');
  assert.equal(visit({ lat:'49.0002' }).error, 'OUT_OF_RANGE');
  assert.equal(visit({ timestamp:String(now - 31000) }).error, 'STALE_POSITION');
  assert.equal(writes, 1);
});
test('server odmítne duplicitní návštěvu', () => {
  context.rows_ = () => ({ rows:[{ values:['u1','bod-1'] }], sheet:{ appendRow() { writes++; } } });
  assert.equal(visit().error, 'ALREADY_VISITED');
  assert.equal(writes, 1);
});
