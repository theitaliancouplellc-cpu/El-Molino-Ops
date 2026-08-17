import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
];

const releaseSha =
  process.env.EL_MOLINO_RELEASE_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  'unknown';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Build the immutable release identity into the Next bundle. OpenNext's
  // Cloudflare runtime does not reliably expose arbitrary Wrangler vars via
  // process.env, so production certification must not depend on runtime var
  // adaptation.
  env: {
    EL_MOLINO_RELEASE_SHA: releaseSha,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
