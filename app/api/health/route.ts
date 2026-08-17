import { NextResponse } from 'next/server';
import { configuredFreeProviders } from '@/lib/free-ai-router';

export const dynamic = 'force-dynamic';

type Check = { name: string; ok: boolean; required: boolean; detail?: string };

const FETCH_TIMEOUT_MS = 5000;

async function checkedFetch(url: string, key: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { apikey: key },
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function releaseMetadata() {
  const sha =
    process.env.EL_MOLINO_RELEASE_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.CF_VERSION_METADATA ||
    'unknown';
  const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown';
  return { sha, environment };
}

export async function GET() {
  const startedAt = Date.now();
  const checks: Check[] = [];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !key) {
    checks.push({ name: 'supabase_public_config', ok: false, required: true, detail: 'missing' });
  } else {
    checks.push({ name: 'supabase_public_config', ok: true, required: true, detail: 'configured' });
    try {
      const response = await checkedFetch(`${supabaseUrl}/rest/v1/`, key);
      checks.push({ name: 'supabase_api', ok: response.status < 500, required: true, detail: `HTTP ${response.status}` });
    } catch {
      checks.push({ name: 'supabase_api', ok: false, required: true, detail: 'service_unavailable' });
    }
    try {
      const response = await checkedFetch(`${supabaseUrl}/rest/v1/ops_records?select=id&limit=0`, key);
      checks.push({ name: 'operations_schema', ok: response.status < 500, required: true, detail: `HTTP ${response.status}` });
    } catch {
      checks.push({ name: 'operations_schema', ok: false, required: true, detail: 'service_unavailable' });
    }
  }

  const providers = configuredFreeProviders();
  const active = Object.entries(providers).filter(([, value]) => value).map(([name]) => name);
  checks.push({
    name: 'free_ai_router',
    ok: true,
    required: false,
    detail: active.length ? `${active.length} provider(s) configured: ${active.join(', ')}` : 'local fallback only; external free providers not configured',
  });

  const ok = checks.filter((check) => check.required).every((check) => check.ok);
  const release = releaseMetadata();
  return NextResponse.json(
    {
      ok,
      service: 'el-molino-ops',
      time: new Date().toISOString(),
      latency_ms: Date.now() - startedAt,
      release,
      checks,
      ai: { mode: 'free-only-rotation', providers },
    },
    {
      status: ok ? 200 : 503,
      headers: {
        'cache-control': 'no-store',
        'x-el-molino-release': release.sha,
      },
    },
  );
}
