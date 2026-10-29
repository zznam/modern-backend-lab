import { readFile } from 'node:fs/promises';
import { test, expect, runLab, openHub, savedProgress } from './fixtures.js';

test('search, combined filters, keyboard tabs, paths, and completion survive reload', async ({ page }) => {
  await page.goto('/');
  await page.locator('#topic-level').selectOption('advanced');
  await page.locator('#topic-search').fill('raft');
  await expect(page.locator('.nav-item:visible')).toHaveCount(1);
  await page.locator('[data-exp="consensus-quorum"]').click();
  await expect(page.locator('#exp-title')).toContainText('Consensus');
  const jsonTab = page.locator('[data-tab="json"]');
  await jsonTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-tab="architecture"]')).toBeFocused();
  await expect(page.locator('#tab-architecture')).toBeVisible();
  await page.locator('#topic-search').fill('no-such-lab');
  await expect(page.locator('#no-topics')).toBeVisible();
  await page.locator('#clear-filters').click();
  await expect(page.locator('.nav-item:visible')).toHaveCount(46);
  await page.locator('#learning-path').selectOption('distributed');
  await page.locator('#mark-complete').click();
  await expect(page.locator('#mark-complete')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('#learning-path')).toHaveValue('distributed');
  await expect(page.locator('#mark-complete')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#progress-label')).toHaveText('1 of 10 completed');
  await page.locator('#next-topic').click();
  await expect(page).toHaveURL(/#fencing-tokens$/);
});

test('favorites, practice queue, confidence, and private reflection persist', async ({ page }) => {
  await page.goto('/#event-loop');
  await page.locator('#quest-lab-favorite').click();
  await page.locator('#quest-lab-queue').click();
  await page.reload();
  await expect(page.locator('#quest-lab-favorite')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#quest-lab-queue')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#quest-lab-reflect').click();
  await page.locator('[data-qh-field="confidence"]').selectOption('2');
  await page.locator('#qh-note').fill('Microtasks run before the next task. <script>example</script>');
  await expect(page.locator('#qh-note-status')).toContainText('Unsaved changes');
  await page.getByRole('button', { name: 'Save reflection', exact: true }).click();
  await expect(page.locator('#qh-note-status')).toContainText('Reflection saved');
  await page.locator('#qh-note').fill('An unsaved revision');
  await page.getByRole('button', { name: 'Discard unsaved changes', exact: true }).click();
  await expect(page.locator('#qh-note')).toHaveValue('Microtasks run before the next task. <script>example</script>');
  await expect(page.locator('#qh-note')).toBeFocused();
  await page.reload();
  await openHub(page, 'practice');
  await expect(page.locator('#qh-note')).toHaveValue('Microtasks run before the next task. <script>example</script>');
  await expect(page.locator('[data-qh-field="confidence"]')).toHaveValue('2');
  await page.getByRole('button', { name: 'Resume queue →', exact: true }).click();
  await runLab(page, 'event-loop');
  await expect(page.locator('#quest-lab-queue')).toHaveAttribute('aria-pressed', 'false');
  expect((await savedProgress(page)).quests.queue).toEqual([]);
});

test('campaign and sprint advance through real runs with no repeat rewards', async ({ page }) => {
  await page.goto('/#journey');
  await openHub(page, 'practice');
  await page.getByRole('button', { name: '2-lab sprint', exact: true }).click();
  await openHub(page, 'campaigns');
  await page.locator('[data-qh-action="start-campaign"][data-value="runtime-foundations"]').click();
  for (const id of ['event-loop', 'data-structures', 'observability']) {
    await page.locator(`[data-exp="${id}"]`).click();
    await runLab(page, id);
  }
  await openHub(page, 'campaigns');
  await page.locator('[data-qh-action="claim-campaign"][data-value="runtime-foundations"]').click();
  const before = await savedProgress(page);
  expect(before.quests.campaigns['runtime-foundations'].claimed).toBe(true);
  expect(before.quests.sprint.status).toBe('complete');
  await page.locator('#journey-resume').click();
  await page.locator('[data-exp="event-loop"]').click();
  await runLab(page, 'event-loop');
  const after = await savedProgress(page);
  expect(after.quests.sprintRewards).toEqual(before.quests.sprintRewards);
  expect(after.quests.campaigns).toEqual(before.quests.campaigns);
  expect(after.journey.runs).toEqual(before.journey.runs);
});

test('knowledge checks reward one correct answer and retain keyboard navigation', async ({ page }) => {
  await page.goto('/#journey');
  await openHub(page, 'knowledge');
  await page.getByRole('radio', { name: 'Check the authoritative data store', exact: true }).check();
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(page.locator('.qh-explanation')).toContainText('Correct');
  await expect(page.locator('#journey-total-xp')).toHaveText('35');
  await page.getByRole('button', { name: 'Practice this question again', exact: true }).click();
  await page.getByRole('radio', { name: 'Check the authoritative data store', exact: true }).check();
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(page.locator('#journey-total-xp')).toHaveText('35');
  await page.locator('[data-qh-tab="knowledge"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-qh-tab="practice"]')).toBeFocused();
  await expect(page.locator('#qh-panel')).toHaveAttribute('aria-labelledby', 'qh-tab-practice');
});

test('downloaded backup restores notes and progress, merges twice, and rejects malformed data', async ({ page, browser }, testInfo) => {
  await page.goto('/#event-loop');
  await page.locator('#mark-complete').click();
  await page.locator('#quest-lab-favorite').click();
  await page.locator('#quest-lab-reflect').click();
  await page.locator('#qh-note').fill('Keep this reflection in the backup.');
  await page.getByRole('button', { name: 'Save reflection', exact: true }).click();
  await openHub(page, 'progress');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download quest progress', exact: true }).click();
  const download = await downloaded;
  const path = testInfo.outputPath('learning-backup.json');
  await download.saveAs(path);
  const content = await readFile(path);
  const { baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent } = testInfo.project.use;
  const context = await browser.newContext({ baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent });
  const errors = [];
  try {
    const restored = await context.newPage();
    restored.on('pageerror', error => errors.push(error.message));
    await restored.route('https://fonts.googleapis.com/**', route => route.abort());
    await restored.route('https://fonts.gstatic.com/**', route => route.abort());
    await restored.goto('/#journey');
    await openHub(restored, 'progress');
    const upload = restored.locator('[data-qh-field="import"]');
    await upload.setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: content });
    await expect(restored.locator('.qh-status')).toContainText('merged');
    await expect(upload).toHaveValue('');
    const once = await savedProgress(restored);
    expect(once.completed).toContain('event-loop');
    expect(once.quests.notes['event-loop']).toBe('Keep this reflection in the backup.');
    await upload.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{invalid') });
    await expect(restored.locator('.qh-status')).toContainText(/valid|JSON/);
    await expect(upload).toHaveValue('');
    expect(await savedProgress(restored)).toEqual(once);
    await upload.setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: content });
    await expect(restored.locator('.qh-status')).toContainText('merged');
    await expect(upload).toHaveValue('');
    expect(await savedProgress(restored)).toEqual(once);
  } finally {
    await context.close();
  }
  expect(errors, 'Uncaught errors in the fresh restore browser context').toEqual([]);
});

test('all quest sections and rendered labs fit a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#replication-quorums');
  await runLab(page, 'replication-quorums');
  async function checkWidth() {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  }
  await checkWidth();
  for (const tab of ['overview', 'campaigns', 'knowledge', 'practice', 'profile', 'progress']) {
    await openHub(page, tab);
    await checkWidth();
  }
});
