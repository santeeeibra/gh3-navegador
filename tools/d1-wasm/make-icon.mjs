import {chromium} from 'playwright';
const out=process.argv[2];
const html=s=>`<html><body style="margin:0;width:${s}px;height:${s}px;background:radial-gradient(circle at 50% 35%,#3a1d0e,#0d0b10 70%);display:flex;align-items:center;justify-content:center;overflow:hidden">
<svg viewBox="0 0 100 100" width="${s*0.82}" height="${s*0.82}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffcf4a"/><stop offset="1" stop-color="#e2541e"/></linearGradient></defs>
<path d="M50 6 C78 6 94 18 92 38 C90 60 66 86 50 95 C34 86 10 60 8 38 C6 18 22 6 50 6Z" fill="url(#g)" stroke="#1a0d06" stroke-width="3"/>
<text x="50" y="52" text-anchor="middle" font-family="Impact,Arial Black,sans-serif" font-size="30" fill="#1a0d06">GH3</text>
<g transform="translate(26 64)">${['#2ecc40','#ff3b30','#ffd60a','#0a84ff','#ff9500'].map((c,i)=>`<circle cx="${i*12}" cy="0" r="4.6" fill="${c}" stroke="#1a0d06" stroke-width="1.4"/>`).join('')}</g></svg></body></html>`;
const b=await chromium.launch({channel:'msedge',headless:true});
for(const s of [180,192,512]){const p=await b.newPage({viewport:{width:s,height:s}});await p.setContent(html(s));await p.screenshot({path:`${out}/gh3-icon-${s}.png`});await p.close();}
await b.close();
