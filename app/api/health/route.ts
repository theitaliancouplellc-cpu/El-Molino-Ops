import { NextResponse } from 'next/server';

export const dynamic='force-dynamic';

export async function GET(){
  const checks:{name:string;ok:boolean;detail?:string}[]=[];
  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://asuvgjxdmxizbnjrccsz.supabase.co';
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_gtR8VfsQ5n-FPPbypnYKTw_f2k3Xyrk';
  try{
    const r=await fetch(`${supabaseUrl}/rest/v1/`,{headers:{apikey:key},cache:'no-store'});
    checks.push({name:'supabase_api',ok:r.status<500,detail:`HTTP ${r.status}`});
  }catch(e){checks.push({name:'supabase_api',ok:false,detail:e instanceof Error?e.message:'unreachable'});}
  checks.push({name:'ai_gateway_credentials',ok:Boolean(process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN),detail:(process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN)?'configured':'not configured'});
  checks.push({name:'supabase_public_config',ok:Boolean(supabaseUrl&&key),detail:'configured'});
  const ok=checks.every(c=>c.ok);
  return NextResponse.json({ok,service:'el-molino-ops',time:new Date().toISOString(),checks},{status:ok?200:503,headers:{'cache-control':'no-store'}});
}
