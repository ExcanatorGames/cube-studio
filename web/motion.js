// Motion is presentation only: state changes and timer input always happen first.
export function createMotion(view=window){
  const reduced=view.matchMedia('(prefers-reduced-motion: reduce)'),active=new Map();
  const document=view.document;
  let transition=null,generation=0;
  function settle(){for(const animation of active.values())animation.cancel();active.clear();}
  function clear(){
    settle();
    generation++;transition?.skipTransition();transition=null;
    if(document)delete document.documentElement.dataset.motion;
  }
  reduced.addEventListener?.('change',event=>{
    if(!event.matches)return;
    settle();
    // Let the latest requested page/fullscreen state commit even when motion is skipped.
    transition?.skipTransition();
  });
  function play(element,keyframes,options={}){
    if(!element)return;
    active.get(element)?.cancel();active.delete(element);
    if(reduced.matches||!element.animate||!element.getClientRects().length)return;
    const animation=element.animate(keyframes,{duration:220,easing:'cubic-bezier(.2,.7,.2,1)',fill:'backwards',...options});
    active.set(element,animation);
    const cleanup=()=>{if(active.get(element)===animation)active.delete(element);};
    animation.finished.then(cleanup,cleanup);
    return animation;
  }
  function reveal(element,{delay=0,distance=6,duration=220}={}){
    return play(element,[{opacity:0,translate:`0 ${distance}px`},{opacity:1,translate:'0 0'}],{delay,duration});
  }
  function swap(kind,change,{direction=1,immediate=false}={}){
    const ticket=++generation;
    transition?.skipTransition();transition=null;
    if(!document?.startViewTransition||reduced.matches||immediate){
      if(document)delete document.documentElement.dataset.motion;
      change();return false;
    }
    document.documentElement.dataset.motion=kind;
    document.documentElement.style.setProperty('--page-direction',direction);
    const next=document.startViewTransition(()=>{if(ticket===generation)change();});
    transition=next;
    next.ready.catch(()=>{}); // Skipping a transition rejects ready, but still runs its callback.
    next.finished.catch(()=>{}).then(()=>{
      if(transition===next){transition=null;delete document.documentElement.dataset.motion;}
    });
    return true;
  }
  function layout(elements,change){
    const before=elements.map(element=>{
      active.get(element)?.cancel();active.delete(element);
      return element?.getClientRects().length?element.getBoundingClientRect():null;
    });
    // Never wait for an animation to start, stop, save or navigate.
    change();
    elements.forEach((element,i)=>{
      if(!element||!before[i]||!element.getClientRects().length)return;
      const after=element.getBoundingClientRect(),old=before[i];
      if(!after.width||!after.height)return;
      const dx=old.left-after.left,dy=old.top-after.top;
      if(Math.abs(dx)+Math.abs(dy)>1){
        play(element,[{translate:`${dx}px ${dy}px`},{translate:'0 0'}]);
      }
    });
  }
  return {play,reveal,layout,swap,clear,settle};
}
