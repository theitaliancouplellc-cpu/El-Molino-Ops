'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main style={{ maxWidth: 680, margin: '0 auto', padding: '64px 20px', fontFamily: 'system-ui, sans-serif' }}>
          <h1>El Molino Ops needs to reload.</h1>
          <p>A critical application error interrupted this screen. Existing restaurant records were not intentionally changed by this recovery page.</p>
          <button type="button" onClick={reset} style={{ minHeight: 44, padding: '10px 16px', font: 'inherit' }}>Reload application</button>
        </main>
      </body>
    </html>
  );
}
