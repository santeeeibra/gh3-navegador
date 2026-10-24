import {test} from 'node:test';
import assert from 'node:assert/strict';
import {splitAsmConsts} from './asm-consts.mjs';
test('exponent address emitted by Emscripten remains a separate function',()=>{
  const parsed=splitAsmConsts('before\nvar ASM_CONSTS = {\n  123: () => performance.now(),\n  9984e3: $0 => {\n    err(UTF8ToString($0));\n  }\n};\nafter');
  assert.deepEqual(parsed.entries.map(x=>x.key),['123','9984000']);
  assert.equal(parsed.entries[0].body,'() => performance.now()');
  assert.match(parsed.entries[1].body,/UTF8ToString/);assert.equal(parsed.outside,'before\nASM_CONSTS\nafter');
});
