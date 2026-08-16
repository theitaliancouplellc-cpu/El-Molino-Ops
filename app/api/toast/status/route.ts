import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {toastConfigured} from '@/lib/toast';

export const dynamic='force-dynamic';

export async function GET(request:NextRequest){
 const auth=request.headers.get('authorization')||'';const token=auth.startsWith('Bearer ')?auth.slice(7).trim():'';
 if(!token)return NextResponse.json({configured:false,error:'Authentication required.'},{status:401});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)return NextResponse.json({configured:false,error:'Server configuration is incomplete.'},{status:500});
 const db=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const {data:user}=await db.auth.getUser(token);if(!user.user)return NextResponse.json({configured:false,error:'Authentication required.'},{status:401});
 const {data:profile}=await db.from('profiles').select('app_role').eq('id',user.user.id).single();
 if(!profile||!['admin','manager'].includes(profile.app_role))return NextResponse.json({configured:false,error:'Manager access required.'},{status:403});
 return NextResponse.json({configured:toastConfigured()});
}
