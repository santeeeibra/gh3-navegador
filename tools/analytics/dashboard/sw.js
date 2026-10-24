// Claude 2026-10-24: recibe los avisos push del panel y abre el panel al tocarlos.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let d={};try{d=event.data?event.data.json():{};}catch{}
  event.waitUntil(self.registration.showNotification(d.title||'Las Vegas Hero',{body:d.body||'',tag:d.tag||undefined,icon:'icon-192.png',badge:'icon-192.png',data:{url:d.url||'./'}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL((event.notification.data&&event.notification.data.url)||'./',self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const c of list){if(c.url.startsWith(self.registration.scope)&&'focus' in c)return c.focus();}
    return self.clients.openWindow(target);
  }));
});
