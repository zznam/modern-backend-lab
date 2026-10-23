import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { runConsensusLab } from '../src/05-advanced-systems/consensus.js';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<link\b[^>]*>/g, '');
const scripts = ['curriculum.js', 'quest-catalog.js', 'quest-engine.js', 'quest-ui.js', 'journey.js', 'app.js']
  .map(file => readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8')).join('\n');
const windows: Window[] = [];
const storageKey = 'backend-lab-learning-v1';
function load(hash = '#journey', stored?: string, blocked = false) {
  const win = new Window({ url: `https://backend-lab.test/${hash}`, settings: {
    enableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true,
    enableCSSFileLoading: false, enableImageFileLoading: false,
    suppressInsecureJavaScriptEnvironmentWarning: true,
  } });
  windows.push(win);
  win.document.write(html);
  if (stored) win.localStorage.setItem(storageKey, stored);
  if (blocked) Object.defineProperty(win, 'localStorage', { get: () => { throw new Error('Storage blocked'); } });
  const fetch = vi.fn().mockRejectedValue(new Error('No response configured'));
  win.fetch = fetch;
  win.eval(`${scripts}\nwindow.quests = questEngine; window.hub = questHub; window.learning = journey;`);
  const el = (selector: string) => {
    const item = win.document.querySelector(selector);
    if (!item) throw new Error(`Missing ${selector}`);
    return item as any;
  };
  return { win, el, fetch, saved: () => win.localStorage.getItem(storageKey)! };
}
afterEach(() => windows.splice(0).forEach(win => win.close()));

describe('Quest hub application integration', () => {
  it('preserves old completion XP and loads the new hub for existing profiles', () => {
    const ui = load('#journey', JSON.stringify({ completed: ['event-loop'], journey: { runs: ['event-loop'] } }));
    expect(ui.el('#journey-total-xp').textContent).toBe('70');
    expect(ui.el('#quest-hub').textContent).toContain('Campaign');
    expect(ui.win.eval('quests.xp()')).toBe(0);
    expect(JSON.parse(ui.saved()).quests.version).toBe(1);
  });

  it('offers persistent favorites and queue shortcuts inside the current lab', () => {
    const ui = load('#consensus-quorum');
    ui.el('#quest-lab-favorite').click();
    ui.el('#quest-lab-queue').click();
    expect(ui.el('#quest-lab-favorite').getAttribute('aria-pressed')).toBe('true');
    expect(ui.el('#quest-lab-queue').getAttribute('aria-pressed')).toBe('true');
    const restored = load('#consensus-quorum', ui.saved());
    expect(restored.el('#quest-lab-favorite').getAttribute('aria-pressed')).toBe('true');
    restored.el('#quest-lab-queue').click();
    expect(JSON.parse(restored.saved()).quests.queue).toEqual([]);
    restored.el('#quest-lab-reflect').click();
    expect(restored.el('#journey-view').hidden).toBe(false);
    expect(restored.win.location.hash).toBe('#journey');
  });

  it('advances campaigns and focus sprints only after a successful current API response', async () => {
    const ui = load('#consensus-quorum');
    ui.win.eval("quests.startCampaign('safe-concurrency'); quests.startSprint(2); learning.render()");
    ui.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Unavailable' }) });
    ui.el('#run-btn').click();
    await vi.waitFor(() => expect(ui.el('#exec-status').textContent).toBe('Error'));
    expect(ui.win.eval("quests.campaignProgress('safe-concurrency').value")).toBe(0);
    expect(ui.win.eval('quests.state.sprint.topics.length')).toBe(0);
    ui.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: runConsensusLab(), executionDurationMs: 2 }) });
    ui.el('#run-btn').click();
    await vi.waitFor(() => expect(ui.el('#exec-status').textContent).toBe('Completed in 2ms'));
    expect(ui.win.eval("quests.campaignProgress('safe-concurrency').value")).toBe(1);
    expect(ui.win.eval('quests.state.sprint.topics.length')).toBe(1);
    expect(ui.el('#quest-run-tracker').hidden).toBe(false);
    expect(ui.el('#quest-run-status').textContent).toContain('1 / 4');
    expect(JSON.parse(ui.saved()).quests.campaigns['safe-concurrency'].steps).toEqual(['consensus-quorum']);
  });

  it('ignores a successful response that belongs to an abandoned lab', async () => {
    const ui = load('#consensus-quorum');
    ui.win.eval("quests.startCampaign('safe-concurrency'); quests.startSprint(2)");
    let finish!: (value: unknown) => void;
    ui.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    ui.el('#run-btn').click();
    ui.el('[data-exp="event-loop"]').click();
    finish({ ok: true, json: async () => ({ data: runConsensusLab(), executionDurationMs: 2 }) });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(ui.win.eval("quests.campaignProgress('safe-concurrency').value")).toBe(0);
    expect(ui.win.eval('quests.state.sprint.topics.length')).toBe(0);
  });

  it('includes knowledge rewards in the existing level display without repeat farming', () => {
    const ui = load();
    ui.win.eval("quests.answerQuiz('bloom-membership', 1); learning.render(); saveLearning()");
    expect(ui.el('#journey-total-xp').textContent).toBe('35');
    ui.win.eval("quests.retryQuiz('bloom-membership'); quests.answerQuiz('bloom-membership', 1); learning.render(); saveLearning()");
    expect(ui.el('#journey-total-xp').textContent).toBe('35');
    const restored = load('#journey', ui.saved());
    expect(restored.el('#journey-total-xp').textContent).toBe('35');
    expect(restored.win.eval('quests.coins()')).toBe(15);
  });

  it('keeps quest actions usable when browser storage is blocked', () => {
    const ui = load('#event-loop', undefined, true);
    ui.el('#quest-lab-favorite').click();
    ui.el('#quest-lab-queue').click();
    expect(ui.el('#quest-lab-favorite').getAttribute('aria-pressed')).toBe('true');
    expect(ui.el('#quest-lab-queue').getAttribute('aria-pressed')).toBe('true');
    expect(ui.el('#journey-storage').textContent).toContain('only for this session');
  });

  it('renders profile and journal text as text rather than executable markup', () => {
    const ui = load();
    ui.win.eval(`quests.setProfile('alias', '<img src=x onerror=alert(1)>');
      quests.saveNote('event-loop', '<svg onload=alert(1)>'); hub.open('profile'); learning.render();`);
    expect(ui.win.document.querySelector('#quest-hub img')).toBeNull();
    expect(ui.win.document.querySelector('#quest-hub svg')).toBeNull();
    ui.win.eval("hub.open('practice', 'event-loop'); learning.render()");
    expect(ui.win.document.querySelector('#quest-hub svg')).toBeNull();
  });

  it('restores quest and original journey progress together without duplicating either reward', () => {
    const source = load('#event-loop');
    source.el('#mark-complete').click();
    source.win.eval("learning.recordRun('event-loop'); quests.answerQuiz('bloom-membership', 1); quests.toggleFavorite('event-loop')");
    const backup = source.win.eval('quests.exportData()');
    const target = load('#consensus-quorum');
    target.el('#mark-complete').click();
    target.win.eval(`quests.importData(${JSON.stringify(backup)}); updateCurriculum(); saveLearning()`);
    expect(target.el('#journey-total-xp').textContent).toBe('155');
    target.win.eval(`quests.importData(${JSON.stringify(backup)}); updateCurriculum(); saveLearning()`);
    expect(target.el('#journey-total-xp').textContent).toBe('155');
    expect(JSON.parse(target.saved()).completed).toEqual(['consensus-quorum', 'event-loop']);
    expect(JSON.parse(target.saved()).quests.favorites).toEqual(['event-loop']);
    target.win.eval('quests.reset(); updateCurriculum(); saveLearning()');
    expect(target.el('#journey-total-xp').textContent).toBe('120');
    expect(JSON.parse(target.saved()).completed).toHaveLength(2);
  });
});

describe('Quest hub regression interactions', () => {
  it('restores validated journey preferences and their visible controls through file import', async () => {
    const source = load();
    source.win.eval(`learning.state.goal = 5; learning.state.range = 28; learning.state.reviewInterval = 14;
      learning.state.challenges.incident = { started: learning.dateKey(), steps: [], claimed: false };
      learning.state.activeChallenge = 'incident'; learning.state.pinnedBadge = 'discovery';
      learning.recordRun('event-loop');`);
    const backup = source.win.eval('quests.exportData()');
    const target = load();
    await target.win.eval(`hub.importFile({ size: ${Buffer.byteLength(backup)}, text: async () => ${JSON.stringify(backup)} })`);
    expect(target.win.eval('learning.state')).toMatchObject({ goal: 5, range: 28, reviewInterval: 14, activeChallenge: 'incident', pinnedBadge: 'discovery' });
    expect(target.el('#daily-goal').value).toBe('5');
    expect(target.el('#activity-range').value).toBe('28');
    expect(target.el('#review-interval').value).toBe('14');
    expect(JSON.parse(target.saved()).journey.activeChallenge).toBe('incident');

    const invalid = JSON.parse(backup);
    Object.assign(invalid.journey, { goal: 99, range: 99, reviewInterval: 99, activeChallenge: 'unknown', pinnedBadge: 'unknown' });
    const fresh = load();
    fresh.win.eval(`quests.importData(${JSON.stringify(JSON.stringify(invalid))}); learning.render()`);
    expect(fresh.win.eval('learning.state')).toMatchObject({ goal: 3, range: 7, reviewInterval: 7, activeChallenge: null, pinnedBadge: null });
    expect(fresh.el('#daily-goal').value).toBe('3');
    expect(fresh.el('#activity-range').value).toBe('7');
    expect(fresh.el('#review-interval').value).toBe('7');
  });

  it('keeps sprint history expanded and keyboard focus stable through refreshes', () => {
    const ui = load();
    ui.win.eval("quests.startSprint(2); learning.recordRun('event-loop'); learning.recordRun('data-structures'); hub.open('practice')");
    ui.el('[data-qh-details="sprint-history"]').open = true;
    ui.el('[data-qh-focus="sprint-history"]').focus();
    ui.win.dispatchEvent(new ui.win.Event('focus'));
    expect(ui.el('[data-qh-details="sprint-history"]').open).toBe(true);
    expect(ui.win.document.activeElement).toBe(ui.el('[data-qh-focus="sprint-history"]'));
    ui.el('[data-qh-tab="overview"]').click();
    ui.el('[data-qh-tab="practice"]').click();
    expect(ui.el('[data-qh-details="sprint-history"]').open).toBe(true);
    ui.el('[data-qh-details="sprint-history"]').open = false;
    ui.win.dispatchEvent(new ui.win.Event('focus'));
    expect(ui.el('[data-qh-details="sprint-history"]').open).toBe(false);
  });

  it('retries a missed quiz without switching questions and retains draft answers through refresh', () => {
    const ui = load();
    ui.el('[data-qh-tab="knowledge"]').click();
    ui.el('input[name="qh-answer"][value="0"]').click();
    ui.el('[data-qh-form="quiz"]').dispatchEvent(new ui.win.Event('submit', { bubbles: true, cancelable: true }));
    const filter = ui.el('[data-qh-field="quiz-mode"]');
    filter.value = 'missed'; filter.dispatchEvent(new ui.win.Event('change', { bubbles: true }));
    ui.el('[data-qh-action="retry-quiz"]').click();
    expect(ui.el('[data-qh-field="quiz-choice"]').value).toBe('bloom-membership');
    ui.el('input[name="qh-answer"][value="1"]').click();
    ui.win.dispatchEvent(new ui.win.Event('focus'));
    expect(ui.el('input[name="qh-answer"][value="1"]').checked).toBe(true);
    ui.el('[data-qh-form="quiz"]').dispatchEvent(new ui.win.Event('submit', { bubbles: true, cancelable: true }));
    expect(ui.el('#journey-total-xp').textContent).toBe('35');
    expect(ui.el('.qh-explanation').textContent).toContain('Correct');
  });

  it('merges evidenced original journey bonuses and quest claims without losing either', () => {
    const source = load();
    source.win.eval(`
      ['rate-limiting','circuit-breaker','retry-backoff','event-loop','data-structures'].forEach(key => learning.recordRun(key));
      learning.claimMission('explore');
    `);
    source.el('[data-challenge="incident"]').click();
    source.win.eval(`['rate-limiting','circuit-breaker','retry-backoff'].forEach(key => learning.recordRun(key));
      learning.claimChallenge('incident'); quests.answerQuiz('bloom-membership', 1); quests.claimMilestone('quiz-debut');`);
    const backup = source.win.eval('quests.exportData()');
    const target = load('#event-loop');
    target.el('#mark-complete').click();
    target.win.eval(`quests.importData(${JSON.stringify(backup)}); updateCurriculum(); saveLearning()`);
    expect(target.win.eval('learning.bonusXP()')).toBe(180);
    expect(target.el('#journey-total-xp').textContent).toBe('385');
    target.win.eval(`quests.importData(${JSON.stringify(backup)}); updateCurriculum(); saveLearning()`);
    const restored = load('#journey', target.saved());
    expect(restored.el('#journey-total-xp').textContent).toBe('385');
    expect(restored.win.eval("learning.state.challenges.incident.claimed")).toBe(true);
    expect(restored.win.eval('quests.state.milestoneClaims')).toEqual(['quiz-debut']);
  });

  it('hides expired sprint tracking and offers a fresh target when a tab spans midnight', () => {
    const ui = load('#event-loop');
    ui.win.eval(`window.RealDate = Date; window.clock = new RealDate(2026, 9, 23, 23, 59);
      Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } };
      quests.startSprint(2); learning.render();`);
    expect(ui.el('#quest-run-tracker').hidden).toBe(false);
    ui.win.eval('clock = new RealDate(2026, 9, 24, 0, 1); learning.render()');
    expect(ui.el('#quest-run-tracker').hidden).toBe(true);
    ui.win.eval("hub.open('practice')");
    expect(ui.win.document.querySelector('[data-qh-action="toggle-sprint"]')).toBeNull();
    expect(ui.win.document.querySelectorAll('[data-qh-action="start-sprint"]')).toHaveLength(3);
  });
});
