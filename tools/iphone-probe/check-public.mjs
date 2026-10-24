import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const report={url:'https://riff-duel.vercel.app/iphone/',pageErrors:[],privateResponses:[],uploads:[]};let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))report.uploads.push({url:r.url(),method:r.method()});});
 page.on('response',r=>{const p=new URL(r.url()).pathname;if(p.startsWith('/iphone/private/')||p.startsWith('/local-'))report.privateResponses.push({path:p,status:r.status(),fromServiceWorker:r.fromServiceWorker()});});
 await page.goto(report.url+'preparar.html');await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{},{timeout:30000});
 await page.locator('#file').setInputFiles('artifacts/mobile-private/check-1791758684739/fixture.gh3mobile');await page.click('#import');await page.waitForSelector('#play:not([hidden])',{timeout:30000});
 await page.goto(report.url+'private/index.html');await page.waitForFunction(()=>window.workerResult==='LOCAL ONLY',{},{timeout:30000});
 report.isolated=await page.evaluate(()=>crossOriginIsolated);assert.equal(report.isolated,true);assert.ok(report.privateResponses.length>=4);assert.ok(report.privateResponses.every(r=>r.fromServiceWorker&&r.status===200));assert.deepEqual(report.uploads,[]);assert.deepEqual(report.pageErrors,[]);
 await page.screenshot({path:'artifacts/mobile-private/public-fixture.png'});report.ok=true;
}catch(e){report.error=e.stack;report.ok=false;process.exitCode=1;}
finally{await browser?.close();fs.writeFileSync('artifacts/mobile-private/public-verification.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
