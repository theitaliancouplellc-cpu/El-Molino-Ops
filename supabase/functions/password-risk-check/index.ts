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

function clientSubject(req: Request) {
  const forwarded = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0]?.trim();
  if (ip) return `ip:${ip}`.slice(0, 180);
  const ua = (req.headers.get('user-agent') || 'unknown').slice(0, 180);
  return `ua:${ua}`;
}

async function rateLimit(req: Request) {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return false;

  const response = await fetch(`${url}/rest/v1/rpc/consume_rate_limit`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      p_bucket: 'password-risk-check',
      p_subject: clientSubject(req),
      p_limit: 20,
      p_window_seconds: 60,
    }),
    signal: AbortSignal.timeout(2500),
  });

  if (!response.ok) return false;
  return (await response.json()) === true;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  const declared = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(declared) && declared > 2048) {
    return json(413, { ok: false, error: 'request_too_large' });
  }

  try {
    if (!(await rateLimit(req))) return json(429, { ok: false, error: 'rate_limited' });
  } catch {
    // Fail closed if the limiter itself cannot be verified.
    return json(503, { ok: false, error: 'password_safety_temporarily_unavailable' });
  }

  let body: { password?: unknown };
  try { body = await req.json(); }
  catch { return json(400, { ok: false, error: 'invalid_json' }); }

  const password = typeof body.password === 'string' ? body.password : '';
  if (!password || password.length > 256) return json(400, { ok: false, error: 'invalid_password' });

  try {
    // HIBP Pwned Passwords k-anonymity: only the first five SHA-1 characters
    // leave this function. The plaintext password and complete hash are never
    // logged, stored, or sent to HIBP.
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: {
        'Add-Padding': 'true',
        'User-Agent': 'El-Molino-Ops-Password-Safety/2.0',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return json(503, { ok: false, error: 'password_breach_service_unavailable' });

    const text = await response.text();
    let compromised = false;
    for (const line of text.split(/\r?\n/)) {
      const [candidate] = line.trim().split(':');
      if (candidate?.toUpperCase() === suffix) {
        compromised = true;
        break;
      }
    }

    // The application needs only the decision, not HIBP occurrence counts.
    return json(200, { ok: true, compromised });
  } catch {
    return json(503, { ok: false, error: 'password_breach_service_unavailable' });
  }
});
