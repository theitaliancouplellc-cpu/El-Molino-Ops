'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function PWARegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
    const update = () => document.documentElement.dataset.network = navigator.onLine ? 'online' : 'offline';
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    void recordPageView();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  async function recordPageView(){
    try{
      const {data:u}=await supabase.auth.getUser();
      if(!u.user)return;
      const {data:p}=await supabase.from('profiles').select('location_id').eq('id',u.user.id).maybeSingle();
      await supabase.from('client_events').insert({
        location_id:p?.location_id??null,
        user_id:u.user.id,
        event_type:'page_view',
        route:window.location.pathname,
        metadata:{standalone:window.matchMedia('(display-mode: standalone)').matches,screen:`${window.screen.width}x${window.screen.height}`}
      });
    }catch{}
  }

  return null;
}
