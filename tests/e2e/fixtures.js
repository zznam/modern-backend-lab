import { test as base, expect } from '@playwright/test';

export const test = base.extend({
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
