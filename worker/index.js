const assets = /* ASSETS */ {};
const seed = /* SEED */ [];
const headers = {'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'same-origin'};
const json = (value, status=200) => Response.json(value,{status,headers});
export function validSolve(s) {
  return s && typeof s.id==='string' && s.id.length>0 && s.id.length<500 && typeof s.date==='string' && Number.isFinite(Date.parse(s.date)) && Number.isFinite(s.ms) && s.ms>0 && s.ms<86400000 && ['none','+2','dnf'].includes(s.penalty) && typeof s.scramble==='string' && s.scramble.length<2000 && ['assumed','confirmed','uncertain'].includes(s.trust) && typeof s.usedScramble==='boolean' && Array.isArray(s.splits) && s.splits.length<=20 && s.splits.every((x,i,a)=>typeof x.name==='string' && x.name.length<100 && Number.isFinite(x.ms) && x.ms>=0 && x.ms<=s.ms && (i===0 || x.ms>=a[i-1].ms)) && Number.isFinite(s.updatedAt) && s.updatedAt>0 && s.updatedAt<Date.now()+86400000 && (s.deleted===undefined || typeof s.deleted==='boolean') && (!s.note || typeof s.note==='string' && s.note.length<2000);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      // Hosted Sites enforce owner-private access before forwarding requests.
      if (!env.DB) return json({error:'Shared storage is unavailable. Your solves are kept on this device.'},503);
      try {
        if (url.pathname==='/api/solves' && request.method==='GET') {
          const { results } = await env.DB.prepare('SELECT data FROM solves').all();
          const records = new Map(seed.map(s=>[s.id,s]));
          for (const row of results) {const s=JSON.parse(row.data); records.set(s.id,s);}
          return json({solves:[...records.values()].map(s=>({...s,trust:'confirmed',usedScramble:true})),seedCount:seed.length});
        }
        if (url.pathname==='/api/solves' && request.method==='POST') {
          if (request.headers.get('origin') && request.headers.get('origin')!==url.origin) return json({error:'Invalid origin'},403);
          if (!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'Expected JSON'},415);
          const body = await request.text();
          if(body.length>2000000) return json({error:'Import too large. Use batches of 400 solves.'},413);
          let { solves } = JSON.parse(body);
          if(!Array.isArray(solves) || solves.length>400 || !solves.every(validSolve)) return json({error:'Invalid solve data'},400);
          solves=solves.map(s=>({...s,trust:'confirmed',usedScramble:true}));
          for(let i=0;i<solves.length;i+=80) await env.DB.batch(solves.slice(i,i+80).map(s=>env.DB.prepare('INSERT INTO solves(id,data,updated_at,deleted) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,deleted=excluded.deleted WHERE excluded.updated_at > solves.updated_at').bind(s.id,JSON.stringify(s),s.updatedAt,s.deleted?1:0)));
          return json({ok:true});
        }
        return json({error:'Not found'},404);
      } catch(error) {console.error(error);return json({error:'Could not sync. Your changes are saved on this device; try again.'},500);}
    }
    const asset=assets[url.pathname];
    if(!asset) return new Response('Not found',{status:404,headers});
    return new Response(asset[0],{headers:{...headers,'content-type':asset[1]+'; charset=utf-8'}});
  }
};
