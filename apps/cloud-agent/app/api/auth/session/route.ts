import {NextResponse} from "next/server";
import {authenticatedLogin} from "@/lib/auth";
export const runtime="nodejs";
export async function GET(){
  const user=await authenticatedLogin();
  return NextResponse.json({authenticated:Boolean(user),user},{headers:{"Cache-Control":"no-store"}});
}
