import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdirSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLeaderboardAPI} from './api.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=dirname(here);
const databasePath=process.env.LEADERBOARD_DB || join(here,'data','leaderboard.sqlite');
mkdirSync(dirname(databasePath),{recursive:true});
const sqlite=new DatabaseSync(databasePath);
sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
sqlite.exec(readFileSync(join(here,'schema.sql'),'utf8'));
// Preserve existing player records when upgrading from per-run rankings.
if(!sqlite.prepare('PRAGMA table_info(runs)').all().some(c=>c.name==='mode')) sqlite.exec("ALTER TABLE runs ADD COLUMN mode TEXT NOT NULL DEFAULT 'stage' CHECK(mode IN ('stage','rank'))");
const db={get:async(q,p)=>sqlite.prepare(q).get(...p),all:async(q,p)=>sqlite.prepare(q).all(...p),run:async(q,p)=>sqlite.prepare(q).run(...p)};
const api=createLeaderboardAPI(db);
const gamePath=join(root,existsSync(join(root,'index.html')) ? 'index.html' : readdirSync(root).find(f=>f.endsWith('.html')));
const port=Number(process.env.PORT||8000),host=process.env.HOST||'0.0.0.0';
const server=createServer(async(req,res)=>{
  try {
    // HTTPS is commonly terminated by the hosting proxy before reaching Node.
    const protocol=req.headers['x-forwarded-proto']?.split(',')[0].trim()==='https' ? 'https' : 'http';
    const base=process.env.PUBLIC_ORIGIN || `${protocol}://${req.headers.host||'127.0.0.1'}`;
    const url=new URL(req.url,base);
    if(req.method==='GET' && url.pathname==='/healthz'){
      sqlite.prepare('SELECT 1').get();
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"ok":true}');return;
    }
    if(req.method==='GET' && url.pathname==='/api/auth-config'){
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"authURL":""}');return;
    }
    if(req.method==='GET' && url.pathname==='/login.js' && existsSync(join(root,'public','login.js'))){
      res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end(readFileSync(join(root,'public','login.js')));return;
    }
    if(url.pathname.startsWith('/api/')){
      const abort=new AbortController();
      req.on('aborted',()=>abort.abort());
      const request=new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:req,duplex:'half',signal:abort.signal});
      const result=await api(request);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
    }
    if(['GET','HEAD'].includes(req.method) && (url.pathname==='/' || url.pathname==='/index.html' || decodeURIComponent(url.pathname)==='/'+gamePath.split('/').pop())){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD' ? undefined : readFileSync(gamePath));return;}
    res.writeHead(404);res.end('Not found');
  } catch(error){res.writeHead(500);res.end('Service unavailable');}
});
server.listen(port,host,()=>console.log(`Game server ready on http://${host}:${server.address().port}`));

function shutdown() {
  server.close(()=>{sqlite.close();process.exit(0);});
  setTimeout(()=>process.exit(1),10000).unref();
}
process.once('SIGTERM',shutdown);
process.once('SIGINT',shutdown);
