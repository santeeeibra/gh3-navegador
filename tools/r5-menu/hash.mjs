import createXxh3 from '../d1-wasm/r5f-xxh3.mjs';
// Reuse only the standalone hash algorithm, not Claude's parser or classifier.
export async function createHash() {
  const x=await createXxh3();
  return data=>{
    const p=x._malloc(Math.max(1,data.length));if(!p)throw Error('XXH3 allocation failed');
    try{x.HEAPU8.set(data,p);return BigInt.asUintN(64,x._r5f_xxh3(p,data.length));}
    finally{x._free(p);}
  };
}
