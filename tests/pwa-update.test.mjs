import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../web/pwa.js',import.meta.url),'utf8');
const emitter=()=>({handlers:{},addEventListener(name,fn){(this.handlers[name]??=[]).push(fn);},emit(name,event={}){for(const fn of this.handlers[name]||[])fn(event);}});
async function harness(waiting=false){
  const calls=[],nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,textContent:'',showModal(){calls.push('open:'+id);},close(){calls.push('close:'+id);}});return nodes.get(id);};
  const nextWorker={postMessage(message){calls.push(message.type);}},reg={...emitter(),waiting:waiting?nextWorker:null,update:async()=>{}};
  const serviceWorker={...emitter(),register:async()=>reg,ready:Promise.resolve(reg)};
  const document={...emitter(),hidden:false,querySelector:node},window=emitter();let busy=false;
  const context={document,window,navigator:{serviceWorker,platform:'Win32',userAgent:'test',onLine:true},matchMedia:()=>({matches:false}),isSecureContext:true,location:{reload(){calls.push('reload');}}};
  vm.runInNewContext(source.replace('export function','function')+'\nglobalThis.initPWA=initPWA;',context);
  context.initPWA({busy:()=>busy,notify:message=>calls.push('notify:'+message)});
  await Promise.resolve();await Promise.resolve();
  return {node,reg,serviceWorker,calls,setBusy(value){busy=value;},installUpdate(){reg.installing={...emitter(),state:'installing'};reg.emit('updatefound');reg.waiting=nextWorker;reg.installing.state='installed';reg.installing.emit('statechange');}};
}

test('header stays empty until an update is ready; activation waits for the user and a finished solve',async()=>{
  const h=await harness();assert.equal(h.node('#update-app').hidden,true);
  h.serviceWorker.emit('controllerchange');assert.ok(!h.calls.includes('reload'));
  h.installUpdate();assert.equal(h.node('#update-app').hidden,false);assert.equal(h.node('#apply-update').hidden,false);assert.ok(!h.calls.includes('SKIP_WAITING'));
  h.setBusy(true);h.node('#update-app').onclick();assert.ok(!h.calls.includes('SKIP_WAITING'));assert.ok(h.calls.some(c=>c.startsWith('notify:')));
  h.setBusy(false);h.node('#update-app').onclick();assert.equal(h.calls.filter(c=>c==='SKIP_WAITING').length,1);assert.equal(h.node('#update-app').disabled,true);
  h.serviceWorker.emit('controllerchange');h.serviceWorker.emit('controllerchange');assert.equal(h.calls.filter(c=>c==='reload').length,1);
});
test('an existing waiting update is shown immediately and installation opens from Settings',async()=>{
  const h=await harness(true);assert.equal(h.node('#update-app').hidden,false);
  h.node('#install-app').onclick();assert.ok(h.calls.includes('close:#settings-dialog'));assert.ok(h.calls.includes('open:#install-dialog'));
  h.node('#apply-update').onclick();assert.ok(h.calls.includes('SKIP_WAITING'));
});
