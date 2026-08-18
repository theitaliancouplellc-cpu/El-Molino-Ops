export const SESSION_REFRESH_LEAD_MS = 5 * 60_000;

export function shouldRefreshSession(expiresAtSeconds: number | null | undefined, nowMs = Date.now(), leadMs = SESSION_REFRESH_LEAD_MS): boolean {
  if (!Number.isFinite(expiresAtSeconds)) return false;
  return Number(expiresAtSeconds) * 1000 - nowMs <= Math.max(0, leadMs);
}

export function sessionRefreshDelay(expiresAtSeconds: number | null | undefined, nowMs = Date.now(), leadMs = SESSION_REFRESH_LEAD_MS): number | null {
  if (!Number.isFinite(expiresAtSeconds)) return null;
  return Math.max(0, Number(expiresAtSeconds) * 1000 - nowMs - Math.max(0, leadMs));
}

let refreshInFlight: Promise<unknown> | null = null;

export function refreshSessionSingleFlight<T>(refresh: () => Promise<T>): Promise<T> {
  if (refreshInFlight) return refreshInFlight as Promise<T>;
  const pending = refresh().finally(() => {
    if (refreshInFlight === pending) refreshInFlight = null;
  });
  refreshInFlight = pending;
  return pending;
}

export const SESSION_REFRESH_REQUEST_EVENT = 'elmolino:session-refresh-request';
