// Motion is presentation only: state changes and timer input always happen first.
export function createMotion(view=window){
  const reduced=view.matchMedia('(prefers-reduced-motion: reduce)'),active=new Map();
  function clear(){for(const animation of active.values())animation.cancel();active.clear();}
  reduced.addEventListener?.('change',event=>{if(event.matches)clear();});
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
  function layout(elements,change,{surface=false}={}){
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
      if(surface){
        play(element,[{transformOrigin:'0 0',transform:`translate(${dx}px,${dy}px) scale(${old.width/after.width},${old.height/after.height})`},{transformOrigin:'0 0',transform:'none'}],{duration:240});
      }else if(Math.abs(dx)+Math.abs(dy)>1){
        play(element,[{translate:`${dx}px ${dy}px`},{translate:'0 0'}]);
      }
    });
  }
  return {play,reveal,layout,clear};
}
