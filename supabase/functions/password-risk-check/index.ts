import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const JSON_HEADERS = { ...CORS_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function sha1Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  let body: { password?: unknown };
  try { body = await req.json(); }
  catch { return json(400, { ok: false, error: 'invalid_json' }); }

  const password = typeof body.password === 'string' ? body.password : '';
  if (!password || password.length > 256) return json(400, { ok: false, error: 'invalid_password' });

  try {
    // HIBP Pwned Passwords uses k-anonymity: only the first five SHA-1 characters leave our function.
    // The plaintext password and complete hash are never sent to HIBP and are never logged or stored here.
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: {
        'Add-Padding': 'true',
        'User-Agent': 'El-Molino-Ops-Password-Safety/1.0',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return json(503, { ok: false, error: 'password_breach_service_unavailable' });

    const text = await response.text();
    let compromisedCount = 0;
    for (const line of text.split(/\r?\n/)) {
      const [candidate, rawCount] = line.trim().split(':');
      if (candidate?.toUpperCase() === suffix) {
        compromisedCount = Number.parseInt(rawCount || '0', 10) || 0;
        break;
      }
    }
    return json(200, { ok: true, compromised: compromisedCount > 0, compromised_count: compromisedCount });
  } catch {
    return json(503, { ok: false, error: 'password_breach_service_unavailable' });
  }
});
