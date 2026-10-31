import { test as base, expect } from '@playwright/test';
import { protectionHeaders } from './remote-target.ts';

export const test = base.extend({
  context: async ({ context, baseURL }, use) => {
    const headers = protectionHeaders(baseURL);
    if (Object.keys(headers).length) {
      // Node fetch is deliberately outside Playwright's API instrumentation:
      // even a caught APIRequestContext error can expose headers in the report.
      try {
        const response = await fetch(`${baseURL}/api/v1/ready`, {
          headers: { ...headers, 'x-vercel-set-bypass-cookie': 'true' },
          redirect: 'manual', signal: AbortSignal.timeout(15_000),
        });
        const location = response.headers.get('location');
        if (![200, 302, 307].includes(response.status)
          || (location && new URL(location, baseURL).origin !== baseURL)) {
          throw new Error('Unexpected protection response');
        }
        const cookie = response.headers.getSetCookie().find(value => value.startsWith('_vercel_jwt='));
        const value = cookie?.split(';', 1)[0].slice('_vercel_jwt='.length);
        if (!value || !/^[A-Za-z0-9._-]+$/.test(value)) throw new Error('Missing protection cookie');
        await context.addCookies([{ name: '_vercel_jwt', value, url: baseURL,
          secure: true, httpOnly: true, sameSite: 'Lax' }]);
      } catch {
        // Native request errors may include secret headers in their call log.
        throw new Error('Could not establish protected deployment browser access.');
      }
    }
    await use(context);
  },
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Remote font availability must not decide whether local learning works.
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.route('https://fonts.gstatic.com/**', route => route.abort());
    await use(page);
    expect(errors, 'Uncaught browser errors').toEqual([]);
  },
});
export { expect };

export async function runLab(page, id) {
  const responsePromise = page.waitForResponse(response =>
    response.url().endsWith('/api/experiments/run') &&
    response.request().postDataJSON()?.experimentId === id);
  await page.locator('#run-btn').click();
  const response = await responsePromise;
  const payload = await response.json();
  expect(response.status(), JSON.stringify(payload)).toBe(200);
  await expect(page.locator('#exec-status')).toHaveText(/^Completed in [\d.]+ms$/);
  await expect(page.locator('#run-btn')).toBeEnabled();
  await expect(page.locator('#stage-viewport')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#json-output')).toContainText(`"experimentId": "${id}"`);
  expect(payload.data).toBeDefined();
  return payload;
}

export async function openHub(page, tab) {
  await page.locator('#journey-link').click();
  await expect(page.locator('#journey-view')).toBeVisible();
  await page.locator(`[data-qh-tab="${tab}"]`).click();
  await expect(page.locator('#qh-panel')).toHaveAttribute('aria-labelledby', `qh-tab-${tab}`);
}

export async function savedProgress(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('backend-lab-learning-v1')));
}
