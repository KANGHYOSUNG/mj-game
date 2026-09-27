import {createHash} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify} from 'jose';
export function authBaseURL(){return (process.env.NEON_AUTH_BASE_URL || 'https://ep-long-sound-b8ulbrf4.neonauth.c-14.us-east-1.aws.neon.tech/neondb/auth').replace(/\/$/,'');}
export function accountId(subject){return 'acct-'+createHash('sha256').update(subject).digest('hex').slice(0,48);}
export function createIdentityVerifier(baseURL, key){
  const jwks=key || (baseURL ? createRemoteJWKSet(new URL(baseURL+'/.well-known/jwks.json')) : null);
  const cache=new WeakMap();
  return async function identity(request){
    if(cache.has(request))return cache.get(request);
    const pending=(async()=>{
      const header=request.headers.get('authorization');
      if(!header)return null;
      if(!jwks || !header.startsWith('Bearer '))throw new Error('Invalid login');
      const {payload}=await jwtVerify(header.slice(7),jwks,{issuer:[baseURL,new URL(baseURL).origin],requiredClaims:['sub','exp','iat'],algorithms:['RS256','ES256','EdDSA']});
      if(typeof payload.sub!=='string' || !payload.sub || payload.role==='anonymous' || payload.isAnonymous===true)throw new Error('Invalid login');
      return {id:accountId(payload.sub)};
    })();
    cache.set(request,pending);return pending;
  };
}
