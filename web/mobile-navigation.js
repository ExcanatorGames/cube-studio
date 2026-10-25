export function initMobileNavigation({pages,getPage,navigate,blocked,root=document,view=window}){
  const pointers=new Set();let swipe=null,suppressClickUntil=0;
  const reset=()=>{pointers.clear();swipe=null;};
  const available=()=>view.matchMedia('(max-width:740px)').matches&&!blocked();
  const destination=dx=>pages[pages.indexOf(getPage())+(dx<0?1:-1)];
  root.addEventListener('pointerdown',event=>{
    suppressClickUntil=0;
    if(event.pointerType!=='touch')return;
    pointers.add(event.pointerId);
    if(pointers.size!==1){swipe=null;return;}
    const target=event.target,nav=target.closest('.sidebar nav');
    if(!available()||event.clientX<20||event.clientX>view.innerWidth-20||(!nav&&!target.closest('.page:not([hidden])'))||target.closest('input,textarea,select,a,[contenteditable="true"],[role="slider"]')||(!nav&&target.closest('button')))return;
    swipe={id:event.pointerId,x:event.clientX,y:event.clientY,start:view.performance.now(),horizontal:false};
  },true);
  root.addEventListener('pointermove',event=>{
    if(!swipe||event.pointerId!==swipe.id)return;
    if(!available()){swipe=null;return;}
    const dx=event.clientX-swipe.x,dy=event.clientY-swipe.y;
    if(!swipe.horizontal&&Math.abs(dy)>12&&Math.abs(dy)>=Math.abs(dx)){swipe=null;return;}
    if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.5&&destination(dx))swipe.horizontal=true;
    if(swipe.horizontal&&event.cancelable)event.preventDefault();
  },{capture:true,passive:false});
  root.addEventListener('pointerup',event=>{
    pointers.delete(event.pointerId);
    if(!swipe||event.pointerId!==swipe.id)return;
    const gesture=swipe;swipe=null;
    if(pointers.size||!available())return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y,next=destination(dx);
    if(!next||view.performance.now()-gesture.start>800||Math.abs(dx)<64||Math.abs(dy)>80||Math.abs(dx)<=Math.abs(dy)*1.5)return;
    if(event.cancelable)event.preventDefault();
    suppressClickUntil=view.performance.now()+450;
    navigate(next);
  },{capture:true,passive:false});
  root.addEventListener('pointercancel',event=>{pointers.delete(event.pointerId);if(swipe?.id===event.pointerId)swipe=null;},true);
  root.addEventListener('click',event=>{
    // A completed swipe must not activate the row or tab where the finger lifted.
    if(event.detail!==0&&view.performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();suppressClickUntil=0;}
  },true);
  root.addEventListener('visibilitychange',reset);
  view.addEventListener('blur',reset);
}
