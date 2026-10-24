const KEY='cube-studio-sync-key-v1';
export function getSyncCode(){try{return localStorage.getItem(KEY)||'';}catch{return '';}}
export function syncHeaders(){const code=getSyncCode();return code?{authorization:'Bearer '+code}:{};}
export function initConnection({busy,sync,notify}){
  const dialog=document.querySelector('#connect-dialog'),input=document.querySelector('#sync-code'),error=document.querySelector('#connect-error'),save=document.querySelector('#save-connection');
  const open=()=>{if(busy()){notify('Finish or cancel your solve before connecting.');return;}input.value='';error.textContent='';dialog.showModal();};
  document.querySelectorAll('[data-connect]').forEach(button=>button.onclick=open);
  const connect=async code=>{
    if(!/^[A-Za-z0-9_-]{43}$/.test(code)){error.textContent='Paste the full sync code from your private setup page.';return;}
    save.disabled=true;error.textContent='Connecting…';
    try{
      const response=await fetch('/api/solves',{headers:{authorization:'Bearer '+code},redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error(response.status===401?'Incorrect sync code.':'Connection failed. Try again.');
      localStorage.setItem(KEY,code);input.value='';dialog.close();notify('Connected.');await sync();
    }catch(e){error.textContent=e.message;}finally{save.disabled=false;}
  };
  save.onclick=()=>connect(input.value.trim());
  input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();save.click();}};
  document.querySelector('#disconnect-device').onclick=()=>{if(busy()){notify('Finish or cancel your solve before disconnecting.');return;}localStorage.removeItem(KEY);dialog.close();notify('Disconnected. Local history kept.');sync();};
  const hash=new URLSearchParams(location.hash.slice(1));
  if(hash.has('connect')){const code=hash.get('connect');history.replaceState(null,'',location.pathname+location.search);open();connect(code);}
}
