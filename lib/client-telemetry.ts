export const CLIENT_ERROR_CATEGORIES = [
  'auth_session',
  'authorization',
  'conflict',
  'data_integrity',
  'validation',
  'network',
  'application',
] as const;

export type ClientErrorCategory = (typeof CLIENT_ERROR_CATEGORIES)[number];

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LONG_IDENTIFIER = /^[a-z0-9_-]{18,}$/i;
const SAFE_DIGEST = /^[a-z0-9_-]{1,80}$/i;
const SAFE_CORRELATION = /^[a-z0-9_-]{8,80}$/i;

export function classifyClientError(error: unknown): ClientErrorCategory {
  const text = error instanceof Error ? error.message : String(error ?? '');
  if (/jwt|token.*expired|invalid claim|session/i.test(text)) return 'auth_session';
  if (/permission denied|row-level security|42501|forbidden|unauthori[sz]ed/i.test(text)) return 'authorization';
  if (/duplicate key|unique constraint|23505|already exists|conflict/i.test(text)) return 'conflict';
  if (/foreign key|23503|relation .* does not exist|column .* does not exist|schema cache|postgres|postgrest/i.test(text)) return 'data_integrity';
  if (/invalid input|22p02|validation|invalid value|required/i.test(text)) return 'validation';
  if (/failed to fetch|networkerror|load failed|fetch failed|offline|network/i.test(text)) return 'network';
  return 'application';
}

export function sanitizeTelemetryRoute(rawPath: string): string {
  const pathOnly = String(rawPath || '/').split(/[?#]/, 1)[0] || '/';
  const normalized = pathOnly
    .split('/')
    .map((segment) => {
      if (!segment) return segment;
      if (/^\d+$/.test(segment) || UUID_SEGMENT.test(segment) || LONG_IDENTIFIER.test(segment)) return ':id';
      return segment.slice(0, 48);
    })
    .join('/');
  return normalized.slice(0, 160) || '/';
}

export function sanitizeErrorDigest(digest?: string | null): string | null {
  const value = String(digest || '');
  return SAFE_DIGEST.test(value) ? value : null;
}

export function sanitizeCorrelationId(value?: string | null): string {
  const candidate = String(value || '');
  if (SAFE_CORRELATION.test(candidate)) return candidate;
  return 'telemetry-unknown';
}

export function createCorrelationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `telemetry-${Date.now().toString(36)}`;
}

export function buildClientErrorTelemetry(
  error: unknown,
  pathname: string,
  input: {
    digest?: string | null;
    correlationId: string;
    online?: boolean;
    visibilityState?: string | null;
  },
) {
  const category = classifyClientError(error);
  return {
    event_type: 'client_error' as const,
    route: sanitizeTelemetryRoute(pathname),
    message: category,
    metadata: {
      category,
      digest: sanitizeErrorDigest(input.digest),
      correlation_id: sanitizeCorrelationId(input.correlationId),
      online: input.online !== false,
      visibility_state: input.visibilityState === 'hidden' ? 'hidden' : 'visible',
    },
  };
}
