import {createHmac,timingSafeEqual} from "node:crypto";
import {cookies} from "next/headers";

export const SESSION_COOKIE="ocode_cloud_agent_session";
const SESSION_TTL=12*60*60*1000;
export const OAUTH_STATE_COOKIE="ocode_github_oauth_state";
const OAUTH_STATE_TTL=10*60;

function secret(){
  const value=process.env.SESSION_SECRET;
  if(!value||value.length<32)throw new Error("SESSION_SECRET must contain at least 32 characters.");
  return value;
}
function sign(value:string){return createHmac("sha256",secret()).update(value).digest("base64url");}
export function safeEqual(a:string,b:string){
  const left=Buffer.from(a),right=Buffer.from(b);
  return left.length===right.length&&timingSafeEqual(left,right);
}
export function createSessionToken(now=Date.now(),githubLogin="test"){
  const payload=Buffer.from(JSON.stringify({sub:"github:"+githubLogin.toLowerCase(),exp:now+SESSION_TTL})).toString("base64url");
  return payload+"."+sign(payload);
}
export function verifySessionToken(token?:string,now=Date.now()){
  if(!token)return false;
  const [payload,signature,extra]=token.split(".");
  if(!payload||!signature||extra)return false;
  try{
    if(!safeEqual(sign(payload),signature))return false;
    const data=JSON.parse(Buffer.from(payload,"base64url").toString()) as {sub?:string;exp?:number};
    return typeof data.sub==="string"&&data.sub.startsWith("github:")&&data.sub.length>7&&typeof data.exp==="number"&&data.exp>now;
  }catch{return false;}
}
export function getSessionLogin(token?:string,now=Date.now()){
  if(!verifySessionToken(token,now))return null;
  try{
    const payload=token!.split(".")[0];
    const data=JSON.parse(Buffer.from(payload,"base64url").toString()) as {sub:string};
    return data.sub.slice(7);
  }catch{return null;}
}
export async function authenticatedLogin(){
  try{return getSessionLogin((await cookies()).get(SESSION_COOKIE)?.value);}catch{return null;}
}
export async function isAuthenticated(){return (await authenticatedLogin())!==null;}
export function cookieOptions(){return {httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax" as const,path:"/",maxAge:SESSION_TTL/1000};}
export function oauthStateCookieOptions(){return {httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax" as const,path:"/api/auth/callback",maxAge:OAUTH_STATE_TTL};}
export function allowedGitHubLogin(login:string){
  const allowed=(process.env.GITHUB_ALLOWED_USERS||"").split(",").map(v=>v.trim().toLowerCase()).filter(Boolean);
  return allowed.length>0&&allowed.includes(login.toLowerCase());
}
