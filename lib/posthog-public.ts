import { sanitizeTelemetryRoute } from './client-telemetry';

const POSTHOG_HOST = 'https://us.i.posthog.com';
// PostHog project tokens are intentionally public ingestion identifiers used by browser SDKs/public endpoints.
const POSTHOG_PROJECT_TOKEN = 'phc_sdyYwjbwYPqRtBsyjHKsrpY4iM5SKxNaK67DEeGCAv9w';

export const POSTHOG_FLAGS = {
  errorTelemetry: 'posthog-error-telemetry-enabled',
  productAnalytics: 'posthog-product-analytics-enabled',
  opsAI: 'ops-ai-enabled',
} as const;

export const POSTHOG_PRODUCT_EVENTS = [
  'app_open',
  'route_view',
  'auth_state',
  'network_state',
] as const;

export type PosthogProductEvent = (typeof POSTHOG_PRODUCT_EVENTS)[number];
export type ProductTelemetryProperties = {
  route: string;
  release: string;
  platform: 'web' | 'ios' | 'android';
  install_mode: 'browser' | 'standalone' | 'native';
  locale: 'en' | 'es';
  network: 'online' | 'offline';
  auth_state?: 'signed_in' | 'signed_out' | 'token_refreshed';
};

type UnknownRecord = Record<string, unknown>;
const FLAG_CACHE_TTL_MS = 5 * 60_000;
const flagCache = new Map<string, { value: boolean; expiresAt: number }>();

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
}

/**
 * Accept both the current /flags v2 result shape and older boolean/string maps.
 * null means the response did not contain an authoritative value for this key.
 */
export function readPosthogBooleanFlag(payload: unknown, key: string): boolean | null {
  const root = record(payload);
  if (!root) return null;

  const flags = root.flags;
  if (Array.isArray(flags)) {
    const match = flags.find((item) => record(item)?.key === key);
    const value = record(match);
    if (!value) return null;
    if (typeof value.enabled === 'boolean') return value.enabled;
    if (typeof value.variant === 'string') return true;
    return null;
  }

  const flagMap = record(flags) ?? record(root.featureFlags);
  if (!flagMap || !(key in flagMap)) return null;
  const value = flagMap[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return true;
  const result = record(value);
  if (typeof result?.enabled === 'boolean') return result.enabled;
  if (typeof result?.variant === 'string') return true;
  return null;
}

export async function isPosthogFlagEnabled(
  key: string,
  distinctId: string,
  fallback = false,
): Promise<boolean> {
  if (!distinctId) return fallback;
  const cacheKey = `${distinctId}:${key}`;
  const cached = flagCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const response = await fetch(`${POSTHOG_HOST}/flags?v=2`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: POSTHOG_PROJECT_TOKEN, distinct_id: distinctId }),
      cache: 'no-store',
    });
    if (!response.ok) return fallback;
    const value = readPosthogBooleanFlag(await response.json(), key);
    if (value === null) return fallback;
    flagCache.set(cacheKey, { value, expiresAt: Date.now() + FLAG_CACHE_TTL_MS });
    return value;
  } catch {
    return fallback;
  }
}

export async function capturePosthogClientError(
  distinctId: string,
  telemetry: {
    event_type: 'client_error';
    route: string;
    message: string;
    metadata: {
      category: string;
      digest: string | null;
      correlation_id: string;
      online: boolean;
      visibility_state: string;
    };
  },
): Promise<boolean> {
  if (!distinctId) return false;
  const enabled = await isPosthogFlagEnabled(POSTHOG_FLAGS.errorTelemetry, distinctId, false);
  if (!enabled) return false;

  try {
    const response = await fetch(`${POSTHOG_HOST}/i/v0/e/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_PROJECT_TOKEN,
        event: telemetry.event_type,
        distinct_id: distinctId,
        properties: {
          $process_person_profile: false,
          app: 'el-molino-ops',
          route: telemetry.route,
          category: telemetry.metadata.category,
          digest: telemetry.metadata.digest,
          online: telemetry.metadata.online,
          visibility_state: telemetry.metadata.visibility_state,
        },
      }),
      cache: 'no-store',
      keepalive: true,
    });
    return response.ok;
  } catch {
    return false;
  }
}

function safeRelease(value: string | undefined): string {
  const release = String(value || 'unknown').trim();
  return /^[a-z0-9._-]{1,80}$/i.test(release) ? release : 'unknown';
}

export function sanitizeProductTelemetryProperties(input: ProductTelemetryProperties): ProductTelemetryProperties {
  return {
    route: sanitizeTelemetryRoute(input.route),
    release: safeRelease(input.release),
    platform: ['ios', 'android'].includes(input.platform) ? input.platform : 'web',
    install_mode: ['standalone', 'native'].includes(input.install_mode) ? input.install_mode : 'browser',
    locale: input.locale === 'es' ? 'es' : 'en',
    network: input.network === 'offline' ? 'offline' : 'online',
    ...(input.auth_state && ['signed_in', 'signed_out', 'token_refreshed'].includes(input.auth_state)
      ? { auth_state: input.auth_state }
      : {}),
  };
}

export async function capturePosthogProductEvent(
  distinctId: string,
  event: PosthogProductEvent,
  properties: ProductTelemetryProperties,
): Promise<boolean> {
  if (!distinctId || !POSTHOG_PRODUCT_EVENTS.includes(event)) return false;
  const enabled = await isPosthogFlagEnabled(POSTHOG_FLAGS.productAnalytics, distinctId, true);
  if (!enabled) return false;
  try {
    const response = await fetch(`${POSTHOG_HOST}/i/v0/e/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_PROJECT_TOKEN,
        event,
        distinct_id: distinctId,
        properties: {
          $process_person_profile: false,
          app: 'el-molino-ops',
          ...sanitizeProductTelemetryProperties(properties),
        },
      }),
      cache: 'no-store',
      keepalive: true,
    });
    return response.ok;
  } catch {
    return false;
  }
}
