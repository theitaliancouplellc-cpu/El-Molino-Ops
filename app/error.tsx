'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function ErrorPage({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
  useEffect(()=>{void report()},[error]);
  async function report(){try{const {data:u}=await supabase.auth.getUser();if(!u.user)return;const {data:p}=await supabase.from('profiles').select('location_id').eq('id',u.user.id).maybeSingle();await supabase.from('client_events').insert({location_id:p?.location_id??null,user_id:u.user.id,event_type:'client_error',route:window.location.pathname,message:error.message,metadata:{digest:error.digest??null,userAgent:navigator.userAgent}});}catch{}}
  return <main className="auth-wrap"><div className="auth-card"><div className="onboard-icon"><AlertTriangle/></div><h1>Something went wrong.</h1><p>The error was recorded so it can be diagnosed. Your data was not intentionally deleted.</p><button className="btn" onClick={reset}><RefreshCw size={16}/> Try again</button><a className="btn ghost" style={{marginTop:10,width:'100%'}} href="/">Return home</a></div></main>;
}
