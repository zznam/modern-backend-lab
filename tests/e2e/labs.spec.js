import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test, expect, runLab } from './fixtures.js';

const html = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const topics = [...html.matchAll(/data-exp="([^"]+)"/g)].map(match => match[1]);
const curriculum = readFileSync(new URL('../../public/curriculum.js', import.meta.url), 'utf8');
const presets = runInNewContext(`${curriculum}\nObject.entries(ADVANCED_TOPICS).flatMap(([id, topic]) => (topic.scenarios || []).map(scenario => ({ id, ...scenario })))`);

for (const id of topics) {
  test(`real browser runs and renders ${id}`, async ({ page }) => {
    await page.goto('/');
    await page.locator(`[data-exp="${id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await runLab(page, id);
    await expect(page.locator('#stage-viewport')).not.toHaveText('');
    await expect(page.locator('#metrics-cards')).not.toHaveText('');
  });
}

for (const preset of presets) {
  test(`scenario ${preset.id}: ${preset.label}`, async ({ page }) => {
    await page.goto(`/#${preset.id}`);
    await page.getByRole('button', { name: preset.label, exact: true }).click();
    const request = page.waitForRequest('**/api/experiments/run');
    await runLab(page, preset.id);
    expect((await request).postDataJSON()).toEqual({ experimentId: preset.id, params: preset.params });
    await expect(page.locator('.result-summary')).toBeVisible();
  });
}

test('scenario controls reach the server and compare successive results', async ({ page }) => {
  await page.goto('/#replication-quorums');
  await page.getByRole('button', { name: 'Stale read', exact: true }).click();
  const stale = await runLab(page, 'replication-quorums');
  await page.getByRole('button', { name: 'Overlapping quorums', exact: true }).click();
  const fresh = await runLab(page, 'replication-quorums');
  expect(fresh.data).not.toEqual(stale.data);
  await expect(page.getByRole('region', { name: 'Run comparison' })).toBeVisible();
  await expect(page.locator('.comparison-changed')).not.toHaveCount(0);
  await page.locator('#param-readQuorum').fill('0');
  await page.locator('#run-btn').click();
  await expect(page.locator('#exec-status')).toHaveText('Idle (Ready)');
  expect(await page.locator('#param-readQuorum').evaluate(input => input.validity.valid)).toBe(false);
});

test('failed network requests show an error, retain progress, and can be retried', async ({ page }) => {
  await page.goto('/#event-loop');
  await page.route('**/api/experiments/run', route => route.abort('failed'));
  await page.locator('#run-btn').click();
  await expect(page.locator('#exec-status')).toHaveText('Error');
  await expect(page.locator('#run-btn')).toBeEnabled();
  await expect(page.locator('#journey-xp')).toHaveText('0 XP');
  await page.unroute('**/api/experiments/run');
  await runLab(page, 'event-loop');
  await expect(page.locator('#journey-xp')).toHaveText('20 XP');
});

for (const action of ['cancel', 'timeout']) {
  test(`${action} stops waiting for a run without awarding progress, then permits retry`, async ({ page }) => {
    if (action === 'timeout') await page.clock.install();
    await page.goto('/#event-loop');
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let intercepted;
    const started = new Promise(resolve => { intercepted = resolve; });
    await page.route('**/api/experiments/run', async route => {
      intercepted();
      await gate;
      await route.fulfill({ json: { experimentId: 'event-loop', data: {}, executionDurationMs: 1 } }).catch(() => {});
    });
    await page.locator('#run-btn').click();
    await started;
    await expect(page.locator('#cancel-run-btn')).toBeVisible();
    if (action === 'cancel') await page.locator('#cancel-run-btn').click();
    else await page.clock.fastForward(30_001);
    await expect(page.locator('#exec-status')).toHaveText(action === 'cancel' ? 'Cancelled' : 'Timeout');
    await expect(page.locator('#cancel-run-btn')).toBeHidden();
    await expect(page.locator('#run-btn')).toBeEnabled();
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await expect(page.locator('#journey-xp')).toHaveText('0 XP');
    if (action === 'timeout') await page.clock.resume();
    await runLab(page, 'event-loop');
    await expect(page.locator('#journey-xp')).toHaveText('20 XP');
  });
}
