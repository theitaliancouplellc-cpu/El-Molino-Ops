'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { buildClientErrorTelemetry, createCorrelationId } from '@/lib/client-telemetry';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const correlationId = useRef(createCorrelationId());
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    void report();
  }, [error]);

  async function report() {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('location_id')
        .eq('id', userData.user.id)
        .maybeSingle();

      const telemetry = buildClientErrorTelemetry(error, window.location.pathname, {
        digest: error.digest,
        correlationId: correlationId.current,
        online: navigator.onLine,
        visibilityState: document.visibilityState,
      });

      await supabase.from('client_events').insert({
        location_id: profile?.location_id ?? null,
        user_id: userData.user.id,
        ...telemetry,
      });
    } catch {
      // Error reporting must never prevent recovery or expose a second failure to the user.
    }
  }

  const reference = correlationId.current.slice(0, 12);
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="onboard-icon"><AlertTriangle /></div>
        <h1>Something went wrong.</h1>
        <p>The error was recorded so it can be diagnosed. Your data was not intentionally deleted.</p>
        <p className="muted">Reference: {reference}</p>
        <button className="btn" onClick={reset}><RefreshCw size={16} /> Try again</button>
        <a className="btn ghost" style={{ marginTop: 10, width: '100%' }} href="/">Return home</a>
      </div>
    </main>
  );
}
