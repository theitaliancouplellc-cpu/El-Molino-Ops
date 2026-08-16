'use client';

import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import {supabase} from '@/lib/supabase';

export default function EmployeeRootRedirect(){
 const pathname=usePathname();
 useEffect(()=>{
  if(pathname!=='/')return;
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
