import { NextResponse } from 'next/server';
import { configuredFreeProviders } from '@/lib/free-ai-router';

export const dynamic='force-dynamic';

type Check={name:string;ok:boolean;required:boolean;detail?:string};

export async function GET(){
  const checks:Check[]=[];
  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://asuvgjxdmxizbnjrccsz.supabase.co';
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'sb_publishable_gtR8VfsQ5n-FPPbypnYKTw_f2k3Xyrk';
  try{
    const r=await fetch(`${supabaseUrl}/rest/v1/`,{headers:{apikey:key},cache:'no-store'});
    checks.push({name:'supabase_api',ok:r.status<500,required:true,detail:`HTTP ${r.status}`});
  }catch(e){checks.push({name:'supabase_api',ok:false,required:true,detail:e instanceof Error?e.message:'unreachable'});}
  try{
    const r=await fetch(`${supabaseUrl}/rest/v1/ops_records?select=id&limit=0`,{headers:{apikey:key},cache:'no-store'});
    checks.push({name:'operations_schema',ok:r.status<500,required:true,detail:`HTTP ${r.status}`});
  }catch(e){checks.push({name:'operations_schema',ok:false,required:true,detail:e instanceof Error?e.message:'unreachable'});}
  const providers=configuredFreeProviders();
  const active=Object.entries(providers).filter(([,v])=>v).map(([k])=>k);
  checks.push({name:'free_ai_router',ok:true,required:false,detail:active.length?`${active.length} provider(s) configured: ${active.join(', ')}`:'local fallback only; external free providers not configured'});
  checks.push({name:'supabase_public_config',ok:Boolean(supabaseUrl&&key),required:true,detail:'configured'});
  const ok=checks.filter(c=>c.required).every(c=>c.ok);
  return NextResponse.json({ok,service:'el-molino-ops',time:new Date().toISOString(),checks,ai:{mode:'free-only-rotation',providers}}, {status:ok?200:503,headers:{'cache-control':'no-store'}});
}
