export async function hashSyncCode(code){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code));return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function syncConfigured(env){return /^[a-f0-9]{64}$/.test(env.SYNC_CODE_HASH||'');}
export async function verifySyncCode(request,env){
  if(!syncConfigured(env))return false;
  const bearer=request.headers.get('authorization')||'';
  if(!/^Bearer [A-Za-z0-9_-]{43}$/.test(bearer))return false;
  const digest=await hashSyncCode(bearer.slice(7));let diff=0;
  for(let i=0;i<64;i++)diff|=digest.charCodeAt(i)^env.SYNC_CODE_HASH.charCodeAt(i);
  return diff===0;
}
