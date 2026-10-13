import {createHmac,timingSafeEqual} from "node:crypto"; import {cookies} from "next/headers";
export const SESSION_COOKIE="ocode_cloud_agent_session";const TTL=12*60*60*1000;
function secret(){const s=process.env.SESSION_SECRET;if(!s||s.length<32)throw new Error("SESSION_SECRET must contain at least 32 characters.");return s;}
function sign(s:string){return createHmac("sha256",secret()).update(s).digest("base64url");}
export function safeEqual(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function createSessionToken(now=Date.now()){const p=Buffer.from(JSON.stringify({sub:"admin",exp:now+TTL})).toString("base64url");return p+"."+sign(p);}
export function verifySessionToken(token?:string,now=Date.now()){if(!token)return false;const [p,s,e]=token.split(".");if(!p||!s||e)return false;try{if(!safeEqual(sign(p),s))return false;const d=JSON.parse(Buffer.from(p,"base64url").toString()) as {sub?:string;exp?:number};return d.sub==="admin"&&typeof d.exp==="number"&&d.exp>now;}catch{return false;}}
export async function isAuthenticated(){try{return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);}catch{return false;}}
export function cookieOptions(){return {httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax" as const,path:"/",maxAge:TTL/1000};}
