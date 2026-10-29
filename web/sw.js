const CACHE = 'cube-studio-__VERSION__';
const SHELL = ['/', '/style.css', '/dark.css', '/coordinated-storage.js','/timer-session.js','/lesson-session.js','/indexed-storage.js','/random-state.js','/scramble-worker.js','/scrambler.js','/settings-dialog.js','/split-methods.js','/splits-page.js','/timer-split-picker.js','/history-dialogs.js','/scramble-layout.js','/app.js','/dom.js','/device-storage.js','/storage-feedback.js','/sync.js','/solve-views.js','/lesson-presentation.js','/timer-input.js','/motion.js','/mobile-navigation.js', '/core.js', '/cube.js', '/lessons.js', '/lesson-view.js','/lesson-cube.js','/lesson-scrambler.js','/lesson-scramble-worker.js','/cube-solver.js', '/lessons.css', '/split-charts.js', '/solve-feedback.js', '/pwa.js', '/connect.js', '/manifest.webmanifest', '/icons/icon-180.png', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    for(const path of SHELL){
      const response=await fetch(new Request(path,{cache:'reload'}));
      const type=response.headers.get('content-type')||'';
      if(!response.ok||response.redirected||(path.endsWith('.js')&&!/javascript/.test(type))||(path.endsWith('.css')&&!/text\/css/.test(type)))throw Error('App shell unavailable');
      await cache.put(path,response);
    }
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys())if(key.startsWith('cube-studio-')&&key!==CACHE)await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  // Solve data, authentication and third-party resources are never cached here.
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/cdn-cgi/'))return;
  if(event.request.mode==='navigate'){
    // Keep HTML and JS on the same version until the user accepts an update.
    event.respondWith((async()=>await caches.match('/',{cacheName:CACHE})||fetch(event.request).catch(()=>new Response('Connect once to install Cube Studio for offline use.',{status:503,headers:{'content-type':'text/plain'}})))());return;
  }
  if(SHELL.includes(url.pathname))event.respondWith((async()=>await caches.match(url.pathname,{cacheName:CACHE})||fetch(event.request))());
});
