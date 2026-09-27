import {createIdentityVerifier,authBaseURL} from './identity.mjs';
import {createAccountAPI} from './account.mjs';
import {neon} from '@neondatabase/serverless';
import {createLeaderboardAPI} from './api.mjs';
import {postgresAdapter,initializePostgres} from './postgres.mjs';
let apiPromise;
function getAPI(){
  if(!apiPromise){
    apiPromise=(async()=>{
      const connection=process.env.DATABASE_URL || process.env.POSTGRES_URL;
      if(!connection)throw new Error('Connect the project to its Neon database in Vercel Storage.');
      const sql=neon(connection);
      await initializePostgres(sql);
      const db=postgresAdapter((query,args)=>sql.query(query,args));
      const identity=createIdentityVerifier(authBaseURL());
      const account=createAccountAPI(db,identity);
      const ranking=createLeaderboardAPI(db,{
        resolvePlayerId:async(request,claimed)=>{
          const user=await identity(request);
          if(user)return user.id;
          if(typeof claimed==='string' && claimed.startsWith('acct-'))throw new Error('Login required');
          return claimed;
        },
        authorizeRun:async(request,run)=>{
          const user=await identity(request);
          return run.player_id.startsWith('acct-') ? user?.id===run.player_id : !user;
        }
      });
      return request=>new URL(request.url).pathname==='/api/account' ? account(request) : ranking(request);
    })().catch(error=>{apiPromise=null;throw error;});
  }
  return apiPromise;
}
export function createVercelHandler(loadAPI=getAPI){
  return async function handler(req,res){
    try{
      const headers=new Headers();
      for(const [key,value] of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
      const protocol=headers.get('x-forwarded-proto')?.split(',')[0].trim()==='http'?'http':'https';
      const base=process.env.PUBLIC_ORIGIN || `${protocol}://${headers.get('host')}`;
      const body=['GET','HEAD'].includes(req.method)?undefined:typeof req.body==='string'?req.body:Buffer.isBuffer(req.body)?req.body:JSON.stringify(req.body ?? null);
      if(body && Buffer.byteLength(body)>4096){res.status(413).json({error:'Too large'});return;}
      const request=new Request(new URL(req.url,base),{method:req.method,headers,body});
      const api=await loadAPI();
      const response=await api(request);
      res.status(response.status);
      response.headers.forEach((value,key)=>res.setHeader(key,value));
      res.end(await response.text());
    }catch{
      res.setHeader('Cache-Control','no-store');
      res.status(503).json({error:'Leaderboard unavailable. Check database connection.'});
    }
  };
}
export default createVercelHandler();
