(()=>{
  const actors=['santi','codex','claude','automation'],key='gh3-test-profile';
  let saved='',explicit=null;
  try{saved=localStorage.getItem(key)||'';}catch{}
  try{explicit=new URL(location.href).searchParams.get('prueba');}catch{}
  if(explicit==='ninguna'||actors.includes(explicit)){
    saved=explicit==='ninguna'?'':explicit;
    try{if(saved)localStorage.setItem(key,saved);else localStorage.removeItem(key);
      // A profile change starts a separate anonymous visit.
      sessionStorage.removeItem('gh3-analytics-session');
    }catch{}
    try{const url=new URL(location.href);url.searchParams.delete('prueba');history.replaceState(null,'',url);}catch{}
  }
  // An unlabelled automated browser must not inherit Santi's manual profile.
  const tester=actors.includes(explicit)?explicit:navigator.webdriver&&!['codex','claude','automation'].includes(saved)?'automation':actors.includes(saved)?saved:'unknown';
  try{
    // Also catch a profile changed in the panel in a DIFFERENT tab.
    if(sessionStorage.getItem('gh3-analytics-profile')!==tester)sessionStorage.removeItem('gh3-analytics-session');
    sessionStorage.setItem('gh3-analytics-profile',tester);
  }catch{}
  const data={tester};
  const ready=(async()=>{
    let timer;
    const controller=new AbortController();
    try{
      const geo=await Promise.race([
        fetch('/api/gh3-location',{cache:'no-store',credentials:'omit',signal:controller.signal}).then(response=>response.ok?response.json():{}),
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('geo_timeout'));},1500);})
      ]);
      if(geo){
        if(/^[A-Z]{2}$/.test(geo.geo_country||'')){
          data.geo_country=geo.geo_country;
          for(const field of ['geo_region','geo_city'])if(typeof geo[field]==='string')data[field]=geo[field].slice(0,80);
        }
      }
    }catch{/* Missing geo must never prevent playing or sending telemetry. */}
    finally{clearTimeout(timer);}
  })();
  window.gh3VisitContext={data,ready};
})();
