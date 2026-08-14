'use client';

import { supabase } from '@/lib/supabase';

type AIKnowledge={title:string;content:string;status:'approved';category:'live_operations'};
let cache:{expires:number;rows:AIKnowledge[]}|null=null;
const money=(n:unknown)=>`$${Number(n||0).toFixed(2)}`;
const short=(v:unknown,max=900)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);
const item=(title:string,content:string):AIKnowledge=>({title,content,status:'approved',category:'live_operations'});

export async function getOpsAIKnowledge():Promise<AIKnowledge[]>{
  if(cache&&cache.expires>Date.now())return cache.rows;
  const now=new Date(),past=new Date(now.getTime()-14*86400000).toISOString(),future=new Date(now.getTime()+14*86400000).toISOString(),pastDay=past.slice(0,10);
  const [perf,shifts,inventory,counts,logs,maintenance,training,incidents,vendors,temps,cash]=await Promise.all([
    supabase.from('restaurant_daily_performance').select('business_date,net_sales,food_sales,alcohol_sales,guest_count,labor_hours,labor_cost,overtime_hours,discounts,comps,voids,refunds').gte('business_date',pastDay).order('business_date',{ascending:false}).limit(14),
    supabase.from('schedule_shifts').select('starts_at,ends_at,status,employee_id,role_id,notes').gte('starts_at',past).lte('starts_at',future).order('starts_at').limit(80),
    supabase.from('inventory_items').select('id,name,category,unit,par_level,reorder_level,unit_cost,vendor_id').eq('active',true).order('name').limit(120),
    supabase.from('inventory_counts').select('id,counted_on,status').order('counted_on',{ascending:false}).limit(1),
    supabase.from('ops_records').select('kind,title,status,priority,data,occurred_at,assigned_employee_id,due_at').in('kind',['manager_log','shift_handoff','daily_recap']).is('deleted_at',null).order('created_at',{ascending:false}).limit(20),
    supabase.from('ops_records').select('kind,title,status,priority,data,occurred_at').in('kind',['maintenance_ticket','equipment','equipment_service']).is('deleted_at',null).order('created_at',{ascending:false}).limit(40),
    supabase.from('ops_records').select('kind,title,status,priority,data,assigned_employee_id,due_at').in('kind',['training_progress','certification','onboarding']).is('deleted_at',null).order('created_at',{ascending:false}).limit(50),
    supabase.from('ops_records').select('title,status,priority,data,occurred_at').eq('kind','incident').is('deleted_at',null).order('created_at',{ascending:false}).limit(20),
    supabase.from('restaurant_vendors').select('name,contact_name,phone,email,delivery_notes').eq('active',true).order('name').limit(50),
    supabase.from('ops_records').select('title,status,data,occurred_at').eq('kind','temperature_log').is('deleted_at',null).order('created_at',{ascending:false}).limit(30),
    supabase.from('cash_control_sessions').select('business_date,shift,expected_cash,actual_cash,deposit_amount,safe_count,petty_cash,status').gte('business_date',pastDay).order('business_date',{ascending:false}).limit(30)
  ]);
  const rows:AIKnowledge[]=[];
  if(perf.data?.length)rows.push(item('Live performance — recent business days',perf.data.map((r:any)=>`${r.business_date}: net ${money(r.net_sales)}, food ${money(r.food_sales)}, alcohol ${money(r.alcohol_sales)}, labor ${money(r.labor_cost)} / ${Number(r.labor_hours||0).toFixed(1)}h (${Number(r.net_sales)>0?(Number(r.labor_cost)/Number(r.net_sales)*100).toFixed(1):'0.0'}%), guests ${r.guest_count}, OT ${Number(r.overtime_hours||0).toFixed(1)}h, discounts ${money(r.discounts)}, comps ${money(r.comps)}, voids ${money(r.voids)}, refunds ${money(r.refunds)}`).join('\n').slice(0,7000)));
  if(shifts.data?.length)rows.push(item('Live schedule — two-week window',shifts.data.map((r:any)=>`${new Date(r.starts_at).toLocaleString()} to ${new Date(r.ends_at).toLocaleTimeString()}: status ${r.status}, employee ${r.employee_id||'open'}, role ${r.role_id||'none'}${r.notes?`, note ${short(r.notes,200)}`:''}`).join('\n').slice(0,6500)));
  if(inventory.data?.length){
    let countLines:any[]=[];const latest=(counts.data as any[])?.[0];if(latest){const c=await supabase.from('inventory_count_lines').select('item_id,quantity').eq('count_id',latest.id).limit(200);countLines=c.data??[];}
    const q=new Map(countLines.map((x:any)=>[x.item_id,Number(x.quantity)||0]));
    rows.push(item('Live inventory — current catalog and latest count',`Latest count: ${latest?.counted_on||'none'}.\n`+(inventory.data as any[]).map(r=>`${r.name}: ${q.has(r.id)?`${q.get(r.id)} ${r.unit} on hand`:'not counted'}, par ${r.par_level}, reorder ${r.reorder_level}, unit cost ${money(r.unit_cost)}, category ${r.category}`).join('\n').slice(0,7000)));
  }
  if(logs.data?.length)rows.push(item('Live MOD logbook and handoffs',(logs.data as any[]).map(r=>`${r.occurred_at||''} ${r.priority}/${r.status} ${r.title}: ${short(r.data?.summary||r.data?.follow_up||r.data,700)}`).join('\n').slice(0,6500)));
  if(maintenance.data?.length)rows.push(item('Live maintenance and equipment',(maintenance.data as any[]).map(r=>`${r.kind} ${r.priority}/${r.status} ${r.title}: ${short(r.data?.issue||r.data?.summary||r.data,550)}`).join('\n').slice(0,6000)));
  if(training.data?.length)rows.push(item('Live training and certifications',(training.data as any[]).map(r=>`${r.kind} ${r.status} ${r.title}, employee ${r.assigned_employee_id||'n/a'}, due ${r.due_at||r.data?.expires_on||'none'}`).join('\n').slice(0,5000)));
  if(incidents.data?.length)rows.push(item('Live incident register visible to this user',(incidents.data as any[]).map(r=>`${r.occurred_at||''} ${r.priority}/${r.status} ${r.title}: ${short(r.data?.description,600)}`).join('\n').slice(0,5000)));
  if(vendors.data?.length)rows.push(item('Live vendor directory',(vendors.data as any[]).map(r=>`${r.name}: ${r.contact_name||'no contact'} ${r.phone||''} ${r.email||''}; ${short(r.delivery_notes,240)}`).join('\n').slice(0,4500)));
  if(temps.data?.length)rows.push(item('Live food-safety temperature logs',(temps.data as any[]).map(r=>`${r.occurred_at||''} ${r.data?.equipment||r.title}: ${r.data?.temperature_f??'?'}F, range ${r.data?.min_f??'—'} to ${r.data?.max_f??'—'}, ${r.data?.in_range===false?'OUT OF RANGE':'in range'}${r.data?.corrective_action?`, action ${short(r.data.corrective_action,300)}`:''}`).join('\n').slice(0,5000)));
  if(cash.data?.length)rows.push(item('Live cash controls — recent shifts',(cash.data as any[]).map(r=>{const variance=Number(r.actual_cash||0)-Number(r.expected_cash||0);return `${r.business_date} ${r.shift}: expected ${money(r.expected_cash)}, actual ${money(r.actual_cash)}, over/short ${variance>=0?'+':''}${money(variance)}, deposit ${money(r.deposit_amount)}, safe ${money(r.safe_count)}, petty cash ${money(r.petty_cash)}, status ${r.status}`}).join('\n').slice(0,5000)));
  if(rows.length)rows.unshift(item('Live restaurant operations — current scope','Current live operational context can include sales and labor performance, staffing and schedule, inventory and food cost, MOD handoffs, maintenance, training and certifications, incident records visible to this user, vendor information, food-safety temperature checks, and manager cash controls when the signed-in account is allowed to read them. Use the detailed live records below for current operational questions; do not invent missing values.'));
  cache={expires:Date.now()+45_000,rows:rows.slice(0,12)};
  return cache.rows;
}

export function invalidateOpsAIContext(){cache=null;}
