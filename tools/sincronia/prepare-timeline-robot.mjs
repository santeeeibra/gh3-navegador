import fs from 'node:fs';
let code=fs.readFileSync('tools/accesos/robot.mjs','utf8').replace('lead = -350','lead = 0');
const start=code.indexOf('      const clock = () =>'),end=code.indexOf('      const nap = ',start);
if(start<0||end<0)throw Error('No se encontró el reloj del robot.');
code=code.slice(0,start)+`      const clock = () => {
        if(!M)return NaN;
        const t=new Uint32Array(M.sab,M.seg,256),dv=new DataView(M.sab);
        const h=a=>(t[a>>>24]+a)>>>0;
        // The base timer also advances before the song is initialised. Do not
        // skip chart notes while loading; the original input loop marks activity.
        if(dv.getFloat32(h(0x829B57B0),false)===0)return NaN;
        return Math.fround(dv.getFloat64(h(0x82BD7C38),false))*1000
          +dv.getFloat32(h(0x829B56C0),false)-dv.getFloat32(h(0x829A0438),false)*1000;
      };
`+code.slice(end);
code=code.replace('clockMax: -1e9','clockMax: -1e9, clockMode: "original-judgement", presses: []')
 .replace('strumUntil = pnow + 30; st.strums++;','strumUntil = pnow + 30; st.strums++; st.presses.push({index:i,target:x.t,clock:now,at:performance.timeOrigin+pnow});')
 .replace('Atomics.add(L, 0, 1); last = key;', 'new Float64Array(L.buffer,L.byteOffset+32,1)[0]=performance.timeOrigin+performance.now(); Atomics.add(L, 0, 1); last = key;');
fs.writeFileSync('tools/sincronia/robot-timeline.mjs',code);
const runner=fs.readFileSync('tools/sincronia/robot-judgement.mjs','utf8').replace("from '../accesos/robot.mjs'", "from './robot-timeline.mjs'");
fs.writeFileSync('tools/sincronia/robot-native-timeline.mjs',runner);
console.log('Robot de contraste listo: contador original + ajuste de entrada − margen temprano; sin adelanto350.');
