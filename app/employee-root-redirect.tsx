'use client';

import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import {supabase} from '@/lib/supabase';

const STAFF_BLOCKED_PREFIXES=[
 '/admin','/manager','/performance','/logbook','/inventory','/safety','/maintenance','/incidents','/cash','/vendors','/procedures','/capture','/files','/menu','/ops','/tools',
];
const STAFF_BLOCKED_EXACT=new Set(['/schedule','/time-clock','/tips']);
const blockedForEmployee=(pathname:string)=>STAFF_BLOCKED_EXACT.has(pathname)||STAFF_BLOCKED_PREFIXES.some(prefix=>pathname===prefix||pathname.startsWith(`${prefix}/`));

export default function EmployeeRootRedirect(){
 const pathname=usePathname();
 useEffect(()=>{
  if(pathname!=='/'&&!blockedForEmployee(pathname))return;
  let active=true;
  void (async()=>{
   const {data:u}=await supabase.auth.getUser();
   if(!active||!u.user)return;
   const {data:p}=await supabase.from('profiles').select('app_role').eq('id',u.user.id).maybeSingle();
   if(active&&p?.app_role==='employee')window.location.replace('/employee');
  })();
  return()=>{active=false};
 },[pathname]);
 return null;
}
