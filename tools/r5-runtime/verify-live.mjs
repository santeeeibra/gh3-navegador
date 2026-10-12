import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {liveServer} from './serve-live.mjs';
const seconds=Number(process.argv[2]||230),label=process.argv[3]||'edge-live';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,process.env.R5_LIVE_OUT||'artifacts/r5-live');await mkdir(out,{recursive:true});
const server=await liveServer();let browser,timer;const report={label,seconds,pageErrors:[],frames:[]};
try{
 browser=await chromium.launch({channel:'msedge',headless:true});report.browser=browser.version();const page=await browser.newPage();
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 page.on('pageerror',e=>report.pageErrors.push(e.message));
 const q=new URLSearchParams({cpasync:'1',cpwait:'event',r3acheck:'1',r5snap:'1',r5consumer:'r5snap-codex.js',press:process.env.R5_PRESS||'150:start,175:start',audio:'silent',xma:'decode',waitmulti:'event'});
 await page.goto('http://127.0.0.1:'+server.address().port+'/?'+q);
 await page.setInputFiles('#dir','D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock');
 await page.fill('#secs',String(seconds));await page.selectOption('#gpu','null');await page.click('#go');
 let capturing=false,lastFrame=0;const started=Date.now();
 timer=setInterval(async()=>{
   if(capturing)return;capturing=true;
   try{
     const s=await page.evaluate(()=>({frames:window.d4.r5Frames||0,live:window.d4.r5Live,last:window.d4.r5Last,exit:window.d4.exit}));
     console.log(JSON.stringify({elapsed:Math.round((Date.now()-started)/1000),...s}));
     if(s.frames>lastFrame){lastFrame=s.frames;const name=label+'-frame-'+s.frames+'.png';await page.locator('#r5Canvas').screenshot({path:resolve(out,name)});report.frames.push({file:name,...s.last});}
   }catch(e){console.log('sample: '+e.message);}finally{capturing=false;}
 },20000);
 await page.waitForFunction(()=>window.d4.exit!==null||window.d4.r5Live?.fatal,null,{timeout:(seconds+180)*1000});
 clearInterval(timer);timer=null;Object.assign(report,await page.evaluate(()=>window.d4));
 if(report.r5Frames){await page.locator('#r5Canvas').screenshot({path:resolve(out,label+'-last.png')});}
 await page.screenshot({path:resolve(out,label+'-page.png'),fullPage:true});
 report.passed=report.exit===0&&report.r5Live?.rendered>0&&report.r5Live?.reused>0&&report.r5Live?.readbacks===0&&report.r5Live?.maxQueued<=2&&!report.r5Live?.fatal&&!report.r5Live?.gpuErrors.length&&!report.pageErrors.length;
}catch(e){report.fatal=e.message;report.passed=false;}finally{
 if(timer)clearInterval(timer);if(browser)await browser.close();await new Promise(r=>server.close(r));
 const log=report.log||[];delete report.log;await writeFile(resolve(out,label+'.log'),log.join('\n'));await writeFile(resolve(out,label+'.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify({...report,marks:undefined,vd:undefined,frames:report.frames.length},null,2));if(!report.passed)process.exitCode=1;
