// Emscripten may spell an address with an exponent (9984e3 = 9984000).
// Missing that key silently folds a different import into the preceding body.
export function splitAsmConsts(text) {
  const start=text.indexOf('var ASM_CONSTS = {'),end=text.indexOf('\n};',start)+3;
  if(start<0||end<3)throw Error('ASM_CONSTS not found');
  const block=text.slice(start,end),re=/^\s*(\d+(?:e[+-]?\d+)?): /gm,matches=[...block.matchAll(re)];
  const entries=matches.map((m,i)=>({key:String(Number(m[1])),body:block.slice(m.index+m[0].length,i+1<matches.length?matches[i+1].index:block.lastIndexOf('\n}')).trim().replace(/,$/,'')}));
  if(new Set(entries.map(x=>x.key)).size!==entries.length)throw Error('Duplicate ASM_CONST address');
  return {start,end,entries,outside:text.slice(0,start)+'ASM_CONSTS'+text.slice(end)};
}
