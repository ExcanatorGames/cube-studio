export function initPWA({busy,notify,onUpdateStatus=()=>{}}){
  const button=document.querySelector('#install-app'),dialog=document.querySelector('#install-dialog'),action=document.querySelector('#install-now'),help=document.querySelector('#install-help'),ready=document.querySelector('#offline-ready'),update=document.querySelector('#apply-update'),settingsUpdate=document.querySelector('#update-app');
  let prompt,registration,reloading=false,updating=false;
  settingsUpdate.hidden=true;
  onUpdateStatus(false);
  const displayMode=matchMedia('(display-mode: standalone)');
  let installed=false;
  const standalone=()=>installed||displayMode.matches||navigator.standalone===true;
  const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  function showHelp(){
    button.hidden=standalone();
    action.hidden=!prompt||standalone();
    help.textContent=standalone()?'Installed.':ios?'Safari: Share → Add to Home Screen.':'Browser menu → Install app or Add to Home screen.';
  }
  button.onclick=()=>{if(busy()){notify('Finish or cancel your solve before opening installation.');return;}document.querySelector('#settings-dialog').close();showHelp();dialog.showModal();};
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();prompt=e;showHelp();});
  displayMode.addEventListener?.('change',showHelp);
  window.addEventListener('appinstalled',()=>{installed=true;prompt=null;showHelp();notify('Cube Studio installed.');});
  action.onclick=async()=>{if(!prompt)return;const p=prompt;prompt=null;await p.prompt();await p.userChoice;showHelp();};
  function applyUpdate(){if(busy()){notify('Finish or cancel your solve before updating.');return;}if(registration?.waiting){updating=true;update.disabled=true;settingsUpdate.disabled=true;settingsUpdate.textContent='Updating…';registration.waiting.postMessage({type:'SKIP_WAITING'});}}
  update.onclick=applyUpdate;settingsUpdate.onclick=applyUpdate;
  if(!('serviceWorker' in navigator)||!isSecureContext){ready.textContent='Offline installation requires HTTPS or localhost.';return;}
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloading||!updating)return;reloading=true;location.reload();});
  navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(async reg=>{
    registration=reg;
    const waiting=()=>{const available=!!(reg.active&&reg.waiting);settingsUpdate.hidden=update.hidden=!available;onUpdateStatus(available);if(available)ready.textContent='Update available.';};
    waiting();reg.addEventListener('updatefound',()=>{const installing=reg.installing;installing?.addEventListener('statechange',()=>{if(installing.state==='installed'){waiting();if(!reg.waiting)ready.textContent='Offline ready.';}});});
    await navigator.serviceWorker.ready;
    if(!reg.waiting)ready.textContent='Offline ready.';
    document.querySelector('#app-status').textContent=standalone()?'Installed':'Offline ready';
  }).catch(()=>{ready.textContent='Offline setup failed. Reconnect to retry.';});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!busy()&&navigator.onLine)registration?.update().catch(()=>{});});
  document.querySelector('#keep-storage').onclick=async()=>{const granted=await navigator.storage?.persist?.();notify(granted?'Offline storage enabled.':'Browser manages storage. Keep CSV backups.');};
  showHelp();
}
