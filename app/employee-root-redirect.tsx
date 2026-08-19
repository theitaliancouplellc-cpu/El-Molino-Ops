'use client';

import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import {supabase} from '@/lib/supabase';
import {isStaffRouteReleased} from '@/lib/staff-features';

const STAFF_BLOCKED_PREFIXES=[
 '/admin','/manager','/performance','/logbook','/inventory','/safety','/maintenance','/incidents','/cash','/vendors','/procedures','/capture','/files','/menu','/ops','/tools',
];
const STAFF_BLOCKED_EXACT=new Set(['/schedule','/time-clock','/tips']);
const blockedForEmployee=(pathname:string)=>STAFF_BLOCKED_EXACT.has(pathname)||STAFF_BLOCKED_PREFIXES.some(prefix=>pathname===prefix||pathname.startsWith(`${prefix}/`));
const lifecycleException=(pathname:string)=>pathname==='/employee/access'||pathname==='/account';

type SetupState={status:string;employment_status?:'active'|'suspended'|'inactive'|null;access_allowed?:boolean};

export default function EmployeeRootRedirect(){
 const pathname=usePathname();
 useEffect(()=>{
  let mounted=true;
  void (async()=>{
   const {data:u}=await supabase.auth.getUser();
   if(!mounted||!u.user)return;
   const {data:p}=await supabase.from('profiles').select('app_role').eq('id',u.user.id).maybeSingle();
   if(!mounted||p?.app_role!=='employee')return;
   const {data:s}=await supabase.rpc('employee_self_setup_status',{});
   if(!mounted)return;
   const setup=(s||{status:'not_started',access_allowed:false}) as SetupState;
   if(setup.status!=='approved'){
    if(pathname!=='/employee/setup'&&pathname!=='/account')window.location.replace('/employee/setup');
    return;
   }
   if(setup.employment_status!=='active'||setup.access_allowed===false){
    if(!lifecycleException(pathname))window.location.replace('/employee/access');
    return;
   }
   if(pathname==='/employee/access'||pathname==='/employee/setup'||pathname==='/'||blockedForEmployee(pathname)||!isStaffRouteReleased(pathname))window.location.replace('/employee');
  })();
  return()=>{mounted=false};
 },[pathname]);
 return null;
}
