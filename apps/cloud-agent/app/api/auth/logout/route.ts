import {NextResponse} from "next/server";
import {cookieOptions,OAUTH_STATE_COOKIE,oauthStateCookieOptions,SESSION_COOKIE} from "@/lib/auth";
export async function POST(){
  const response=NextResponse.json({ok:true});
  response.cookies.set(SESSION_COOKIE,"",{...cookieOptions(),maxAge:0});
  response.cookies.set(OAUTH_STATE_COOKIE,"",{...oauthStateCookieOptions(),maxAge:0});
  return response;
}
