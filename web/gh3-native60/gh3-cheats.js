// Claude 2026-10-12: trucos instantáneos (sin menús). Escriben directo en la memoria del juego lo mismo que hace
// el truco original. "Todas las canciones": las 447 entradas de GlobalTags que el truco X360 pone en unlocked=1
// (lista medida comparando la memoria antes/después del truco: artifacts/d1-wasm/truco/memdiff6).
(() => {
  const SONG_KEYS = new Set(["3df8474a","cae08835","37586836","2a7976f3","bf09a641","eaf5d61d","df18604e","d863561f","c4e14f42","bfcf246a","bd96a876","f9378d6e","206316aa","6a7812cd","5f95a49e","552564ed","60c8d2be","acaacb1f","b880a7d9","66f58fbf","456cb769","e848c63a","1375dbe9","c430e8f1","32bda37a","61215eca","b842b373","78b58d33","1b8689e7","ce015ac6","b0b95523","7c460504","ec5e4d8e","1aa21f7e","c3f684ba","5020abe5","d87cad2c","fa4454e8","f3d6c1ac","c6105062","b1deff45","bbd9afde","52ddc9b1","cdab2b84","44504ff9","dff61af0","df813a3b","6d5a1ff","9033a822","38d2e305","af4df22c","6aeacca2","fd75dd8b","7e3dc90e","3129678f","48b8178a","f48dd3d8","1cea16e3","d94d286d","b1fe095","aa8e0001","8a102015","f16c024","ba3bb030","35696032","1de6c03d","1756004e","2adff05f","9335306a","fd57907c","e9ef1086","f528c089","d5856095","96079098","8ed1f0a9","7aec00bf","6ed920da","482190dc","6a9010dd","155110f7","1755c102","ba18c10d","5c2f110","dc866115","5b405118","e3ad11c","d9a5f125","d26ab12e","a8668144","82599145","27345146","5cd7914b","bdd7a166","5827f178","55f1d17b","b0a8017e","2478b184","49a79185","8757a1a2","9c80f1bc","13de11df","635971e3","3b7491f1","3b1c201","254d5205","aa1f8207","afb2420c","25fe6223","437da236","94a26247","e640d24c","c43d25f","4fba927f","a27d4290","7c89229d","873752b0","52f952b5","d84ac2ba","a886b2be","a1dbb2bf","fca2b2c0","33a522f2","f24e62fb","b9e6b307","d2b57309","d2e1b30c","cbf0030f","f4c05312","b1cee31d","3575c322","a401f325","317ca328","914c3329","89725330","3a306335","7e0e9352","8d609354","6fe8e359","71dfc365","bbb26368","37106371","59ee6374","c8aad386","afb238a","add95390","4fd5d393","aa320395","3644a396","bcf73399","ebfb13a7","64c233b2","1ac43c0","a40273c4","8aaad3d4","7f3a23d9","e54033ef","ee0cf3f2","5c873fd","37abc405","4ecf40a","53f4e41a","e9d1641f","4715b42a","61e9242e","9d04d43d","1c86d460","6e1b3470","e149e472","e4e42479","e9251480","ff50c486","d06b49d","d407a49f","82524ad","1ed1c4b2","d48c84db","427484e7","9d6b04ed","8874d4f3","c0f7c4f6","c88d7504","f314d506","79ebc50f","41a3a511","da1a555c","468c655d","6e9f5567","db00576","99e3157c","770b0589","3025c5ae","68cfd5af","a0a345b7","7e2d45b9","8a3f25bc","cf81b5bf","f09065dc","273825e2","fe7cb5e7","c65a95eb","3a82e5f7","11a7b5fb","d0b4b609","b061760a","22bbb61d","7e91462d","75dd8630","de586632","71cf637","bb63563a","f16dd645","7e3f0647","3aafb64a","572fd65c","120ff65f","80879662","280b766e","ff134670","7265c67c","366ec67e","ee93268d","977026a6","4b7146aa","559496ac","258f46af","618776c4","a8f666cd","495626e2","310246e3","aaadd6ea","a1e116f7","c3189706","f4fed70c","cc9dc716","462e5719","1821171e","a8500726","8545b72d","2a49d730","e330e731","6c623733","3918b737","fec074a","8ff5775e","822b4762","e73eb773","2801f778","bb9af780","33dbb7a4","462057ab","8b7507ca","178f17d0","d3d367d7","592c77de","980657ef","75ceb828","3c14a82b","3351083c","73669851","77e9d860","b300f862","14c68871","1a075876","ce802882","2f055884","f590888","a75a0896","698e789f","62e6f8ac","eddfd8b9","2a7738bf","4080f8c5","cfd228c7","8c8e18ca","ca7fe8cc","d7a8c8d1","55e6d8d4","2d94c8d6","b30028e9","e82838ec","e364f8f1","15e308f4","8d138fc","348c4908","813b910","4bb5b913","45596928","9c1df92d","4ed23944","6793895c","a6b9a96d","1b869978","fa181992","83896997","93af998","d28019a1","dd8f19b3","577009ba","ab8089c1","b778d9c9","fa8679de","f48199e9","d98149f1","725509f3","4037d9f8","3af7fa08","daa2aa0b","60474a14","b148a1a","d8070a1b","eab85a1d","3ba29a26","90f30a41","5e033a66","804f9a67","eb1c5a69","71509a72","fe483a74","bbf36a78","ec0a0a93","e52c4aa3","f6f89aaa","3ba24aad","cfafaab2","81736abc","6b916ac6","40797add","f16ae1","8170dae8","50a4caf2","bc392af8","657dbafd","448cbb02","7613bb1f","ad68eb21","14503b31","4f981b32","5aa18b35","1ee0fb42","f8e56b69","961b6b6c","2f184b79","80322b84","42f9fb86","ed29fbb0","93242bb7","4934bbc2","5b209bc8","55d68bd3","6bf77bdc","282c5be5","330ffbf4","4236dc1f","44bd2c21","4652bc25","88e0bc32","1dedfc34","ae74cc38","975e6c3b","9c10dc5b","4042ec6f","2d020c7e","3d0e3c83","94a07c85","1bf2ac87","91fa2c90","17221cbd","e3283cc7","11abdcce","bdaefcdf","397c9d01","2b0d4d11","9366ad12","79500d17","dd4d0d19","8a72ed1d","73f94d2e","37c7bd49","4d40ad56","b92d6d5f","21bd8d62","27d28d6d","e573d81","2fcd2d86","397c4d8a","e3fb2d8e","3447bd9a","8f711d9f","20a11da9","2647ddb4","32784dca","6935edce","67a3bdda","bee72ddf","694f6de1","a7c5dde9","b478fdeb","86fd4df1","9af9df3","ac891df4","17965e07","9ec3fe0a","cb973e0b","47876e0f","a8b86e1a","ceb8de1b","496bbe34","15b13e4f","c7d69e51","19589e5f","cef0de61","b4afde97","f1dd5ea2","b7f75eab","bd69eb0","84844eb2","ea7a4eb7","81298eb9","a729ec4","fb6d9ed1","6a89ded3","22d81eea","f8587ef9","1ac74f06","318f0f1b","9b201f23","5927cf32","17c2bf3d","48130f42","7560bf48","10172f4d","d4522f59","9e6d3f92","65ffaf9a","bfd7ff9c","ef01df9e","c5d24fa4","fc2ebfbc","6f502fc0","198bafc4","96d97fc6","f1570fc7","b1de2fce","1c266fcf","8aa07fde","8e501fed","aff31ff9","a21d1d85","8e051d99"].map((k) => parseInt(k, 16) >>> 0));
  const UNLOCKED = 0xfef4e1e8;
  let mem = null;  // { sab, seg }
  const hook = setInterval(() => {
    const w = window.g1worker; if (!w || w.__gh3cheats) return;
    w.__gh3cheats = true; clearInterval(hook);
    w.addEventListener('message', (e) => { if (e.data?.type === 'g1Mem') mem = { sab: e.data.sab, seg: e.data.seg }; });
  }, 300);
  const fresh = () => new Promise((res) => { const w = window.g1worker; if (!w) return res(null); const t0 = performance.now();
    const on = (e) => { if (e.data?.type === 'g1Mem') { w.removeEventListener('message', on); res(mem); } };
    w.addEventListener('message', on); w.postMessage({ type: 'memReq' }); setTimeout(() => { w.removeEventListener('message', on); res(mem); }, 1500); });
  // Lectura big-endian de la memoria guest (PowerPC) por dirección guest.
  function view() {
    const u8 = new Uint8Array(mem.sab), dv = new DataView(mem.sab), seg = new Uint32Array(mem.sab, mem.seg, 256);
    const host = (g) => (seg[g >>> 24] + g) >>> 0;
    return { u8, dv, seg, host, r32: (g) => dv.getUint32(host(g)), w32: (g, v) => dv.setUint32(host(g), v) };
  }
  const isPtr = (p) => p >>> 0 >= 0xa0000000 && p >>> 0 < 0xc0000000;
  // Componente: [byte, tipo, 0, 0][clave][valor][siguiente]
  function setInChain(v, head, key, value) {
    let c = head, n = 0, hits = 0;
    while (c && isPtr(c) && n++ < 64) {
      const t = v.u8[v.host(c) + 1];
      if (v.r32(c + 4) === key && t === 1) { if (v.r32(c + 8) !== value) { v.w32(c + 8, value); hits++; } }
      c = v.r32(c + 12);
    }
    return hits;
  }
  function hasTag(v, head, key) { let c = head, n = 0; while (c && isPtr(c) && n++ < 64) { if (v.r32(c + 4) === key) return true; c = v.r32(c + 12); } return false; }
  // Recorre la física buscando entradas de la tabla [clave][objeto][siguiente] con clave en la lista.
  function unlockKeys(keys, tagKey, value) {
    const v = view(); let entries = 0, set = 0; const pick = new Map();  // clave -> [dirección de la entrada, cabeza]
    for (let s = 0xa0; s <= 0xbf; s++) {
      const base = v.host(s << 24), words = new Uint32Array(mem.sab, base, (16 << 20) >>> 2);
      for (let i = 0; i < words.length - 2; i++) {
        const w = words[i]; if (!w) continue;
        const k = ((w & 0xff) << 24 | (w & 0xff00) << 8 | (w >>> 8) & 0xff00 | w >>> 24) >>> 0;
        if (!keys.has(k)) continue;
        const obj = v.dv.getUint32(base + (i + 1) * 4); if (!isPtr(obj)) continue;
        // Objeto del struct = [base del bloque (mismos 16 bits altos)][cabeza de la lista de componentes].
        // (o la entrada apunta directo a la cabeza, con la marca del bloque justo antes).
        let head;
        if ((v.r32(obj) >>> 16) === (obj >>> 16)) head = v.r32(obj + 4);
        else if ((v.r32(obj - 4) >>> 16) === (obj >>> 16)) head = v.r32(obj);
        else continue;
        if (!isPtr(head)) continue;
        // Algunas claves se repiten (49 veces en 25 casos); el truco original cambia la de dirección más alta.
        entries++; const addr = (s << 24 | i << 2) >>> 0, prev = pick.get(k); if (!prev || addr > prev[0]) pick.set(k, [addr, head]);
      }
    }
    let noTag = 0;
    for (const [, [, head]] of pick) { const before = set; set += setInChain(v, head, tagKey, value); if (set === before && !hasTag(v, head, tagKey)) noTag++; }  // set = cuántas cambiaron
    return { entries, keys: pick.size, set, noTag };
  }
  window.gh3Cheats = {
    async unlockAllSongs() { if (!(await fresh())) return { error: 'juego no iniciado' }; return unlockKeys(SONG_KEYS, UNLOCKED, 1); },
  };
  // Botón del panel: reemplaza la versión que escribía el truco por los menús.
  const hb = setInterval(() => {
    const b = document.getElementById('gh3CheatSongs'), txt = document.getElementById('gh3CheatTxt'); if (!b) return; clearInterval(hb);
    // Combinado: 1) marcas en memoria al instante; 2) el truco por los menús (crea las entradas de las tiers,
    // que no se pueden crear desde afuera). En celular los pasos van más lentos (r5snap-panel.js).
    const menuCheat = b.onclick;
    b.onclick = async (e) => { try { window.gh3CheatResult = await window.gh3Cheats.unlockAllSongs(); } catch {} return menuCheat?.call(b, { currentTarget: b }); };  // e.currentTarget ya no existe tras el await
  }, 300);
})();
