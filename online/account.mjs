const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const partIds=['cooler','cannon','shield','pulse','wings'];
export function validateState(state){
  if(!state || !Number.isSafeInteger(state.coins) || state.coins<0 || state.coins>1000000000 || typeof state.nickname!=='string' || !state.nickname.trim() || state.nickname.length>12 || /[\u0000-\u001f\u007f]/.test(state.nickname))return null;
  if(!Array.isArray(state.owned) || !state.owned.includes(0) || state.owned.some(x=>!Number.isInteger(x)||x<0||x>4) || !state.owned.includes(state.selected))return null;
  if(!Array.isArray(state.ownedParts) || state.ownedParts.some(x=>!partIds.includes(x)) || !Array.isArray(state.equippedParts) || state.equippedParts.length>2 || state.equippedParts.some(x=>!state.ownedParts.includes(x)))return null;
  return {nickname:state.nickname.trim(),coins:state.coins,owned:[...new Set(state.owned)],selected:state.selected,ownedParts:[...new Set(state.ownedParts)],equippedParts:[...new Set(state.equippedParts)]};
}
export function createAccountAPI(db,identity){
  return async request=>{
    let user;try{user=await identity(request);}catch{return reply({error:'로그인이 만료됐어요. 다시 로그인해 주세요.'},401);}
    if(!user)return reply({error:'로그인이 필요해요.'},401);
    if(request.method==='GET'){
      const row=await db.get('SELECT state, version FROM game_accounts WHERE account_id = ?',[user.id]);
      return reply({accountId:user.id,state:row?JSON.parse(row.state):null,version:row?.version||0});
    }
    if(request.method!=='POST')return reply({error:'Not found'},404);
    if(request.headers.get('origin')!==new URL(request.url).origin || !request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Wrong origin'},403);
    let body;try{body=await request.json();}catch{return reply({error:'Invalid JSON'},400);}
    const state=validateState(body?.state);
    if(!state || !Number.isSafeInteger(body.version) || body.version<0)return reply({error:'Invalid save'},400);
    const row=await db.get('INSERT INTO game_accounts (account_id,state,version) VALUES (?,?,1) ON CONFLICT(account_id) DO UPDATE SET state=excluded.state, version=game_accounts.version+1 WHERE game_accounts.version=? RETURNING version',[user.id,JSON.stringify(state),body.version]);
    if(!row)return reply({error:'다른 기기에서 저장했어요. 로비에서 최신 기록을 불러와 주세요.'},409);
    return reply({saved:true,version:row.version});
  };
}
