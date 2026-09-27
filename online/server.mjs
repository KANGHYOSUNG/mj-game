import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLeaderboardAPI} from './api.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=dirname(here);
mkdirSync(join(here,'data'),{recursive:true});
const sqlite=new DatabaseSync(process.env.LEADERBOARD_DB || join(here,'data','leaderboard.sqlite'));
sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
sqlite.exec(readFileSync(join(here,'schema.sql'),'utf8'));
// Preserve existing player records when upgrading from per-run rankings.
if(!sqlite.prepare('PRAGMA table_info(runs)').all().some(c=>c.name==='mode')) sqlite.exec("ALTER TABLE runs ADD COLUMN mode TEXT NOT NULL DEFAULT 'stage' CHECK(mode IN ('stage','rank'))");
const db={get:async(q,p)=>sqlite.prepare(q).get(...p),all:async(q,p)=>sqlite.prepare(q).all(...p),run:async(q,p)=>sqlite.prepare(q).run(...p)};
const api=createLeaderboardAPI(db);
const gamePath=join(root,readdirSync(root).find(f=>f.endsWith('.html')));
const port=Number(process.env.PORT||8001),host=process.env.HOST||'127.0.0.1';
const server=createServer(async(req,res)=>{
  try {
    const base=`http://${req.headers.host||'127.0.0.1'}`,url=new URL(req.url,base);
    if(url.pathname.startsWith('/api/')){
      const abort=new AbortController();
      req.on('aborted',()=>abort.abort());
      const request=new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:req,duplex:'half',signal:abort.signal});
      const result=await api(request);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
    }
    if(req.method==='GET' && (url.pathname==='/' || decodeURIComponent(url.pathname).endsWith('/'+gamePath.split('/').pop()))){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(readFileSync(gamePath));return;}
    res.writeHead(404);res.end('Not found');
  } catch(error){res.writeHead(500);res.end('Service unavailable');}
});
server.listen(port,host,()=>console.log(`Game server ready on http://${host}:${port}`));
