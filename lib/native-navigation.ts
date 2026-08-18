import { safeInternalHref } from './round3-hardening';

export const NATIVE_APP_ORIGIN = 'https://el-molino-ops.vercel.app';

export function nativeRouteFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const trustedWeb = url.protocol === 'https:' && url.origin === NATIVE_APP_ORIGIN;
    const trustedScheme = url.protocol === 'elmolino:' && url.hostname === 'ops';
    if (!trustedWeb && !trustedScheme) return null;
    const path = `${url.pathname || '/'}${url.search}${url.hash}`;
    return safeInternalHref(path, '/');
  } catch {
    return null;
  }
}
