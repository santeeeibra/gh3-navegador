// Isolated host-adapter experiment; original source and R6 objects are unchanged.
import fs from 'node:fs';
import crypto from 'node:crypto';
const root='artifacts/song-sync/pacing';
const source='artifacts/d1-wasm/rtsrc/src/audio/silent/silent_audio_system.cpp';
let text=fs.readFileSync(source,'utf8');
const original=text;
const replace=(a,b)=>{if(!text.includes(a))throw Error('Pacing source anchor missing');text=text.replace(a,b);};
replace('std::atomic<uint64_t> submitted{0}, consumed{0};','std::atomic<uint64_t> submitted{0}, consumed{0}, pacing_late{0}, pacing_rebases{0};');
replace('auto deadline=Clock::now();','auto deadline=Clock::now();\n    bool clock_started=false;');
replace('        deadline=Clock::now();','        // Preserve elapsed playback time across a briefly empty producer queue.');
replace('      deadline+=frame;\n      // Do not burst an unlimited backlog after scheduling stalls.\n      if(deadline<Clock::now())deadline=Clock::now()+frame;',
`      const auto now=Clock::now();
      if(!clock_started) { deadline=now; clock_started=true; }
      deadline+=frame;
      // Recover scheduling overshoot instead of adding it to every audio block.
      // Bound recovery after long stalls to eight blocks (42.7 ms).
      if(deadline+frame*8<now) { deadline=now-frame*8; ++pacing_rebases; }
      if(deadline<now) ++pacing_late;`);
replace('  std::lock_guard lock(tap::mutex);\n  if(tap::mode==1)',
`  std::fprintf(stderr,"[r6-pacing] late=%llu rebases=%llu\\n",(unsigned long long)pacing_late.load(),(unsigned long long)pacing_rebases.load());
  std::lock_guard lock(tap::mutex);
  if(tap::mode==1)`);
fs.mkdirSync(`${root}/src/audio/silent`,{recursive:true});
fs.writeFileSync(`${root}/src/audio/silent/silent_audio_system.cpp`,text);
fs.mkdirSync(`${root}/rt-obj`,{recursive:true});
for(const dir of ['artifacts/d1-wasm/rt-obj','artifacts/d1-wasm/r6/rt-obj'])
 for(const name of fs.readdirSync(dir))if(name.endsWith('.o'))fs.copyFileSync(`${dir}/${name}`,`${root}/rt-obj/${name}`);
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
fs.writeFileSync(`${root}/source.json`,JSON.stringify({source,original:hash(original),patched:hash(text),scope:'Continuous host audio deadlines; bounded scheduling recovery, no guest-code edits'},null,2));
// Keep the existing linker flags / SIMD guest code / pre-JS, changing only object view and output.
let linker=fs.readFileSync('tools/d1-wasm/link-web.sh','utf8');
assertAnchor(linker,'"$A"/rt-obj/*.o');
linker=linker.replace('"$A"/rt-obj/*.o','"$ROOT/artifacts/song-sync/pacing/rt-obj"/*.o').replace('tools/d1-wasm/d4_web.js','tools/d1-wasm/r6_web.js');
fs.writeFileSync('tools/d1-wasm/.audio-pacing-link.sh',linker);
function assertAnchor(s,a){if(!s.includes(a))throw Error('Linker anchor missing');}
console.log(JSON.stringify({root,sourceHash:hash(original),patchedHash:hash(text)}));
