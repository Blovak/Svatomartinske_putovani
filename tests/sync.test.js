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
test('soubor synchronizace nemá veřejný vstup', () => {
  assert.equal(typeof context.doGet, 'undefined');
  assert.equal(typeof context.doPost, 'undefined');
});
