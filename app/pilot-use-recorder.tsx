'use client';
import {useEffect} from 'react';
import {supabase} from '@/lib/supabase';

export default function PilotUseRecorder(){
 useEffect(()=>{let cancelled=false;async function record(){const {data}=await supabase.auth.getUser();if(cancelled||!data.user)return;await supabase.rpc('record_pilot_daily_use',{})}void record();return()=>{cancelled=true}},[]);
 return null;
}
