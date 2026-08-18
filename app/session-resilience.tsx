'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { refreshSessionSingleFlight, SESSION_REFRESH_REQUEST_EVENT, sessionRefreshDelay, shouldRefreshSession } from '@/lib/session-resilience';

type State = 'ready' | 'refreshing' | 'offline' | 'expired';

export default function SessionResilience() {
  const { locale } = useI18n();
  const [state, setState] = useState<State>('ready');
  const expiresAt = useRef<number | null>(null);
  const hadSession = useRef(false);

  const refresh = useCallback(async () => {
    if (!navigator.onLine) { setState('offline'); return false; }
    setState('refreshing');
    const { data, error } = await refreshSessionSingleFlight(() => supabase.auth.refreshSession());
    if (error || !data.session) { setState('expired'); return false; }
    hadSession.current = true;
    expiresAt.current = data.session.expires_at ?? null;
    setState('ready');
    return true;
  }, []);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      const delay = sessionRefreshDelay(expiresAt.current);
      if (delay !== null) timer = setTimeout(() => void refresh(), Math.min(delay, 2_147_000_000));
    };
    const check = () => {
      if (!hadSession.current) return;
      if (!navigator.onLine) { setState('offline'); return; }
      if (shouldRefreshSession(expiresAt.current)) void refresh();
      else { setState('ready'); schedule(); }
    };
    const requested = () => void refresh();
    const visible = () => { if (document.visibilityState === 'visible') check(); };

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      hadSession.current = Boolean(data.session);
      expiresAt.current = data.session?.expires_at ?? null;
      schedule();
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      const previouslySignedIn = hadSession.current;
      hadSession.current = Boolean(session);
      expiresAt.current = session?.expires_at ?? null;
      if (session) setState('ready');
      else if (event === 'SIGNED_OUT' && previouslySignedIn) setState('expired');
      schedule();
    });
    addEventListener('online', check);
    addEventListener('offline', check);
    addEventListener(SESSION_REFRESH_REQUEST_EVENT, requested);
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      listener.subscription.unsubscribe();
      removeEventListener('online', check);
      removeEventListener('offline', check);
      removeEventListener(SESSION_REFRESH_REQUEST_EVENT, requested);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);

  if (state === 'ready') return null;
  const es = locale === 'es';
  const copy = state === 'offline'
    ? (es ? 'Sin conexión. Tu sesión se verificará cuando vuelva la red.' : 'Offline. Your session will be checked when the network returns.')
    : state === 'refreshing'
      ? (es ? 'Verificando tu sesión…' : 'Checking your session…')
      : (es ? 'Tu sesión terminó. Inicia sesión de nuevo para continuar.' : 'Your session ended. Sign in again to continue.');
  return <div className="session-status" role="status" aria-live="polite"><span>{copy}</span>{state === 'expired' && <button type="button" onClick={() => void refresh()}>{es ? 'Volver a intentar' : 'Try again'}</button>}</div>;
}
