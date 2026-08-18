import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {fetchToastSnapshot,toastConfigured} from '@/lib/toast';

export const dynamic='force-dynamic';

function dbForToken(token:string){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error('Supabase public configuration is missing.');
 return createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
function validDate(value:unknown){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:null}

export async function POST(request:NextRequest){
 const auth=request.headers.get('authorization')||'';const token=auth.startsWith('Bearer ')?auth.slice(7).trim():'';
 if(!token)return NextResponse.json({error:'Authentication required.'},{status:401});
 let businessDate:string|null=null;let restaurantGuid='';let syncId:string|null=null;let db:ReturnType<typeof dbForToken>|null=null;
 try{
  const body=await request.json().catch(()=>({})) as {businessDate?:unknown};businessDate=validDate(body.businessDate);
  if(!businessDate)return NextResponse.json({error:'Business date must be YYYY-MM-DD.'},{status:400});
  db=dbForToken(token);const {data:user,error:userError}=await db.auth.getUser(token);if(userError||!user.user)return NextResponse.json({error:'Authentication required.'},{status:401});
  const {data:profile,error:profileError}=await db.from('profiles').select('app_role,location_id').eq('id',user.user.id).single();
  if(profileError||!profile?.location_id||!['admin','manager'].includes(profile.app_role))return NextResponse.json({error:'Manager access required.'},{status:403});
  if(!toastConfigured())return NextResponse.json({error:'Toast API credentials are not configured on the server.',code:'TOAST_NOT_CONFIGURED'},{status:503});

  const {data:lease,error:leaseError}=await db.rpc('toast_begin_sync',{p_business_date:businessDate});
  if(leaseError)throw new Error(leaseError.message);
  syncId=typeof lease==='string'?lease:null;
  if(!syncId)return NextResponse.json(
   {error:'A Toast sync is already running for this location.',code:'TOAST_SYNC_IN_PROGRESS'},
   {status:409,headers:{'retry-after':'15'}},
  );

  const snapshot=await fetchToastSnapshot(businessDate);restaurantGuid=snapshot.restaurantGuid;
  const {data:counts,error:ingestError}=await db.rpc('ingest_toast_snapshot',{p_business_date:businessDate,p_employees:snapshot.employees,p_time_entries:snapshot.timeEntries,p_payments:snapshot.payments,p_cash_entries:snapshot.cashEntries,p_deposits:snapshot.deposits});
  if(ingestError)throw new Error(ingestError.message);
  const {error:finishError}=await db.rpc('toast_finish_sync',{p_sync_id:syncId,p_business_date:businessDate,p_restaurant_guid:restaurantGuid,p_status:'success',p_error:null,p_counts:counts??{}});
  if(finishError)throw new Error(finishError.message);
  return NextResponse.json({ok:true,businessDate,counts});
 }catch(error){
  const message=error instanceof Error?error.message:'Toast sync failed.';
  try{
   if(db&&syncId&&businessDate){
    await db.rpc('toast_finish_sync',{p_sync_id:syncId,p_business_date:businessDate,p_restaurant_guid:restaurantGuid||null,p_status:'error',p_error:message,p_counts:{}});
   }
  }catch{}
  return NextResponse.json({error:message},{status:500});
 }
}
