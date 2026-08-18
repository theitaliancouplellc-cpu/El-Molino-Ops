import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { SignJWT, importPKCS8 } from 'npm:jose@6.1.0';

type Platform = 'ios' | 'android';
type DeliveryAttempt = {
  attempt_id: string;
  notification_id: string;
  device_id: string;
  platform: Platform;
  token: string;
  category?: string | null;
  event_key?: string | null;
  priority?: string | null;
  href?: string | null;
  attempt_count?: number;
};
type RuntimeConfig = {
  webhook_secret?: string | null;
  apns_team_id?: string | null;
  apns_key_id?: string | null;
  apns_private_key?: string | null;
  apns_bundle_id?: string | null;
  apns_environment?: string | null;
  fcm_project_id?: string | null;
  fcm_client_email?: string | null;
  fcm_private_key?: string | null;
};
type ProviderResult = { outcome: 'sent' | 'retry' | 'expired' | 'permanent_failure'; statusCode: number | null; errorClass: string | null };

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const LEGACY_ROUTES: Array<[string, string]> = [
  ['/schedule/pool', '/employee/shift-pool'],
  ['/schedule/requests', '/employee/requests'],
  ['/schedule/feedback', '/employee/schedule'],
  ['/team', '/employee/team'],
  ['/training/courses', '/employee/training'],
  ['/account', '/employee/access'],
];

let apnsTokenCache: { key: string; token: string; expiresAt: number } | null = null;
let fcmTokenCache: { key: string; token: string; expiresAt: number } | null = null;

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}
function normalizePem(value: string) { return value.replace(/\\n/g, '\n').trim(); }
function safeEmployeeHref(value: unknown) {
  const fallback = '/employee/notifications';
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const parsed = new URL(value, 'https://staff.elmolino.invalid');
    if (parsed.origin !== 'https://staff.elmolino.invalid') return fallback;
    const path = parsed.pathname;
    if (path === '/employee' || path.startsWith('/employee/')) return `${path}${parsed.search}${parsed.hash}`;
    for (const [legacy, dedicated] of LEGACY_ROUTES) {
      if (path === legacy || path.startsWith(`${legacy}/`)) return `${dedicated}${path.slice(legacy.length)}${parsed.search}${parsed.hash}`;
    }
  } catch { return fallback; }
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
function providerData(attempt: DeliveryAttempt) {
  return {
    href: safeEmployeeHref(attempt.href),
    notification_id: attempt.notification_id,
    category: typeof attempt.category === 'string' ? attempt.category : 'general',
    priority: ['low','normal','high','critical'].includes(String(attempt.priority)) ? String(attempt.priority) : 'normal',
  };
}
function configuredFor(platform: Platform, runtime: RuntimeConfig) {
  if (platform === 'ios') return Boolean(runtime.apns_team_id && runtime.apns_key_id && runtime.apns_private_key && runtime.apns_bundle_id);
  return Boolean(runtime.fcm_project_id && runtime.fcm_client_email && runtime.fcm_private_key);
}
async function apnsProviderToken(runtime: RuntimeConfig) {
  const teamId = runtime.apns_team_id!;
  const keyId = runtime.apns_key_id!;
  const pem = normalizePem(runtime.apns_private_key!);
  const cacheKey = `${teamId}:${keyId}:${pem.length}`;
  const now = Math.floor(Date.now() / 1000);
  if (apnsTokenCache?.key === cacheKey && apnsTokenCache.expiresAt > now + 60) return apnsTokenCache.token;
  const key = await importPKCS8(pem, 'ES256');
  const token = await new SignJWT({ iss: teamId }).setProtectedHeader({ alg: 'ES256', kid: keyId }).setIssuedAt(now).sign(key);
  apnsTokenCache = { key: cacheKey, token, expiresAt: now + 50 * 60 };
  return token;
}
async function fcmAccessToken(runtime: RuntimeConfig) {
  const projectId = runtime.fcm_project_id!;
  const clientEmail = runtime.fcm_client_email!;
  const pem = normalizePem(runtime.fcm_private_key!);
  const cacheKey = `${projectId}:${clientEmail}:${pem.length}`;
  const now = Math.floor(Date.now() / 1000);
  if (fcmTokenCache?.key === cacheKey && fcmTokenCache.expiresAt > now + 120) return fcmTokenCache.token;
  const key = await importPKCS8(pem, 'RS256');
  const assertion = await new SignJWT({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
  }).setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const tokenBody = await tokenResponse.json().catch(() => ({})) as { access_token?: unknown; expires_in?: unknown };
  if (!tokenResponse.ok || typeof tokenBody.access_token !== 'string') throw Object.assign(new Error('fcm_oauth_failed'), { statusCode: tokenResponse.status });
  const expiresIn = Math.max(300, Math.min(3600, Number(tokenBody.expires_in) || 3600));
  fcmTokenCache = { key: cacheKey, token: tokenBody.access_token, expiresAt: now + expiresIn };
  return tokenBody.access_token;
}
async function sendApns(attempt: DeliveryAttempt, runtime: RuntimeConfig): Promise<ProviderResult> {
  const token = await apnsProviderToken(runtime);
  const host = runtime.apns_environment === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  const data = providerData(attempt);
  const res = await fetch(`${host}/3/device/${encodeURIComponent(attempt.token)}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${token}`,
      'apns-topic': runtime.apns_bundle_id!,
      'apns-push-type': 'alert',
      'apns-priority': data.priority === 'high' || data.priority === 'critical' ? '10' : '5',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ aps: { alert: { title: 'El Molino', body: genericBody(attempt.category) }, sound: 'default' }, ...data }),
  });
  if (res.ok) return { outcome: 'sent', statusCode: res.status, errorClass: null };
  const body = await res.json().catch(() => ({})) as { reason?: unknown };
  const reason = typeof body.reason === 'string' ? body.reason : 'apns_rejected';
  if (res.status === 410 || ['BadDeviceToken','DeviceTokenNotForTopic','Unregistered'].includes(reason)) return { outcome: 'expired', statusCode: res.status, errorClass: reason };
  if (res.status === 429 || res.status >= 500) return { outcome: 'retry', statusCode: res.status, errorClass: reason };
  return { outcome: 'permanent_failure', statusCode: res.status, errorClass: reason };
}
async function sendFcm(attempt: DeliveryAttempt, runtime: RuntimeConfig): Promise<ProviderResult> {
  const accessToken = await fcmAccessToken(runtime);
  const data = providerData(attempt);
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(runtime.fcm_project_id!)}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ message: {
      token: attempt.token,
      notification: { title: 'El Molino', body: genericBody(attempt.category) },
      data,
      android: { priority: data.priority === 'high' || data.priority === 'critical' ? 'high' : 'normal', ttl: '86400s' },
    } }),
  });
  if (res.ok) return { outcome: 'sent', statusCode: res.status, errorClass: null };
  const body = await res.json().catch(() => ({}));
  const serialized = JSON.stringify(body);
  if (serialized.includes('UNREGISTERED') || serialized.includes('registration-token-not-registered')) return { outcome: 'expired', statusCode: res.status, errorClass: 'fcm_unregistered' };
  if (res.status === 429 || res.status >= 500) return { outcome: 'retry', statusCode: res.status, errorClass: 'fcm_provider_unavailable' };
  return { outcome: 'permanent_failure', statusCode: res.status, errorClass: 'fcm_rejected' };
}
function classifyThrown(error: unknown): ProviderResult {
  const statusCode = Number((error as { statusCode?: unknown })?.statusCode);
  if (statusCode === 429 || statusCode >= 500 || !Number.isFinite(statusCode) || statusCode <= 0) return { outcome: 'retry', statusCode: Number.isFinite(statusCode) ? statusCode : null, errorClass: 'native_push_network_or_auth_failure' };
  return { outcome: 'permanent_failure', statusCode, errorClass: 'native_push_provider_error' };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return response(405, { ok: false, error: 'method_not_allowed' });
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return response(503, { ok: false, error: 'runtime_not_configured' });
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const runtimeResult = await supabase.rpc('get_native_push_runtime_config');
  if (runtimeResult.error) return response(503, { ok: false, error: 'native_push_config_unavailable' });
  const runtime = (runtimeResult.data || {}) as RuntimeConfig;
  const suppliedSecret = req.headers.get('x-el-molino-native-push-secret') || '';
  if (!runtime.webhook_secret || suppliedSecret.length < 24 || suppliedSecret !== runtime.webhook_secret) return response(401, { ok: false, error: 'unauthorized' });

  let body: { notification_id?: unknown } = {};
  try { body = await req.json(); } catch { body = {}; }
  const rawNotificationId = typeof body.notification_id === 'string' ? body.notification_id : null;
  const notificationId = rawNotificationId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawNotificationId) ? rawNotificationId : null;
  const claim = await supabase.rpc('claim_native_push_deliveries', { p_notification_id: notificationId, p_limit: 50 });
  if (claim.error) return response(503, { ok: false, error: 'native_delivery_claim_failed' });
  const attempts = (Array.isArray(claim.data) ? claim.data : []) as DeliveryAttempt[];

  let sent = 0, retrying = 0, expired = 0, failed = 0, blocked = 0;
  for (const attempt of attempts) {
    let result: ProviderResult;
    if (!configuredFor(attempt.platform, runtime)) {
      result = { outcome: 'retry', statusCode: null, errorClass: attempt.platform === 'ios' ? 'apns_not_configured' : 'fcm_not_configured' };
      blocked++;
    } else {
      try { result = attempt.platform === 'ios' ? await sendApns(attempt, runtime) : await sendFcm(attempt, runtime); }
      catch (error) { result = classifyThrown(error); }
    }
    const completed = await supabase.rpc('complete_native_push_delivery', {
      p_attempt_id: attempt.attempt_id,
      p_outcome: result.outcome,
      p_status_code: result.statusCode,
      p_error_class: result.errorClass,
    });
    const finalStatus = String((completed.data as { status?: unknown } | null)?.status || result.outcome);
    if (finalStatus === 'sent') sent++;
    else if (finalStatus === 'retry') retrying++;
    else if (finalStatus === 'expired') expired++;
    else failed++;
  }
  return response(200, { ok: true, claimed: attempts.length, sent, retrying, expired, failed, blocked });
});
