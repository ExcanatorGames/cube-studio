import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initMobileNavigation} from '../web/mobile-navigation.js';

function harness(){
  const handlers={},calls=[];let page='timer',busy=false,mobile=true,time=1000;
  const root={addEventListener(name,fn){handlers[name]=fn;}},view={innerWidth:390,performance:{now:()=>time},matchMedia:()=>({matches:mobile}),addEventListener(){}};
  initMobileNavigation({root,view,pages:['timer','history','insights'],getPage:()=>page,navigate:p=>{calls.push(p);page=p;},blocked:()=>busy});
  const target=kind=>({closest(selector){if(selector==='.sidebar nav')return kind==='nav'?{}:null;if(selector==='.page:not([hidden])')return kind==='outside'||kind==='nav'?null:{};if(selector==='button')return kind==='button'||kind==='nav'?{}:null;return ['input','select','textarea'].includes(kind)?{}:null;}});
  const event=(name,x,y,{id=1,kind='page',type='touch',detail=1}={})=>{const e={pointerType:type,pointerId:id,clientX:x,clientY:y,target:target(kind),cancelable:true,detail,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};handlers[name](e);return e;};
  const swipe=(dx,dy=0,opts={})=>{event('pointerdown',190,200,opts);event('pointermove',190+dx/2,200+dy/2,opts);time+=150;return event('pointerup',190+dx,200+dy,opts);};
  return {calls,event,swipe,setBusy:v=>busy=v,setMobile:v=>mobile=v,advance:ms=>time+=ms,getPage:()=>page};
}

test('single-finger horizontal swipes follow the tab order without wrapping',()=>{
  const h=harness();h.swipe(-110);h.swipe(-100);h.swipe(-100);h.swipe(110);h.swipe(110);h.swipe(110);
  assert.deepEqual(h.calls,['history','insights','history','timer']);
});
test('vertical scrolling, small movements, long holds and cancelled gestures never switch pages',()=>{
  const h=harness();h.swipe(-20);h.swipe(-90,100);
  h.event('pointerdown',190,200);h.event('pointermove',185,230);h.event('pointerup',80,230);
  h.event('pointerdown',190,200);h.advance(1000);h.event('pointerup',80,200);
  h.event('pointerdown',190,200);h.event('pointercancel',80,200);h.event('pointerup',80,200);
  assert.deepEqual(h.calls,[]);
});
test('two-finger timer gestures, active/fullscreen/modal states, mouse input and desktop are preserved',()=>{
  const h=harness();h.event('pointerdown',190,200);h.event('pointerdown',210,200,{id:2});h.event('pointerup',70,200);h.event('pointerup',80,200,{id:2});
  h.setBusy(true);h.swipe(-100);h.setBusy(false);h.setMobile(false);h.swipe(-100);h.setMobile(true);h.swipe(-100,0,{type:'mouse'});
  h.event('pointerdown',190,200);h.setBusy(true);h.event('pointerup',80,200);h.setBusy(false);
  assert.deepEqual(h.calls,[]);
});
test('editing controls and screen-edge gestures are ignored; bottom tabs accept swipes',()=>{
  const h=harness();for(const kind of ['input','select','textarea','button','outside'])h.swipe(-100,0,{kind});
  h.event('pointerdown',10,200);h.event('pointerup',110,200);
  assert.deepEqual(h.calls,[]);h.swipe(-100,0,{kind:'nav'});assert.deepEqual(h.calls,['history']);
});
test('a completed swipe suppresses its follow-up click, with keyboard and later taps unaffected',()=>{
  const h=harness();h.swipe(-100);assert.equal(h.event('click',80,200,{detail:0}).prevented,undefined);
  const click=h.event('click',80,200);assert.equal(click.prevented,true);assert.equal(click.stopped,true);
  h.swipe(-100);h.event('pointerdown',190,200,{kind:'button'});assert.equal(h.event('click',190,200,{kind:'button'}).prevented,undefined);h.event('pointerup',190,200,{kind:'button'});
  h.advance(500);assert.equal(h.event('click',80,200).prevented,undefined);
});
