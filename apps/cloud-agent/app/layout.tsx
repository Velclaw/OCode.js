import type {Metadata,Viewport} from "next";
import "./globals.css";
import {Analytics} from "@vercel/analytics/next";
export const metadata:Metadata={title:"OCode.js Cloud Agent",description:"OCode.js Cloud Agent — điều khiển agent cloud an toàn qua chat.",applicationName:"OCode.js Cloud Agent",manifest:"/manifest.json",appleWebApp:{capable:true,statusBarStyle:"black-translucent",title:"OCode.js"},icons:{icon:"/icon.svg",apple:"/icon.svg"}};
export const viewport:Viewport={width:"device-width",initialScale:1,viewportFit:"cover",themeColor:"#090d16"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="vi"><body>{children}<Analytics /></body></html>;}
