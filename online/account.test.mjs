import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {generateKeyPair,SignJWT} from 'jose';
import {createIdentityVerifier,accountId} from './identity.mjs';
import {createAccountAPI} from './account.mjs';
import {postgresAdapter,schemaStatements} from './postgres.mjs';
import {createLeaderboardAPI} from './api.mjs';

test('signed identity isolates accounts, prevents rank impersonation and rejects stale saves',async()=>{
 const pg=new PGlite();
 try{
  for(const s of schemaStatements)await pg.exec(s);
  const db=postgresAdapter(async(q,p)=>(await pg.query(q,p)).rows);
  const keys=await generateKeyPair('ES256');
  const origin='https://auth.example/auth';
  const sign=(sub,expired=false)=>new SignJWT({}).setProtectedHeader({alg:'ES256'}).setIssuer(origin).setSubject(sub).setIssuedAt().setExpirationTime(expired?'0s':'5m').sign(keys.privateKey);
  const a=await sign('player-a'),b=await sign('player-b');
  const identity=createIdentityVerifier(origin,keys.publicKey),api=createAccountAPI(db,identity);
  const call=(bearer,body)=>api(new Request('https://game.example/api/account',{method:body?'POST':'GET',headers:{Origin:'https://game.example','Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},body:body?JSON.stringify(body):undefined}));
  assert.equal((await call(null)).status,401);assert.equal((await call('forged')).status,401);assert.equal((await call(await sign('player-a',true))).status,401);
  const state={nickname:'조종사',coins:12,owned:[0,1],selected:1,ownedParts:['cooler'],equippedParts:['cooler']};
  assert.equal((await call(a,{state,version:0})).status,200);
  assert.equal((await (await call(b)).json()).state,null);
  assert.equal((await call(a,{state:{...state,coins:20},version:0})).status,409);
  assert.equal((await call(a,{state:{...state,coins:20},version:1})).status,200);
  assert.equal((await (await call(a)).json()).state.coins,20);
  assert.equal((await call(a,{state:{...state,coins:-1},version:2})).status,400);
  const rankings=createLeaderboardAPI(db,{resolvePlayerId:async(req,claimed)=>{const u=await identity(req);if(u)return u.id;if(claimed?.startsWith('acct-'))throw new Error();return claimed;},authorizeRun:async(req,run)=>{const u=await identity(req);return run.player_id.startsWith('acct-')?u?.id===run.player_id:!u;}});
  const rankCall=(bearer,path,body)=>rankings(new Request('https://game.example'+path,{method:'POST',headers:{Origin:'https://game.example','Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},body:JSON.stringify(body)}));
  const profile={name:'조종사',playerId:accountId('player-a'),world:1,stage:0,jet:0,difficulty:'normal'};
  assert.equal((await rankCall(null,'/api/runs',profile)).status,401);
  const {token}=await (await rankCall(a,'/api/runs',profile)).json();
  assert.equal((await rankCall(b,'/api/rankings',{token,score:100,cleared:false})).status,403);
  assert.equal((await rankCall(null,'/api/rankings',{token,score:100,cleared:false})).status,403);
  assert.equal((await rankCall(a,'/api/rankings',{token,score:100,cleared:false})).status,200);
  assert.equal((await rankCall(null,'/api/rank/reset',{playerId:accountId('player-a')})).status,401);
 }finally{await pg.close();}
});
