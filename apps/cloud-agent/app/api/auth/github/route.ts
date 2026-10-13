import {randomBytes} from "node:crypto";
import {NextResponse} from "next/server";
import {OAUTH_STATE_COOKIE,oauthStateCookieOptions} from "@/lib/auth";

export const runtime="nodejs";
export async function GET(request:Request){
  const clientId=process.env.GITHUB_CLIENT_ID;
  const origin=process.env.APP_ORIGIN;
  if(!clientId||!origin||!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32){
    return NextResponse.redirect(new URL("/?authError=setup",request.url));
  }
  let callback:string;
  try{callback=new URL("/api/auth/callback",origin).toString();}catch{return NextResponse.redirect(new URL("/?authError=setup",request.url));}
  const state=randomBytes(32).toString("base64url");
  const url=new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id",clientId);
  url.searchParams.set("redirect_uri",callback);
  url.searchParams.set("scope","read:user");
  url.searchParams.set("state",state);
  const response=NextResponse.redirect(url);
  response.cookies.set(OAUTH_STATE_COOKIE,state,oauthStateCookieOptions());
  return response;
}
