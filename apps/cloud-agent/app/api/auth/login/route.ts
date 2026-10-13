import {NextResponse} from "next/server";
import {cookieOptions,createSessionToken,safeEqual,SESSION_COOKIE} from "@/lib/auth";
import {isSameOriginRequest} from "@/lib/request-security";

export const runtime="nodejs";

const attempts=new Map<string,{count:number;resetAt:number}>();

export async function POST(request:Request){
  if(!isSameOriginRequest(
    request.url,
    request.headers.get("origin"),
    process.env.APP_ORIGIN,
    process.env.NODE_ENV==="production",
  )){
    return NextResponse.json({error:"Origin không hợp lệ hoặc bị thiếu."},{status:403});
  }

  const ip=(request.headers.get("x-forwarded-for")||"unknown").split(",")[0].trim();
  const now=Date.now();
  const state=attempts.get(ip);
  if(state&&state.resetAt>now&&state.count>=8){
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
    attempts.set(ip,{count:state&&state.resetAt>now?state.count+1:1,resetAt:now+900000});
    return NextResponse.json({error:"Mật khẩu không đúng."},{status:401});
  }

  attempts.delete(ip);
  const response=NextResponse.json({ok:true});
  response.cookies.set(SESSION_COOKIE,createSessionToken(),cookieOptions());
  return response;
}
