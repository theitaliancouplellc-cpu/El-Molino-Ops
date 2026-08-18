'use client';

import {useEffect,useState} from 'react';
import {LOCALE_STORAGE_KEY} from '@/lib/i18n';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [locale,setLocale]=useState<'en'|'es'>('en');
  useEffect(()=>setLocale(localStorage.getItem(LOCALE_STORAGE_KEY)==='es'?'es':'en'),[]);
  return (
    <html lang={locale}>
      <body>
        <main style={{ maxWidth: 680, margin: '0 auto', padding: '64px 20px', fontFamily: 'system-ui, sans-serif' }}>
          <h1>{locale==='es'?'El Molino Ops necesita volver a cargar.':'El Molino Ops needs to reload.'}</h1>
          <p>{locale==='es'?'Un error crítico de la aplicación interrumpió esta pantalla. Esta página de recuperación no cambió intencionalmente los registros existentes del restaurante.':'A critical application error interrupted this screen. Existing restaurant records were not intentionally changed by this recovery page.'}</p>
          <button type="button" onClick={reset} style={{ minHeight: 44, padding: '10px 16px', font: 'inherit' }}>{locale==='es'?'Volver a cargar la aplicación':'Reload application'}</button>
        </main>
      </body>
    </html>
  );
}
