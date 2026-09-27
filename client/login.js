import {createAuthClient} from '@neondatabase/auth';
const byId=id=>document.getElementById(id);
const message=text=>{byId('account-status').textContent=text;};
let auth,user=null,version=0,loading=true,dirty=false,saving=null,timer=null,conflict=false,accountReady=false;
const game=window.gameAccount;
const sessionUser=async()=>{const result=await auth.getSession();if(result.error)throw new Error('로그인 정보를 확인하지 못했어요.');return result.data?.user || null;};
async function token(){
  if(!user)return null;
  const current=await sessionUser();
  if(current?.id!==user.id)throw new Error('다른 탭에서 계정이 바뀌었어요. 새로고침해 주세요.');
  const result=await auth.token();
  if(result.error || !result.data?.token)throw new Error('로그인이 만료됐어요. 다시 로그인해 주세요.');
  return result.data.token;
}
async function request(path,body){
  const bearer=await token();
  const response=await fetch(path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(bearer?{Authorization:'Bearer '+bearer}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  const result=await response.json();
  if(!response.ok){if(response.status===409)conflict=true;throw new Error(result.error || '연결하지 못했어요.');}
  return result;
}
function render(){
  byId('login-form').hidden=!!user;
  byId('account-actions').hidden=!user;
  byId('account-title').textContent=user?'☁️ 내 계정 · '+(user.name || '파일럿'):'🔐 조종사 로그인';
}
async function loadAccount(){
  loading=true;accountReady=false;game.setBusy(true);
  try{
    const result=await request('/api/account');version=result.version;conflict=false;dirty=false;
    const state=result.state || game.getGuestState();
    game.apply(result.accountId,state);
    if(!result.state){const saved=await request('/api/account',{state,version});version=saved.version;}
    accountReady=true;message('계정 연결 완료 · 코인·기체·부품이 자동 저장돼요.');
  }finally{loading=false;game.setBusy(!!user&&!accountReady);render();}
}
async function flush(){
  clearTimeout(timer);
  if(saving){await saving;if(dirty)return flush();return;}
  if(!user || !accountReady || loading || !dirty || conflict)return;
  dirty=false;
  const state=game.getState();
  saving=(async()=>{
    try{const result=await request('/api/account',{state,version});version=result.version;message('☁️ 계정에 저장했어요.');}
    catch(error){dirty=true;message(error.message+' 이 기기의 기록은 보관 중이에요.');throw error;}
    finally{saving=null;}
  })();
  await saving;
}
function scheduleSave(){
  if(!user || !accountReady || loading || conflict)return;
  dirty=true;clearTimeout(timer);timer=setTimeout(()=>flush().catch(()=>{}),1500);
}
window.accountController={token,scheduleSave,flush};
async function withBusy(action){
  const buttons=byId('account-panel').querySelectorAll('button');buttons.forEach(b=>b.disabled=true);game.setBusy(true);
  try{await action();}catch(error){message(error.message || '처리하지 못했어요. 다시 시도해 주세요.');}
  finally{buttons.forEach(b=>b.disabled=false);game.setBusy(!!user&&!accountReady);}
}
byId('login-form').addEventListener('submit',event=>{
  event.preventDefault();const signup=event.submitter?.id==='signup-button';
  withBusy(async()=>{
    if(!auth)throw new Error('로그인 연결을 준비 중이에요. 잠시 후 새로고침해 주세요.');
    const email=byId('login-email').value.trim(),password=byId('login-password').value;
    const result=signup?await auth.signUp.email({email,password,name:game.getState().nickname,callbackURL:location.origin+'/'}):await auth.signIn.email({email,password,callbackURL:location.origin+'/'});
    byId('login-password').value='';
    if(result.error)throw new Error(result.error.code==='EMAIL_NOT_VERIFIED'?'이메일로 받은 인증 링크를 눌러 주세요.':'이메일과 비밀번호를 확인해 주세요. 이미 가입했다면 로그인 버튼을 눌러 주세요.');
    user=await sessionUser();
    if(!user){message('가입 메일을 확인하고 인증한 뒤 로그인해 주세요.');return;}
    await loadAccount();await game.refreshRanking();
  });
});
byId('logout-button').addEventListener('click',()=>withBusy(async()=>{
  if(conflict)throw new Error('최신 기록 불러오기로 저장 충돌을 해결한 뒤 로그아웃해 주세요.');
  await flush();const result=await auth.signOut();if(result.error)throw new Error('로그아웃하지 못했어요. 다시 시도해 주세요.');
  user=null;game.apply(null,game.getGuestState());render();message('로그아웃했어요. 이 기기의 손님 기록으로 돌아왔어요.');await game.refreshRanking();
}));
byId('cloud-reload').addEventListener('click',()=>withBusy(async()=>{await loadAccount();}));
byId('forgot-password').addEventListener('click',()=>withBusy(async()=>{
  if(!auth)throw new Error('로그인 서비스에 연결되지 않았어요.');
  const email=byId('login-email').value.trim();if(!email)throw new Error('이메일을 먼저 입력해 주세요.');
  const result=await auth.requestPasswordReset({email,redirectTo:location.origin+'/'});
  if(result.error)throw new Error('메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.');
  message('가입된 이메일이라면 비밀번호 재설정 메일을 보냈어요.');
}));
byId('reset-password-form').addEventListener('submit',event=>{event.preventDefault();withBusy(async()=>{
  if(!auth)throw new Error('로그인 연결을 기다려 주세요.');
  const resetToken=new URL(location.href).searchParams.get('token');
  const result=await auth.resetPassword({newPassword:byId('new-password').value,token:resetToken});
  byId('new-password').value='';if(result.error)throw new Error('링크가 만료됐어요. 재설정 메일을 다시 받아 주세요.');
  history.replaceState({},'',location.pathname);byId('reset-password-form').hidden=true;message('비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요.');
});});
async function init(){
  try{
    const config=await (await fetch('/api/auth-config')).json();
    if(!config.authURL){message('로그인 연결을 준비 중이에요. 손님으로 플레이할 수 있어요.');return;}
    auth=createAuthClient(config.authURL);
    byId('reset-password-form').hidden=!new URL(location.href).searchParams.has('token');
    user=await sessionUser();
    if(user)await loadAccount();else message('이메일로 가입하세요. 첫 로그인 시 이 기기의 손님 아이템을 계정에 복사해요.');
  }catch{message('로그인 서버에 연결하지 못했어요. 손님 플레이는 가능해요.');}
  finally{loading=false;game.setBusy(!!user&&!accountReady);render();}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush().catch(()=>{});});
init();
