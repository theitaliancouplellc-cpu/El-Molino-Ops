'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function PWARegister() {
  useEffect(() => {
    let registration: ServiceWorkerRegistration | null = null;
    let reloading = false;

    const adoptUpdate = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    const checkForUpdate = async () => {
      try {
        if (!registration) return;
        await registration.update();
        if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } catch {}
    };

    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then(async reg => {
          registration = reg;
          await checkForUpdate();

          reg.addEventListener('updatefound', () => {
            const worker = reg.installing;
            if (!worker) return;
            worker.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                worker.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          });
        })
        .catch(() => undefined);

      navigator.serviceWorker.addEventListener('controllerchange', adoptUpdate);
    }

    const updateNetworkState = () => {
      document.documentElement.dataset.network = navigator.onLine ? 'online' : 'offline';
    };
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') void checkForUpdate();
    };
    const checkOnPageShow = () => void checkForUpdate();
    const checkOnFocus = () => void checkForUpdate();

    updateNetworkState();
    window.addEventListener('online', updateNetworkState);
    window.addEventListener('offline', updateNetworkState);
    document.addEventListener('visibilitychange', checkWhenVisible);
    window.addEventListener('pageshow', checkOnPageShow);
    window.addEventListener('focus', checkOnFocus);
    void recordPageView();

    return () => {
      window.removeEventListener('online', updateNetworkState);
      window.removeEventListener('offline', updateNetworkState);
      document.removeEventListener('visibilitychange', checkWhenVisible);
      window.removeEventListener('pageshow', checkOnPageShow);
      window.removeEventListener('focus', checkOnFocus);
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('controllerchange', adoptUpdate);
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
