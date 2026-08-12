'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type ChatTurn = { role:'user'|'assistant'; content:string };

function visibleConversation(question:string): ChatTurn[] {
  try {
    const rows = Array.from(document.querySelectorAll<HTMLElement>('.chat-row'));
    const history: ChatTurn[] = rows.map(row => {
      const role: ChatTurn['role'] = row.classList.contains('user') ? 'user' : 'assistant';
      const bubble = row.querySelector<HTMLElement>('.bubble');
      if (!bubble) return null;
      const clone = bubble.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.feedback-row,.source-label,button').forEach(x=>x.remove());
      const content = (clone.textContent || '').replace(/\s+/g,' ').trim();
      if (!content || content === 'Thinking…') return null;
      return { role, content };
    }).filter(Boolean) as ChatTurn[];

    // The optimistic current user message may already be visible. The API receives it separately.
    if (history.length && history[history.length-1].role === 'user' && history[history.length-1].content.trim() === question.trim()) history.pop();
    return history.slice(-20);
  } catch { return []; }
}

export default function PWARegister() {
  useEffect(() => {
    let registration: ServiceWorkerRegistration | null = null;
    let reloading = false;
    const nativeFetch = window.fetch.bind(window);

    // Keep Ask AI conversational without exposing routing or memory controls in the UI.
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.endsWith('/api/ask') && init?.method?.toUpperCase() === 'POST' && typeof init.body === 'string') {
          const body = JSON.parse(init.body);
          const question = String(body.question || '').trim();
          const history = visibleConversation(question);
          if (history.length) body.history = history;
          init = { ...init, body: JSON.stringify(body) };
        }
      } catch {}
      return nativeFetch(input, init);
    };

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
              if (worker.state === 'installed' && navigator.serviceWorker.controller) worker.postMessage({ type: 'SKIP_WAITING' });
            });
          });
        })
        .catch(() => undefined);
      navigator.serviceWorker.addEventListener('controllerchange', adoptUpdate);
    }

    const updateNetworkState = () => { document.documentElement.dataset.network = navigator.onLine ? 'online' : 'offline'; };
    const checkWhenVisible = () => { if (document.visibilityState === 'visible') void checkForUpdate(); };
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
      window.fetch = nativeFetch;
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
