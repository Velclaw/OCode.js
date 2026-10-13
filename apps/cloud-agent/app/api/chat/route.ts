import {NextResponse} from "next/server";
import {isAuthenticated} from "@/lib/auth";
import {createTurn,databaseMode,finishTask,listMessages} from "@/lib/store";
import {runSkill,selectSkill} from "@/lib/agent";
import {isSameOriginRequest} from "@/lib/request-security";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(){
  if(!(await isAuthenticated()))return NextResponse.json({error:"Unauthorized"},{status:401});
  try{return NextResponse.json({messages:await listMessages()},{headers:{"Cache-Control":"no-store"}});}
  catch{return NextResponse.json({error:"Không đọc được lịch sử chat."},{status:503});}
}

export async function POST(request:Request){
  if(!(await isAuthenticated()))return NextResponse.json({error:"Unauthorized"},{status:401});
  if(!isSameOriginRequest(request.url,request.headers.get("origin"),process.env.APP_ORIGIN,process.env.NODE_ENV==="production")){
    return NextResponse.json({error:"Origin không hợp lệ hoặc bị thiếu."},{status:403});
  }
  let body:{text?:unknown};
  try{body=await request.json();}
  catch{return NextResponse.json({error:"JSON không hợp lệ."},{status:400});}
  if(typeof body.text!=="string"||!body.text.trim())return NextResponse.json({error:"Vui lòng nhập nội dung."},{status:400});
  if(body.text.length>4000)return NextResponse.json({error:"Tin nhắn tối đa 4.000 ký tự."},{status:413});
  try{
    const input=body.text.trim(),skill=selectSkill(input),task=await createTurn(input,skill);
    if(await databaseMode()==="memory")await finishTask(task.id,await runSkill(skill,input));
    return NextResponse.json({task,messages:await listMessages()},{status:202,headers:{"Cache-Control":"no-store"}});
  }catch{return NextResponse.json({error:"Không tạo được tác vụ. Kiểm tra DATABASE_URL và log máy chủ."},{status:503});}
}
