import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

type DeliveryAttempt = {
  attempt_id: string;
  notification_id: string;
  subscription: { endpoint: string; expirationTime?: number | null; keys: { p256dh: string; auth: string } };
  category?: string | null;
  event_key?: string | null;
  priority?: string | null;
  href?: string | null;
  attempt_count?: number;
};

type RuntimeConfig = {
  public_key?: string | null;
  private_key?: string | null;
  subject?: string | null;
  webhook_secret?: string | null;
};

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const LEGACY_ROUTES: Array<[string, string]> = [
  ['/schedule/pool', '/employee/shift-pool'],
  ['/schedule/requests', '/employee/requests'],
  ['/schedule/feedback', '/employee/schedule'],
  ['/team', '/employee/team'],
  ['/training/courses', '/employee/training'],
  ['/account', '/employee/access'],
];

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function safeEmployeeHref(value: unknown) {
  const fallback = '/employee/notifications';
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const parsed = new URL(value, 'https://staff.elmolino.invalid');
    if (parsed.origin !== 'https://staff.elmolino.invalid') return fallback;
    const path = parsed.pathname;
    if (path === '/employee' || path.startsWith('/employee/')) return `${path}${parsed.search}${parsed.hash}`;
    for (const [legacy, dedicated] of LEGACY_ROUTES) {
      if (path === legacy || path.startsWith(`${legacy}/`)) {
        return `${dedicated}${path.slice(legacy.length)}${parsed.search}${parsed.hash}`;
      }
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function genericBody(category: unknown) {
  switch (category) {
    case 'schedule': return 'Your schedule has an update.';
    case 'requests': return 'A request status has changed.';
    case 'shift_pool': return 'There is a Shift Pool update.';
    case 'team': return 'There is a new team update.';
    case 'training': return 'Your training has an update.';
    case 'time_clock': return 'There is a time clock update.';
    case 'tips': return 'Your tip information has an update.';
    case 'account': return 'Your staff account has an update.';
    default: return 'You have a new El Molino update.';
  }
}

function outcomeFor(error: unknown) {
  const statusCode = Number((error as { statusCode?: unknown })?.statusCode);
  if (statusCode === 404 || statusCode === 410) return { outcome: 'expired', statusCode, errorClass: 'subscription_expired' };
  if (statusCode === 429) return { outcome: 'retry', statusCode, errorClass: 'push_rate_limited' };
  if (statusCode >= 500 && statusCode <= 599) return { outcome: 'retry', statusCode, errorClass: 'push_provider_unavailable' };
  if (!Number.isFinite(statusCode) || statusCode <= 0) return { outcome: 'retry', statusCode: null, errorClass: 'push_network_failure' };
  return { outcome: 'permanent_failure', statusCode, errorClass: 'push_rejected' };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return response(405, { ok: false, error: 'method_not_allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return response(503, { ok: false, error: 'runtime_not_configured' });

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const runtimeResult = await supabase.rpc('get_web_push_runtime_config');
  if (runtimeResult.error) return response(503, { ok: false, error: 'push_config_unavailable' });
  const runtime = (runtimeResult.data || {}) as RuntimeConfig;
  const suppliedSecret = req.headers.get('x-el-molino-push-secret') || '';
  if (!runtime.webhook_secret || suppliedSecret.length < 24 || suppliedSecret !== runtime.webhook_secret) {
    return response(401, { ok: false, error: 'unauthorized' });
  }
  if (!runtime.public_key || !runtime.private_key || !runtime.subject) {
    return response(503, { ok: false, error: 'vapid_not_configured' });
  }

  let body: { notification_id?: unknown } = {};
  try { body = await req.json(); } catch { body = {}; }
  const rawNotificationId = typeof body.notification_id === 'string' ? body.notification_id : null;
  const notificationId = rawNotificationId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawNotificationId) ? rawNotificationId : null;

  webpush.setVapidDetails(runtime.subject, runtime.public_key, runtime.private_key);
  const claim = await supabase.rpc('claim_web_push_deliveries', { p_notification_id: notificationId, p_limit: 50 });
  if (claim.error) return response(503, { ok: false, error: 'delivery_claim_failed' });
  const attempts = (Array.isArray(claim.data) ? claim.data : []) as DeliveryAttempt[];

  let sent = 0, retrying = 0, expired = 0, failed = 0;
  for (const attempt of attempts) {
    const payload = JSON.stringify({
      title: 'El Molino',
      body: genericBody(attempt.category),
      href: safeEmployeeHref(attempt.href),
      tag: `el-molino-${attempt.notification_id}`,
      notification_id: attempt.notification_id,
      category: typeof attempt.category === 'string' ? attempt.category : 'general',
      priority: ['low', 'normal', 'high', 'critical'].includes(String(attempt.priority)) ? attempt.priority : 'normal',
    });
    try {
      const delivered = await webpush.sendNotification(attempt.subscription, payload, { TTL: 86400 });
      await supabase.rpc('complete_web_push_delivery', {
        p_attempt_id: attempt.attempt_id,
        p_outcome: 'sent',
        p_status_code: Number(delivered?.statusCode) || 201,
        p_error_class: null,
      });
      sent++;
    } catch (error) {
      const result = outcomeFor(error);
      const completed = await supabase.rpc('complete_web_push_delivery', {
        p_attempt_id: attempt.attempt_id,
        p_outcome: result.outcome,
        p_status_code: result.statusCode,
        p_error_class: result.errorClass,
      });
      const finalStatus = String((completed.data as { status?: unknown } | null)?.status || result.outcome);
      if (finalStatus === 'retry') retrying++;
      else if (finalStatus === 'expired') expired++;
      else failed++;
    }
  }

  return response(200, { ok: true, claimed: attempts.length, sent, retrying, expired, failed });
});
