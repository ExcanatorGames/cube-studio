const assets = /* ASSETS */ {};
const seed = /* SEED */ [];
const headers = {'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'same-origin'};
const json = (value, status=200) => Response.json(value,{status,headers});
export function validSolve(s) {
  return s && typeof s.id==='string' && s.id.length>0 && s.id.length<500 && typeof s.date==='string' && Number.isFinite(Date.parse(s.date)) && Number.isFinite(s.ms) && s.ms>0 && s.ms<86400000 && ['none','+2','dnf'].includes(s.penalty) && typeof s.scramble==='string' && s.scramble.length<2000 && ['assumed','confirmed','uncertain'].includes(s.trust) && typeof s.usedScramble==='boolean' && Array.isArray(s.splits) && s.splits.length<=20 && s.splits.every((x,i,a)=>typeof x.name==='string' && x.name.length<100 && Number.isFinite(x.ms) && x.ms>=0 && x.ms<=s.ms && (i===0 || x.ms>=a[i-1].ms)) && Number.isFinite(s.updatedAt) && s.updatedAt>0 && s.updatedAt<Date.now()+86400000 && (s.deleted===undefined || typeof s.deleted==='boolean') && (!s.note || typeof s.note==='string' && s.note.length<2000);
}
export function validLessonAttempt(s) {
  return validSolve(s) && ['lessonId', 'caseId', 'completion'].every(key => typeof s[key] === 'string' && s[key].trim().length > 0 && s[key].length < 100);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      // Hosted Sites enforce owner-private access before forwarding requests.
      if (!env.DB) return json({error:'Shared storage is unavailable. Your solves are kept on this device.'},503);
      try {
        const lesson = url.pathname === '/api/lesson-attempts';
        const supported = lesson || url.pathname === '/api/solves';
        const table = lesson ? 'lesson_attempts' : 'solves';
        if (supported && request.method==='GET') {
          if (url.searchParams.has('cursor')) {
            const raw = url.searchParams.get('cursor');
            const cursor = Number(raw);
            if (!/^\d+$/.test(raw) || !Number.isSafeInteger(cursor)) return json({error:'Invalid sync cursor'},400);
            const {results} = await env.DB.prepare(`SELECT c.sequence, r.data FROM sync_changes c JOIN ${table} r ON r.id = c.id WHERE c.collection = ? AND c.sequence > ? ORDER BY c.sequence LIMIT 351`).bind(table, cursor).all();
            const page = results.slice(0, 350);
            const records = new Map((!lesson && cursor === 0 ? seed : []).map(s => [s.id, s]));
            for (const row of page) { const s = JSON.parse(row.data); records.set(s.id, s); }
            return json({solves:[...records.values()].map(s=>({...s,trust:'confirmed',usedScramble:true})),cursor:page.at(-1)?.sequence ?? cursor,hasMore:results.length > 350});
          }
          const { results } = await env.DB.prepare(`SELECT data FROM ${table}`).all();
          const records = new Map((lesson ? [] : seed).map(s=>[s.id,s]));
          for (const row of results) {const s=JSON.parse(row.data); records.set(s.id,s);}
          return json({solves:[...records.values()].map(s=>({...s,trust:'confirmed',usedScramble:true})),seedCount:lesson ? 0 : seed.length});
        }
        if (supported && request.method==='POST') {
          if (request.headers.get('origin') && request.headers.get('origin')!==url.origin) return json({error:'Invalid origin'},403);
          if (!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'Expected JSON'},415);
          const body = await request.text();
          if(body.length>2000000) return json({error:'Import too large. Use batches of 400 solves.'},413);
          let { solves } = JSON.parse(body);
          if(!Array.isArray(solves) || solves.length>400 || !solves.every(lesson ? validLessonAttempt : s => validSolve(s) && s.lessonId === undefined && s.caseId === undefined && s.completion === undefined)) return json({error:'Invalid solve data'},400);
          solves=solves.map(s=>({...s,trust:'confirmed',usedScramble:true}));
          for(let i=0;i<solves.length;i+=80) await env.DB.batch(solves.slice(i,i+80).map(s=>env.DB.prepare(`INSERT INTO ${table}(id,data,updated_at,deleted) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,deleted=excluded.deleted WHERE excluded.updated_at > ${table}.updated_at`).bind(s.id,JSON.stringify(s),s.updatedAt,s.deleted?1:0)));
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
