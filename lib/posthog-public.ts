const POSTHOG_HOST = 'https://us.i.posthog.com';
// PostHog project tokens are intentionally public ingestion identifiers used by browser SDKs/public endpoints.
const POSTHOG_PROJECT_TOKEN = 'phc_sdyYwjbwYPqRtBsyjHKsrpY4iM5SKxNaK67DEeGCAv9w';

export const POSTHOG_FLAGS = {
  errorTelemetry: 'posthog-error-telemetry-enabled',
  opsAI: 'ops-ai-enabled',
} as const;

type UnknownRecord = Record<string, unknown>;

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
  try {
    const response = await fetch(`${POSTHOG_HOST}/flags?v=2`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: POSTHOG_PROJECT_TOKEN, distinct_id: distinctId }),
      cache: 'no-store',
    });
    if (!response.ok) return fallback;
    const value = readPosthogBooleanFlag(await response.json(), key);
    return value ?? fallback;
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
