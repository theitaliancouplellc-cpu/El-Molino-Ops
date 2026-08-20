'use client';

import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import GlobalActions from './global-actions';

type AppRole='admin'|'manager'|'employee';

export default function RoleGlobalActions(){
 const [role,setRole]=useState<AppRole|null>(null);
 useEffect(()=>{
  let cancelled=false;
  async function sync(userId:string|null){
   if(!userId){if(!cancelled)setRole(null);return}
   const {data}=await supabase.from('profiles').select('app_role').eq('id',userId).maybeSingle();
   if(!cancelled)setRole((data?.app_role as AppRole|undefined)||null);
  }
  void supabase.auth.getSession().then(({data})=>sync(data.session?.user.id||null));
  const {data:listener}=supabase.auth.onAuthStateChange((_event,session)=>{void sync(session?.user.id||null)});
  return()=>{cancelled=true;listener.subscription.unsubscribe()};
 },[]);
 if(role==='manager')return null;
 return <GlobalActions/>;
}
