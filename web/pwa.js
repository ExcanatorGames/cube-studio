export function initPWA({busy,notify}){
  const button=document.querySelector('#install-app'),dialog=document.querySelector('#install-dialog'),action=document.querySelector('#install-now'),help=document.querySelector('#install-help'),ready=document.querySelector('#offline-ready'),update=document.querySelector('#apply-update');
  let prompt,registration,reloading=false;
  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  function showHelp(){
    action.hidden=!prompt||standalone();
    help.textContent=standalone()?'Installed.':ios?'Safari: Share → Add to Home Screen.':'Browser menu → Install app or Add to Home screen.';
  }
  button.onclick=()=>{if(busy()){notify('Finish or cancel your solve before opening installation.');return;}showHelp();dialog.showModal();};
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();prompt=e;showHelp();});
  window.addEventListener('appinstalled',()=>{prompt=null;showHelp();notify('Cube Studio installed.');});
  action.onclick=async()=>{if(!prompt)return;const p=prompt;prompt=null;await p.prompt();await p.userChoice;showHelp();};
  update.onclick=()=>{if(busy()){notify('Finish or cancel your solve before updating.');return;}if(registration?.waiting){registration.waiting.postMessage({type:'SKIP_WAITING'});update.disabled=true;}};
  if(!('serviceWorker' in navigator)||!isSecureContext){ready.textContent='Offline installation requires HTTPS or localhost.';return;}
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloading||!update.disabled)return;reloading=true;location.reload();});
  navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(async reg=>{
    registration=reg;
    const waiting=()=>{if(reg.waiting){update.hidden=false;ready.textContent='Update available.';}};
    waiting();reg.addEventListener('updatefound',()=>{const installing=reg.installing;installing?.addEventListener('statechange',()=>{if(installing.state==='installed'){waiting();if(!reg.waiting)ready.textContent='Offline ready.';}});});
    await navigator.serviceWorker.ready;
    if(!reg.waiting)ready.textContent='Offline ready.';
    document.querySelector('#app-status').textContent=standalone()?'Installed':'Offline ready';
  }).catch(()=>{ready.textContent='Offline setup failed. Reconnect to retry.';});
  document.querySelector('#keep-storage').onclick=async()=>{const granted=await navigator.storage?.persist?.();notify(granted?'Offline storage enabled.':'Browser manages storage. Keep CSV backups.');};
  showHelp();
}
