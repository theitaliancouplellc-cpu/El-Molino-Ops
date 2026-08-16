'use client';

import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';

export default function TeamLayout({children}:{children:React.ReactNode}){
 const [ready,setReady]=useState(false);
 useEffect(()=>{let mounted=true;void(async()=>{const {data:u}=await supabase.auth.getUser();if(!mounted)return;if(!u.user){location.href='/';return}const {data:p}=await supabase.from('profiles').select('app_role').eq('id',u.user.id).maybeSingle();if(!mounted)return;if(p?.app_role==='employee'){location.replace(`/employee/team${location.search||''}`);return}setReady(true)})();return()=>{mounted=false}},[]);
 if(!ready)return <div className="full-loader"><span>Opening Team Hub…</span></div>;
 return children;
}
