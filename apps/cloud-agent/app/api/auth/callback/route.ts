import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {allowedGitHubLogin,createSessionToken,cookieOptions,OAUTH_STATE_COOKIE,oauthStateCookieOptions,SESSION_COOKIE,safeEqual} from "@/lib/auth";

export const runtime="nodejs";
type GitHubToken={access_token?:string;error?:string};
type GitHubUser={login?:string;id?:number};

function returnTo(request:Request,code:string){return NextResponse.redirect(new URL("/?authError="+code,request.url));}
export async function GET(request:Request){
  const url=new URL(request.url);
  const code=url.searchParams.get("code");
  const returnedState=url.searchParams.get("state");
  const cookieState=(await cookies()).get(OAUTH_STATE_COOKIE)?.value;
  if(url.searchParams.has("error"))return returnTo(request,"cancelled");
  if(!code||!returnedState||!cookieState||!safeEqual(returnedState,cookieState))return returnTo(request,"state");
  const clientId=process.env.GITHUB_CLIENT_ID,clientSecret=process.env.GITHUB_CLIENT_SECRET,origin=process.env.APP_ORIGIN;
  if(!clientId||!clientSecret||!origin||!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32)return returnTo(request,"setup");
  let redirectUri:string;
  try{redirectUri=new URL("/api/auth/callback",origin).toString();}catch{return returnTo(request,"setup");}
  try{
    const tokenResponse=await fetch("https://github.com/login/oauth/access_token",{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json"},body:JSON.stringify({client_id:clientId,client_secret:clientSecret,code,redirect_uri:redirectUri}),cache:"no-store"});
    if(!tokenResponse.ok)return returnTo(request,"oauth");
    const token=await tokenResponse.json() as GitHubToken;
    if(!token.access_token)return returnTo(request,"oauth");
    const userResponse=await fetch("https://api.github.com/user",{headers:{Authorization:"Bearer "+token.access_token,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},cache:"no-store"});
    if(!userResponse.ok)return returnTo(request,"oauth");
    const user=await userResponse.json() as GitHubUser;
    if(!user.login||!allowedGitHubLogin(user.login))return returnTo(request,"denied");
    const response=NextResponse.redirect(new URL("/",origin));
    response.cookies.set(SESSION_COOKIE,createSessionToken(Date.now(),user.login),cookieOptions());
    response.cookies.set(OAUTH_STATE_COOKIE,"",{...oauthStateCookieOptions(),maxAge:0});
    return response;
  }catch{return returnTo(request,"oauth");}
}
