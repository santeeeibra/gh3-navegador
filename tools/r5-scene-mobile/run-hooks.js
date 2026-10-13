 report.affinity=[];
 if(process.env.SCENE_MOBILE){
  const {spawnSync}=await import('node:child_process');
  const ps=spawnSync('powershell.exe',['-NoProfile','-File','tools/d1-wasm/set-affinity.ps1','-Mask','3','-Pattern',path.resolve(out+'/edge-profile')],{encoding:'utf8',windowsHide:true});report.affinity.push({tool:'set-affinity.ps1',mask:3,stdout:ps.stdout,stderr:ps.stderr});
  // All Chromium children already launched must also be pinned. CDP lists only
  // our browser processes; future children inherit the browser affinity.
  const cdp=await browser.browser().newBrowserCDPSession();const pids=(await cdp.send('SystemInfo.getProcessInfo')).processInfo;
  report.affinityPids=pids;
  for(const p of pids){const a=spawnSync('powershell.exe',['-NoProfile','-Command',`$p=Get-Process -Id ${Number(p.id)}; $p.ProcessorAffinity=[IntPtr]3; [string]$p.Id+':'+[string]$p.ProcessorAffinity`],{encoding:'utf8',windowsHide:true});report.affinity.push({pid:p.id,stdout:a.stdout,stderr:a.stderr});}
 }
 await page.exposeFunction('saveSceneCapture',async m=>{
  const dir=out+'/capture-'+m.id;fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/frame.r5f',Buffer.from(m.frame,'base64'));
  for(const r of m.resources){fs.writeFileSync(dir+`/${r.phys}-${r.length}.bin`,Buffer.from(r.data,'base64'));delete r.data;}
  delete m.frame;fs.writeFileSync(dir+'/capture.json',JSON.stringify(m,null,2));
 });
 await page.addInitScript(()=>{
  const W=window.Worker;window.Worker=function(...args){const w=new W(...args);w.addEventListener('message',e=>{
   const m=e.data?.data?.sceneCapture;if(!m)return;const b64=b=>{const a=new Uint8Array(b);let s='';for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode(...a.subarray(i,i+32768));return btoa(s);};m.frame=b64(m.frame);for(const r of m.resources)r.data=b64(r.data);window.saveSceneCapture(m).catch(console.error);
  });return w;};
 });
