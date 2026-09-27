import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

test('one service serves game and HTTPS leaderboard, preserving records across restart',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'mj-hosting-'));
  let child;
  async function start(){
    child=spawn(process.execPath,['online/server.mjs'],{env:{...process.env,PUBLIC_ORIGIN:'',HOST:'127.0.0.1',PORT:'0',LEADERBOARD_DB:join(dir,'nested','scores.sqlite')},stdio:['ignore','pipe','pipe']});
    const url=await new Promise((resolve,reject)=>{
      let output='';const timer=setTimeout(()=>reject(new Error('Server startup timed out')),10000);
      child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);reject(new Error('Server exited '+code));});
      child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/http:\/\/127.0.0.1:(\d+)/);if(match){clearTimeout(timer);resolve(match[0]);}});
    });
    return url;
  }
  async function stop(){const closed=once(child,'exit');child.kill('SIGTERM');await closed;child=null;}
  try{
    let base=await start();
    assert.equal((await fetch(base+'/healthz')).status,200);
    assert.match(await (await fetch(base)).text(),/rank-challenge-btn/);
    assert.equal((await fetch(base+'/index.html',{method:'HEAD'})).status,200);
    const post=(path,body,origin=base.replace('http:','https:'))=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-Proto':'https',Origin:origin},body:JSON.stringify(body)});
    const profile={playerId:'hosting-player-00001',name:'테스트',world:1,stage:0,jet:0,difficulty:'normal',mode:'stage'};
    assert.equal((await post('/api/runs',profile,'https://unrelated.example')).status,403);
    const begun=await post('/api/runs',profile);assert.equal(begun.status,201);const {token}=await begun.json();
    assert.equal((await post('/api/rankings',{token,score:100,cleared:false})).status,200);
    await stop();base=await start();
    const ranking=await (await fetch(base+'/api/rankings')).json();assert.equal(ranking.records[0].score,100);assert.equal(ranking.records[0].name,'테스트');
    assert.equal((await post('/api/rank/reset',{playerId:profile.playerId})).status,200);
    assert.equal((await (await fetch(base+'/api/rankings')).json()).records[0].score,100);
  }finally{if(child)await stop();await rm(dir,{recursive:true,force:true});}
});
