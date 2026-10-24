import api from '../dist/cloudflare/api.js';
import {syncConfigured,verifySyncCode} from './sync-code.js';
export default {
  async fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    if(!path.startsWith('/api/'))return env.ASSETS.fetch(request);
    if(!syncConfigured(env))return Response.json({error:'Private cloud sync is not configured yet. Offline timing is available.',setupRequired:true},{status:503,headers:{'cache-control':'no-store'}});
    if(!await verifySyncCode(request,env))return Response.json({error:'Connect this device with your private sync code.'},{status:401,headers:{'cache-control':'no-store','www-authenticate':'Bearer'}});
    return api.fetch(request,env,ctx);
  }
};
