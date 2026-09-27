import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {postgresAdapter,schemaStatements} from './postgres.mjs';
import {createLeaderboardAPI} from './api.mjs';
import {createVercelHandler} from './vercel-handler.mjs';

test('Postgres supports cumulative ranking, retries, rank reset and Vercel HTTPS requests',async()=>{
  const pg=new PGlite();
  try {
    for(const statement of schemaStatements)await pg.exec(statement);
    const db=postgresAdapter(async(q,p)=>(await pg.query(q,p)).rows);
    let now=100000;
    const api=createLeaderboardAPI(db,{now:()=>now});
    const call=(path,body)=>api(new Request('https://game.example'+path,body?{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://game.example'},body:JSON.stringify(body)}:undefined));
    const profile={playerId:'test-player-000001',name:'테스트',world:1,stage:0,jet:0,difficulty:'normal'};
    const {token}=await (await call('/api/runs',profile)).json();
    assert.equal((await call('/api/rankings',{token,score:100,cleared:false})).status,200);
    assert.equal((await call('/api/rankings',{token,score:100,cleared:false})).status,200);
    assert.equal((await call('/api/rankings',{token,score:200,cleared:false})).status,409);
    const ranked=await (await call('/api/runs',{...profile,mode:'rank'})).json();now+=60000;
    assert.equal((await call('/api/rankings',{token:ranked.token,score:3200,cleared:true})).status,200);
    let records=(await (await call('/api/rankings')).json()).records;
    assert.equal(records[0].score,3300);assert.equal(records[0].plays,2);assert.equal(records[0].bestDamage,3200);
    assert.equal((await call('/api/rank/reset',{playerId:profile.playerId})).status,200);
    records=(await (await call('/api/rankings')).json()).records;assert.equal(records[0].bestDamage,0);assert.equal(records[0].score,3300);
    const handler=createVercelHandler(async()=>api);
    const response=()=>({status(n){this.code=n;return this;},setHeader(){},end(body){this.body=JSON.parse(body);},json(body){this.body=body;}});
    const res=response();await handler({url:'/api/runs',method:'POST',headers:{host:'game.example','x-forwarded-proto':'https','content-type':'application/json',origin:'https://game.example'},body:profile},res);
    assert.equal(res.code,201);assert.ok(res.body.token);
    const bad=response();await handler({url:'/api/runs',method:'POST',headers:{host:'game.example','content-type':'application/json',origin:'https://other.example'},body:profile},bad);assert.equal(bad.code,403);
    const huge=response();await handler({url:'/api/runs',method:'POST',headers:{host:'game.example'},body:{name:'x'.repeat(5000)}},huge);assert.equal(huge.code,413);
  }finally{await pg.close();}
});
