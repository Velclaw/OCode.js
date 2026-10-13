import {NextResponse} from "next/server";

// Password-based admin authentication has been retired. All sign-ins must use
// the allowlisted GitHub OAuth flow at /api/auth/github.
export async function POST(){
  return NextResponse.json({error:"Password login is disabled. Use GitHub OAuth."},{status:410,headers:{"Cache-Control":"no-store"}});
}
