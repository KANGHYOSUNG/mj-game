import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../client/login.js',import.meta.url),'utf8').replace("import {createAuthClient} from '@neondatabase/auth';",'').replace(/init\(\);\s*$/,'window.initialized=init();');
async function setup({failure=false}={}){
 const guest={nickname:'손님',coins:5,owned:[0],selected:0,ownedParts:[],equippedParts:[]};
 const cloud={...guest,nickname:'계정',coins:30,owned:[0,1],selected:1};
 let session={id:'user-a',name:'계정'},state=structuredClone(guest),busy=false,version=3,posts=0;
 const elements={};const element=id=>elements[id] ||= {value:'',textContent:'',hidden:false,events:{},addEventListener(event,cb){this.events[event]=cb;},querySelectorAll(){return [];}};
 const auth={getSession:async()=>({data:{user:session}}),token:async()=>({data:{token:'signed-token'}}),signOut:async()=>{session=null;return {};}};
 const game={getGuestState:()=>structuredClone(guest),getState:()=>structuredClone(state),setBusy:v=>busy=v,apply:(_id,s)=>state=structuredClone(s),refreshRanking:async()=>{}};
 const win={gameAccount:game};
 const context={window:win,document:{getElementById:element,addEventListener(){}},createAuthClient:()=>auth,URL,location:{origin:'https://game.example',href:'https://game.example/'},setTimeout:()=>1,clearTimeout(){},AbortSignal,fetch:async(path,options)=>{
  if(path==='/api/auth-config')return {json:async()=>({authURL:'https://auth.example/auth'})};
  if(failure)throw new Error('network down');
  if(options.method==='POST'){posts++;const data=JSON.parse(options.body);assert.equal(data.version,version);Object.assign(cloud,data.state);version++;return {ok:true,json:async()=>({version})};}
  return {ok:true,json:async()=>({accountId:'acct-a',state:structuredClone(cloud),version})};
 }};
 vm.runInNewContext(source,context);await win.initialized;
 return {win,elements,guest,get state(){return state;},get busy(){return busy;},get posts(){return posts;},changeCoins(n){state.coins=n;},changeSession(){session={id:'user-b'};}};
}
test('login loads cloud without overwriting it with guest data; save and logout preserve separate profiles',async()=>{
 const app=await setup();assert.equal(app.state.coins,30);assert.equal(app.posts,0);assert.equal(app.busy,false);
 app.changeCoins(40);app.win.accountController.scheduleSave();await app.win.accountController.flush();assert.equal(app.posts,1);
 await app.elements['logout-button'].events.click();assert.equal(app.state.coins,5);assert.equal(app.elements['login-form'].hidden,false);
});
test('failed cloud load blocks gameplay and saving; changed login in another tab cannot save to wrong account',async()=>{
 const failed=await setup({failure:true});assert.equal(failed.busy,true);failed.win.accountController.scheduleSave();await failed.win.accountController.flush();assert.equal(failed.posts,0);
 const app=await setup();app.changeSession();app.changeCoins(99);app.win.accountController.scheduleSave();await assert.rejects(app.win.accountController.flush());assert.equal(app.posts,0);
});
