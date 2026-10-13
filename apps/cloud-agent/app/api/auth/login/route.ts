import {NextResponse} from "next/server";
import {cookieOptions,createSessionToken,safeEqual,SESSION_COOKIE} from "@/lib/auth";
import {isSameOriginRequest} from "@/lib/request-security";
import {loginRateLimiter} from "@/lib/login-rate-limit";

export const runtime="nodejs";

export async function POST(request:Request){
  if(!isSameOriginRequest(
    request.url,
    request.headers.get("origin"),
    process.env.APP_ORIGIN,
    process.env.NODE_ENV==="production",
  )){
    return NextResponse.json({error:"Origin không hợp lệ hoặc bị thiếu."},{status:403});
  }

  // X-Forwarded-For is still proxy-dependent; use a trusted proxy policy before
  // public multi-instance exposure. The limiter itself is bounded in memory.
  const ip=(request.headers.get("x-forwarded-for")||"unknown").split(",")[0].trim();
  const now=Date.now();
  if(loginRateLimiter.isBlocked(ip,now)){
    return NextResponse.json({error:"Quá nhiều lần thử. Hãy chờ 15 phút."},{status:429});
  }

  let body:{password?:unknown};
  try{body=await request.json();}
  catch{return NextResponse.json({error:"JSON không hợp lệ."},{status:400});}

  const expected=process.env.ADMIN_PASSWORD;
  if(!expected||expected.length<16||!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32){
    return NextResponse.json({error:"Máy chủ chưa cấu hình ADMIN_PASSWORD (>=16 ký tự) và SESSION_SECRET (>=32 ký tự)."},{status:503});
  }

  if(!safeEqual(typeof body.password==="string"?body.password:"",expected)){
    loginRateLimiter.recordFailure(ip,now);
    return NextResponse.json({error:"Mật khẩu không đúng."},{status:401});
  }

  loginRateLimiter.clear(ip);
  const response=NextResponse.json({ok:true});
  response.cookies.set(SESSION_COOKIE,createSessionToken(),cookieOptions());
  return response;
}
