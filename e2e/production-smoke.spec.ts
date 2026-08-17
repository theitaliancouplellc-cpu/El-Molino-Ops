import { expect, test } from '@playwright/test';

test('health endpoint exposes required release and dependency state', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['x-el-molino-release']).toBeTruthy();

  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(body.service).toBe('el-molino-ops');
  expect(typeof body.latency_ms).toBe('number');
  expect(body.release?.sha).toBeTruthy();
  expect(Array.isArray(body.checks)).toBe(true);
  expect(body.checks.filter((check: { required?: boolean }) => check.required).every((check: { ok?: boolean }) => check.ok)).toBe(true);
});

test('root document carries browser hardening headers and no framework signature', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(response).not.toBeNull();
  expect(response!.status()).toBeLessThan(500);

  const headers = response!.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['strict-transport-security']).toContain('max-age=31536000');
  expect(headers['permissions-policy']).toContain('camera=(self)');
  expect(headers['x-powered-by']).toBeUndefined();
  await expect(page.locator('body')).toBeVisible();
  await expect(page).toHaveTitle(/El Molino Ops/);
  expect(browserErrors).toEqual([]);
});

test('PWA manifest and service worker are production-valid', async ({ request }) => {
  const manifestResponse = await request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe('El Molino');
  expect(manifest.start_url).toBeTruthy();
  expect(Array.isArray(manifest.icons)).toBe(true);
  expect(manifest.icons.length).toBeGreaterThan(0);

  const workerResponse = await request.get('/sw.js');
  expect(workerResponse.ok()).toBe(true);
  const worker = await workerResponse.text();
  expect(worker).toContain("self.addEventListener('install'");
  expect(worker).toContain("self.addEventListener('fetch'");
  expect(worker).toContain("status:503");
  expect(worker).toContain('El Molino Ops is offline');
  expect(worker).toContain('Changes are not accepted while the app cannot reach the server.');
});

test('installed app fails safely when connectivity disappears', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright service-worker control is Chromium-only');

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable');
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 10_000 });

  await context.setOffline(true);
  try {
    const response = await page.goto(`/__offline_e2e_probe__/${Date.now()}`, { waitUntil: 'domcontentloaded' });
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(503);
    expect(response!.fromServiceWorker()).toBe(true);
    await expect(page.getByRole('heading', { name: 'El Molino Ops is offline' })).toBeVisible();
    await expect(page.getByText('Changes are not accepted while the app cannot reach the server.')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('mobile viewport has no horizontal application overflow and tolerates reduced motion', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'mobile-only acceptance contract');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 2);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 2);
});
