import {chromium} from 'playwright-core';

const browser=await chromium.launch({
  executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless:true,
});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage(),events=[],responses=[];
page.on('request',request=>{
  if(!request.url().includes('/functions/v1/gh3-analytics'))return;
  try{events.push(JSON.parse(request.postData()||'{}'));}catch{}
});
page.on('response',response=>{
  if(response.url().includes('/functions/v1/gh3-analytics'))responses.push(response.status());
});
try{
  await page.goto('https://lasvegasherogame.com/gh3/',{waitUntil:'domcontentloaded',timeout:60_000});
  await page.waitForFunction(()=>window.gh3Analytics&&document.querySelector('#loaderPlay:not([disabled])'),null,{timeout:60_000});
  await page.locator('#loaderPlay').click({noWaitAfter:true});
  await page.waitForFunction(()=>/Preparando|Iniciando/.test(document.querySelector('#loaderPlay')?.textContent||'')||document.body.classList.contains('loaderStarted'),null,{timeout:10_000});
  const ux=await page.evaluate(()=>({button:document.querySelector('#loaderPlay')?.textContent,status:document.querySelector('#loaderStatus')?.textContent,started:document.body.classList.contains('loaderStarted')}));
  await page.waitForTimeout(1500);
  console.log(JSON.stringify({ok:true,ux,events:events.map(({event,session_id,source,device})=>({event,session_id,source,device})),responses}));
}finally{
  await context.close();
  await browser.close();
}
