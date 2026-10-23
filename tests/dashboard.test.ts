import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { runConsensusLab } from '../src/05-advanced-systems/consensus.js';
import { runFencingLab } from '../src/05-advanced-systems/fencing.js';
import { runEventSourcingLab } from '../src/05-advanced-systems/event-sourcing.js';
import { runSnapshotLab } from '../src/05-advanced-systems/snapshot-isolation.js';
import { runBackpressureLab } from '../src/05-advanced-systems/backpressure.js';
import { runSloLab } from '../src/05-advanced-systems/slo-burn.js';
import { runReplicationLab } from '../src/05-advanced-systems/replication-quorums.js';
import { runLsmLab } from '../src/05-advanced-systems/lsm-compaction.js';
import { runTwoPhaseCommitLab } from '../src/05-advanced-systems/two-phase-commit.js';
import { runStreamWatermarkLab } from '../src/05-advanced-systems/stream-watermarks.js';

// This is a local DOM unit harness, not a real browser. All resources and
// requests are disabled/mocked; only trusted repository scripts are evaluated.
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<link\b[^>]*>/g, '');
const scripts = ['curriculum.js', 'journey.js', 'app.js'].map(file => readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8')).join('\n');
const windows: Window[] = [];
const storageKey = 'backend-lab-learning-v1';
function load(hash = '', stored?: string, blockStorage = false) {
  const win = new Window({ url: `https://backend-lab.test/${hash}`, settings: {
    enableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true,
    enableCSSFileLoading: false, enableImageFileLoading: false,
    suppressInsecureJavaScriptEnvironmentWarning: true,
    fetch: { interceptor: { beforeAsyncRequest: () => { throw new Error('Network is disabled in DOM tests'); } } },
  } });
  windows.push(win);
  win.document.write(html);
  if (stored !== undefined) win.localStorage.setItem(storageKey, stored);
  if (blockStorage) Object.defineProperty(win, 'localStorage', { get: () => { throw new Error('Storage blocked'); } });
  const fetch = vi.fn().mockRejectedValue(new Error('No response configured'));
  win.fetch = fetch;
  win.eval(scripts + '\nwindow.testJourney = journey;');
  const el = (selector: string) => {
    const found = win.document.querySelector(selector);
    if (!found) throw new Error(`Missing element ${selector}`);
    return found as any;
  };
  const change = (selector: string, value: string) => {
    el(selector).value = value;
    el(selector).dispatchEvent(new win.Event(selector === '#topic-search' ? 'input' : 'change', { bubbles: true }));
  };
  const shown = () => [...win.document.querySelectorAll('.nav-item')].filter(item => !item.hasAttribute('hidden')).map(item => item.getAttribute('data-exp'));
  return { win, el, change, shown, fetch };
}
afterEach(() => { windows.splice(0).forEach(win => win.close()); });

describe('Dashboard learning interactions', () => {
  it('searches all topics, combines filters, and recovers from an empty result', () => {
    const ui = load();
    expect(ui.shown()).toHaveLength(46);
    ui.change('#topic-level', 'advanced');
    expect(ui.shown()).toHaveLength(10);
    ui.change('#topic-search', 'raft');
    expect(ui.shown()).toEqual(['consensus-quorum']);
    ui.change('#topic-search', 'no-such-concept');
    expect(ui.shown()).toEqual([]);
    expect(ui.el('#no-topics').hidden).toBe(false);
    ui.el('#clear-filters').click();
    expect(ui.shown()).toHaveLength(46);
    expect(ui.el('#no-topics').hidden).toBe(true);
  });

  it('persists completion and the selected path, resumes on reload, and lets deep links take priority', () => {
    const ui = load('#event-sourcing');
    ui.change('#learning-path', 'distributed');
    ui.el('#mark-complete').click();
    expect(ui.el('#mark-complete').getAttribute('aria-pressed')).toBe('true');
    expect(ui.el('#progress-label').textContent).toBe('1 of 10 completed');
    const stored = ui.win.localStorage.getItem(storageKey)!;
    const resumed = load('', stored);
    expect(resumed.el('#exp-title').textContent).toContain('Event Sourcing');
    expect(resumed.el('#learning-path').value).toBe('distributed');
    resumed.el('#next-topic').click();
    expect(resumed.el('#exp-title').textContent).toContain('Snapshot Isolation');
    const linked = load('#backpressure', stored);
    expect(linked.el('#exp-title').textContent).toContain('Backpressure');
    linked.change('#topic-status', 'completed');
    expect(linked.shown()).toEqual(['event-sourcing']);
    linked.el('[data-exp="event-sourcing"]').click();
    linked.el('#mark-complete').click();
    expect(linked.shown()).toHaveLength(0);
  });

  it('survives malformed state, invalid hashes, and unavailable local storage', () => {
    expect(load('#%E0%A4%A', '{bad-json').el('#exp-title').textContent).toContain('Event Loop');
    expect(load('#unknown', '{"completed":["unknown"],"path":"__proto__"}').el('#progress-label').textContent).toBe('0 of 46 completed');
    const blocked = load('#fencing-tokens', undefined, true);
    blocked.el('#mark-complete').click();
    expect(blocked.el('#mark-complete').getAttribute('aria-pressed')).toBe('true');
    expect(blocked.el('.local-note').textContent).toBe('Session only');
  });

  it('opens prerequisite links and provides keyboard-operated tabs', () => {
    const ui = load('#snapshot-isolation');
    ui.el('[data-topic="acid-transactions"]').click();
    expect(ui.win.location.hash).toBe('#acid-transactions');
    const firstTab = ui.el('[data-tab="json"]');
    firstTab.dispatchEvent(new ui.win.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(ui.el('[data-tab="challenge"]').getAttribute('aria-selected')).toBe('true');
    expect(ui.el('#tab-challenge').classList.contains('active')).toBe(true);
    expect(ui.el('#tab-challenge').getAttribute('aria-labelledby')).toBe('tab-button-challenge');
  });

  it.each([
    ['consensus-quorum', runConsensusLab], ['fencing-tokens', runFencingLab],
    ['event-sourcing', runEventSourcingLab], ['snapshot-isolation', runSnapshotLab],
    ['backpressure', runBackpressureLab], ['slo-burn-rate', runSloLab],
    ['replication-quorums', runReplicationLab], ['lsm-compaction', runLsmLab],
    ['two-phase-commit', runTwoPhaseCommitLab], ['stream-watermarks', runStreamWatermarkLab],
  ] as const)('submits and renders the full %s result', async (id, run) => {
    const ui = load(`#${id}`);
    const data = run();
    ui.fetch.mockResolvedValue({ ok: true, json: async () => ({ experimentId: id, executionDurationMs: 2, data }) });
    ui.el('#run-btn').click();
    await vi.waitFor(() => expect(ui.el('#exec-status').textContent).toBe('Completed in 2ms'));
    const request = JSON.parse(ui.fetch.mock.calls[0][1].body);
    expect(request.experimentId).toBe(id);
    expect(Object.values(request.params).every(value => typeof value === 'number')).toBe(true);
    expect(ui.win.document.querySelectorAll('.metric-card')).toHaveLength(3);
    expect(ui.win.document.querySelectorAll('.trace-list .flow-step')).toHaveLength(data.steps.length);
    expect(ui.el('.model-note').textContent).toContain(data.model);
    expect(ui.el('#json-output').textContent).toContain(id);
    expect(ui.el('#run-btn').disabled).toBe(false);
  });

  it('renders validation errors and rejects a stale result after topic navigation', async () => {
    const ui = load('#consensus-quorum');
    ui.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'clusterSize must be odd' }) });
    ui.el('#run-btn').click();
    await vi.waitFor(() => expect(ui.el('#exec-status').textContent).toBe('Error'));
    expect(ui.el('#json-output').textContent).toContain('clusterSize must be odd');
    let finish!: (value: unknown) => void;
    ui.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    ui.el('#run-btn').click();
    ui.el('[data-exp="fencing-tokens"]').click();
    finish({ ok: true, json: async () => ({ data: runConsensusLab(), executionDurationMs: 3 }) });
    await vi.waitFor(() => expect(ui.el('#run-btn').disabled).toBe(false));
    expect(ui.el('#exp-title').textContent).toContain('Fencing');
    expect(ui.el('#exec-status').textContent).toBe('Idle (Ready)');
    expect(ui.win.document.querySelectorAll('.metric-card')).toHaveLength(0);
  });

  it('keeps the reachable-voter control valid when cluster membership is reduced', async () => {
    const ui = load('#consensus-quorum');
    ui.change('#param-clusterSize', '3');
    expect(ui.el('#param-availableNodes').max).toBe('2');
    expect(ui.el('#param-availableNodes').value).toBe('2');
    ui.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: runConsensusLab(3, 2), executionDurationMs: 1 }) });
    ui.el('#run-btn').click();
    await vi.waitFor(() => expect(ui.el('#exec-status').textContent).toBe('Completed in 1ms'));
    expect(JSON.parse(ui.fetch.mock.calls[0][1].body).params).toEqual({ clusterSize: 3, availableNodes: 2 });
  });

  it('escapes result text before inserting trace markup', async () => {
    const ui = load('#fencing-tokens');
    const data = runFencingLab();
    data.summary = '<img src=x onerror=alert(1)>';
    data.steps[0].title = '<svg onload=alert(1)>';
    ui.fetch.mockResolvedValue({ ok: true, json: async () => ({ data, executionDurationMs: 1 }) });
    ui.el('#run-btn').click();
    await vi.waitFor(() => expect(ui.el('#exec-status').textContent).toBe('Completed in 1ms'));
    expect(ui.el('#stage-viewport').querySelector('img, svg')).toBeNull();
    expect(ui.el('.result-summary').textContent).toContain('<img');
  });

  it('guides the advanced data systems sequence and persists its progress', () => {
    const ui = load('#replication-quorums');
    ui.change('#learning-path', 'data-systems');
    expect(ui.shown()).toHaveLength(11);
    for (const id of ['replication-quorums', 'lsm-compaction', 'two-phase-commit', 'stream-watermarks']) expect(ui.shown()).toContain(id);
    ui.el('#mark-complete').click();
    expect(ui.el('#progress-label').textContent).toBe('1 of 11 completed');
    ui.el('#next-topic').click();
    expect(ui.win.location.hash).toBe('#snapshot-isolation');
    const resumed = load('', ui.win.localStorage.getItem(storageKey)!);
    expect(resumed.el('#learning-path').value).toBe('data-systems');
    expect(resumed.el('#progress-label').textContent).toBe('1 of 11 completed');
  });

  it.each([
    ['replication-quorums', { readQuorum: 1, writeQuorum: 1, failedReplicas: 0 }, runReplicationLab(1, 1, 0)],
    ['lsm-compaction', { memtableLimit: 2, compaction: 1 }, runLsmLab(2, 1)],
    ['two-phase-commit', { crashPoint: 2, rejectVote: 0 }, runTwoPhaseCommitLab(2, 0)],
    ['stream-watermarks', { watermarkLag: 2, allowedLateness: 10 }, runStreamWatermarkLab(2, 10)],
  ] as const)('applies a %s scenario without running until requested', async (id, params, data) => {
    const ui = load(`#${id}`);
    expect(ui.el('#scenario-container').hidden).toBe(false);
    ui.el('[data-scenario="1"]').click();
    expect(ui.fetch).not.toHaveBeenCalled();
    for (const [name, value] of Object.entries(params)) expect(Number(ui.el(`#param-${name}`).value)).toBe(value);
    expect(ui.el('[data-scenario="1"]').getAttribute('aria-pressed')).toBe('true');
    expect(ui.el('#scenario-expectation').textContent).toContain('Predict');
    ui.fetch.mockResolvedValue({ ok: true, json: async () => ({ data, executionDurationMs: 1 }) });
    ui.el('#run-btn').click();
    await vi.waitFor(() => expect(ui.el('#exec-status').textContent).toBe('Completed in 1ms'));
    expect(JSON.parse(ui.fetch.mock.calls[0][1].body).params).toEqual(params);
    expect(ui.el('.run-comparison').textContent).toContain('Your first run');
    ui.el('[data-exp="event-loop"]').click();
    expect(ui.el('#scenario-container').hidden).toBe(true);
  });

  it.each([
    ['replication-quorums', 'readQuorum', '0'], ['replication-quorums', 'writeQuorum', '4'],
    ['replication-quorums', 'failedReplicas', '3'], ['lsm-compaction', 'memtableLimit', '7'],
    ['stream-watermarks', 'watermarkLag', '-1'], ['stream-watermarks', 'allowedLateness', '21'],
  ])('prevents invalid %s %s input from reaching the API', (id, control, value) => {
    const ui = load(`#${id}`);
    ui.change(`#param-${control}`, value);
    ui.el('#run-btn').click();
    expect(ui.fetch).not.toHaveBeenCalled();
    expect(ui.el('#exec-status').textContent).toBe('Idle (Ready)');
  });

  it('clears scenario predictions for missing or invalid settings and restores valid zero settings', async () => {
    const ui = load('#stream-watermarks');
    const selectedScenario = () => ui.win.document.querySelector('[data-scenario][aria-pressed="true"]');
    ui.el('[data-scenario="0"]').click();
    ui.change('#param-watermarkLag', '');
    ui.change('#param-allowedLateness', '');
    expect(selectedScenario()).toBeNull();
    expect(ui.el('#scenario-expectation').textContent).toContain('missing or invalid');
    ui.el('#run-btn').click();
    expect(ui.fetch).not.toHaveBeenCalled();
    ui.change('#param-watermarkLag', '0');
    expect(selectedScenario()).toBeNull();
    ui.change('#param-allowedLateness', '0');
    expect(selectedScenario()?.getAttribute('data-scenario')).toBe('0');
    for (const invalid of ['-1', '0.5']) {
      ui.change('#param-watermarkLag', invalid);
      expect(selectedScenario()).toBeNull();
      expect(ui.el('#scenario-expectation').textContent).toContain('missing or invalid');
      ui.el('#run-btn').click();
      expect(ui.fetch).not.toHaveBeenCalled();
    }
    ui.change('#param-watermarkLag', '0');
    expect(selectedScenario()?.getAttribute('data-scenario')).toBe('0');
    expect(ui.el('#scenario-expectation').textContent).toContain('Predict early cleanup');
    ui.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: runStreamWatermarkLab(0, 0), executionDurationMs: 1 }) });
    ui.el('#run-btn').click();
    await vi.waitFor(() => expect(ui.el('#exec-status').textContent).toBe('Completed in 1ms'));
    expect(JSON.parse(ui.fetch.mock.calls[0][1].body).params).toEqual({ watermarkLag: 0, allowedLateness: 0 });
  });

  it('compares successful same-topic runs, snapshots their settings, and clears comparisons on reload', async () => {
    const ui = load('#replication-quorums');
    ui.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: runReplicationLab(), executionDurationMs: 1 }) });
    ui.el('#run-btn').click();
    await vi.waitFor(() => expect(ui.el('#exec-status').textContent).toBe('Completed in 1ms'));
    ui.el('[data-scenario="1"]').click();
    expect(ui.win.document.querySelector('.run-comparison')).toBeNull();
    expect(ui.win.document.querySelectorAll('.metric-card')).toHaveLength(0);
    ui.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: runReplicationLab(1, 1), executionDurationMs: 2 }) });
    ui.el('#run-btn').click();
    await vi.waitFor(() => expect(ui.el('#exec-status').textContent).toBe('Completed in 2ms'));
    expect(ui.el('.run-comparison').textContent).toContain('Compare your runs');
    expect(ui.el('.run-comparison tbody tr').textContent).toBe('Read quorum (R)21');
    expect(ui.win.document.querySelectorAll('.run-comparison tbody tr')).toHaveLength(6);
    expect(ui.win.document.querySelectorAll('.comparison-changed').length).toBeGreaterThanOrEqual(2);
    const stored = ui.win.localStorage.getItem(storageKey)!;
    expect(Object.keys(JSON.parse(stored)).sort()).toEqual(['completed', 'journey', 'lastTopic', 'path']);
    const resumed = load('#replication-quorums', stored);
    resumed.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: runReplicationLab(), executionDurationMs: 1 }) });
    resumed.el('#run-btn').click();
    await vi.waitFor(() => expect(resumed.el('#exec-status').textContent).toBe('Completed in 1ms'));
    expect(resumed.el('.run-comparison').textContent).toContain('Your first run');
  });

  it('keeps successful history across topic changes but never compares different topics or errors', async () => {
    const ui = load('#lsm-compaction');
    ui.change('#param-memtableLimit', '2');
    ui.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: runLsmLab(2, 1), executionDurationMs: 1 }) });
    ui.el('#run-btn').click();
    await vi.waitFor(() => expect(ui.el('#exec-status').textContent).toBe('Completed in 1ms'));
    ui.el('[data-exp="two-phase-commit"]').click();
    ui.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: runTwoPhaseCommitLab(), executionDurationMs: 2 }) });
    ui.el('#run-btn').click();
    await vi.waitFor(() => expect(ui.el('#exec-status').textContent).toBe('Completed in 2ms'));
    expect(ui.el('.run-comparison').textContent).toContain('Your first run');
    expect(ui.el('.run-comparison').textContent).not.toContain('Entries before flush');
    ui.el('[data-exp="lsm-compaction"]').click();
    ui.change('#param-memtableLimit', '6');
    ui.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Temporarily unavailable' }) });
    ui.el('#run-btn').click();
    await vi.waitFor(() => expect(ui.el('#exec-status').textContent).toBe('Error'));
    expect(ui.win.document.querySelector('.run-comparison')).toBeNull();
    ui.change('#param-memtableLimit', '4');
    ui.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: runLsmLab(4, 1), executionDurationMs: 3 }) });
    ui.el('#run-btn').click();
    await vi.waitFor(() => expect(ui.el('#exec-status').textContent).toBe('Completed in 3ms'));
    expect(ui.el('.run-comparison tbody tr').textContent).toBe('Entries before flush24');
  });

  it('invalidates edited pending runs and prevents old completions from unlocking a newer request', async () => {
    const ui = load('#replication-quorums');
    let finishOld!: (value: unknown) => void;
    let finishNew!: (value: unknown) => void;
    ui.fetch.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    ui.el('#run-btn').click();
    ui.change('#param-readQuorum', '3');
    expect(ui.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(ui.el('#run-btn').disabled).toBe(false);
    expect(ui.el('#stage-viewport').textContent).toContain('Settings changed');
    ui.el('[data-exp="stream-watermarks"]').click();
    ui.fetch.mockImplementationOnce(() => new Promise(resolve => { finishNew = resolve; }));
    ui.el('#run-btn').click();
    finishOld({ ok: true, json: async () => ({ data: runReplicationLab(), executionDurationMs: 1 }) });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(ui.el('#run-btn').disabled).toBe(true);
    expect(ui.el('#stage-viewport').getAttribute('aria-busy')).toBe('true');
    expect(ui.el('#exec-status').textContent).toBe('Running...');
    finishNew({ ok: true, json: async () => ({ data: runStreamWatermarkLab(), executionDurationMs: 2 }) });
    await vi.waitFor(() => expect(ui.el('#exec-status').textContent).toBe('Completed in 2ms'));
    expect(ui.el('.run-comparison').textContent).toContain('Your first run');
    ui.el('[data-exp="replication-quorums"]').click();
    ui.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: runReplicationLab(), executionDurationMs: 3 }) });
    ui.el('#run-btn').click();
    await vi.waitFor(() => expect(ui.el('#exec-status').textContent).toBe('Completed in 3ms'));
    expect(ui.el('.run-comparison').textContent).toContain('Your first run');
  });

  it('escapes both current and previous metric values in the comparison', async () => {
    const ui = load('#fencing-tokens');
    const data = runFencingLab();
    data.metrics[0].label = '<svg onload=alert(1)>';
    data.metrics[0].value = '<img src=x onerror=alert(1)>';
    ui.fetch.mockResolvedValue({ ok: true, json: async () => ({ data, executionDurationMs: 1 }) });
    ui.el('#run-btn').click();
    await vi.waitFor(() => expect(ui.el('#exec-status').textContent).toBe('Completed in 1ms'));
    ui.el('#run-btn').click();
    await vi.waitFor(() => expect(ui.el('#exec-status').textContent).toBe('Completed in 1ms'));
    expect(ui.el('.run-comparison').querySelector('img, svg')).toBeNull();
    expect(ui.el('.run-comparison').textContent).toContain('<img');
    expect(ui.el('.run-comparison').textContent).toContain('Compare your runs');
  });
});

describe('Learning journey', () => {
  async function run(ui: ReturnType<typeof load>) {
    ui.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: runConsensusLab(), executionDurationMs: 2 }) });
    ui.el('#run-btn').click();
    await vi.waitFor(() => expect(ui.el('#exec-status').textContent).toBe('Completed in 2ms'));
  }
  function saved(ui: ReturnType<typeof load>) {
    return JSON.parse(ui.win.localStorage.getItem(storageKey)!);
  }

  it('opens a dedicated deep link, migrates old completions, and returns to the last topic', () => {
    const ui = load('#journey', JSON.stringify({ completed: ['event-loop', 'event-loop', 'bad'], lastTopic: 'fencing-tokens' }));
    expect(ui.win.location.hash).toBe('#journey');
    expect(ui.el('#journey-view').hidden).toBe(false);
    expect(ui.el('#experiment-view').hidden).toBe(true);
    expect(ui.el('#journey-total-xp').textContent).toBe('50');
    expect(ui.el('#journey-streak').textContent).toBe('0');
    expect(ui.el('#journey-link').getAttribute('aria-current')).toBe('page');
    ui.el('#journey-resume').click();
    expect(ui.win.location.hash).toBe('#fencing-tokens');
    expect(ui.el('#journey-view').hidden).toBe(true);
    expect(ui.win.document.activeElement?.id).toBe('exp-title');
  });

  it('awards first-run XP once, tracks distinct daily labs, and reverses completion XP', async () => {
    const ui = load('#consensus-quorum');
    await run(ui);
    expect(ui.el('#journey-total-xp').textContent).toBe('20');
    await run(ui);
    expect(ui.el('#journey-total-xp').textContent).toBe('20');
    expect(ui.el('#daily-feedback').textContent).toBe('1 of 3 labs explored today');
    expect(ui.el('#journey-streak').textContent).toBe('1');
    ui.el('#mark-complete').click();
    expect(ui.el('#journey-total-xp').textContent).toBe('70');
    ui.el('#mark-complete').click();
    expect(ui.el('#journey-total-xp').textContent).toBe('20');
    ui.el('#mark-complete').click();
    expect(ui.el('#journey-total-xp').textContent).toBe('70');
    ui.change('#daily-goal', '1');
    expect(ui.el('#daily-feedback').textContent).toContain('Goal reached!');
    const resumed = load('#journey', ui.win.localStorage.getItem(storageKey)!);
    expect(resumed.el('#journey-total-xp').textContent).toBe('70');
    expect(resumed.el('#daily-goal').value).toBe('1');
    expect(resumed.el('#daily-feedback').textContent).toContain('Goal reached!');
    expect(saved(ui).journey.runs).toEqual(['consensus-quorum']);
  });

  it('does not reward failed or canceled requests, including leaving for the journey page', async () => {
    const ui = load('#consensus-quorum');
    ui.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Failed' }) });
    ui.el('#run-btn').click();
    await vi.waitFor(() => expect(ui.el('#exec-status').textContent).toBe('Error'));
    expect(ui.el('#journey-total-xp').textContent).toBe('0');
    let finish!: (value: unknown) => void;
    ui.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    ui.el('#run-btn').click();
    ui.win.location.hash = 'journey';
    await vi.waitFor(() => expect(ui.el('#journey-view').hidden).toBe(false));
    finish({ ok: true, json: async () => ({ data: runConsensusLab(), executionDurationMs: 2 }) });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(ui.el('#journey-total-xp').textContent).toBe('0');
    expect(saved(ui).journey.runs).toEqual([]);
    ui.win.location.hash = 'consensus-quorum';
    await vi.waitFor(() => expect(ui.el('#journey-view').hidden).toBe(true));
  });

  it('launches the next unfinished path lab and clears conflicting filters', () => {
    const ui = load('#journey', JSON.stringify({ completed: ['event-loop'] }));
    ui.change('#topic-level', 'advanced');
    ui.change('#topic-status', 'completed');
    ui.change('#topic-search', 'absent');
    ui.el('[data-quest="foundations"]').click();
    expect(ui.win.location.hash).toBe('#data-structures');
    expect(ui.el('#learning-path').value).toBe('foundations');
    expect(ui.shown()).toContain('data-structures');
    expect(ui.el('#journey-view').hidden).toBe(true);
    expect(saved(ui).path).toBe('foundations');
  });

  it('shows achievement progress and honest empty filter states', () => {
    const ui = load('#journey');
    ui.el('[data-badge-filter="earned"]').click();
    expect(ui.win.document.querySelectorAll('.journey-badge')).toHaveLength(0);
    expect(ui.el('#badge-empty').hidden).toBe(false);
    ui.el('#mark-complete').click();
    expect(ui.win.document.querySelectorAll('.journey-badge')).toHaveLength(1);
    expect(ui.el('#badge-empty').hidden).toBe(true);
    expect(ui.el('#badge-count').textContent).toBe('1 / 10');
    ui.el('[data-badge-filter="locked"]').click();
    expect(ui.win.document.querySelectorAll('.journey-badge')).toHaveLength(9);
    expect(ui.el('[data-badge-filter="locked"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('uses local calendar days for streak grace, gaps, month boundaries, and midnight refresh', () => {
    const ui = load('#journey');
    // Inject a clock only in this isolated DOM realm.
    ui.win.eval(`
      window.RealDate = Date;
      window.clock = new RealDate(2026, 2, 1, 23, 59);
      Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } };
      testJourney.state.days = { '2026-02-27': ['event-loop'], '2026-02-28': ['event-loop'] };
      testJourney.render();
    `);
    expect(ui.el('#journey-streak').textContent).toBe('2');
    expect(ui.el('#streak-description').textContent).toContain('still alive');
    ui.win.eval("testJourney.recordRun('event-loop')");
    expect(ui.el('#journey-streak').textContent).toBe('3');
    ui.win.eval('clock = new RealDate(2026, 2, 2, 0, 1)');
    ui.win.dispatchEvent(new ui.win.Event('focus'));
    expect(ui.el('#daily-feedback').textContent).toBe('0 of 3 labs explored today');
    expect(ui.el('#journey-streak').textContent).toBe('3');
    ui.win.eval('clock = new RealDate(2026, 2, 3, 0, 1)');
    ui.win.dispatchEvent(new ui.win.Event('focus'));
    expect(ui.el('#journey-streak').textContent).toBe('0');
  });

  it('rejects malformed rewards and keeps working when persistence is blocked', async () => {
    const ui = load('#journey', JSON.stringify({ journey: { goal: 999, runs: ['unknown', '__proto__', 'event-loop', 'event-loop'], days: { '2026-02-30': ['event-loop'], '2999-01-01': ['event-loop'], 'bad': ['event-loop'] } } }));
    expect(ui.el('#journey-total-xp').textContent).toBe('20');
    expect(ui.el('#daily-goal').value).toBe('3');
    expect(saved(ui).journey.days).toEqual({});
    const blocked = load('#consensus-quorum', undefined, true);
    await run(blocked);
    expect(blocked.el('#journey-total-xp').textContent).toBe('20');
    expect(blocked.el('#journey-storage').textContent).toContain('only for this session');
  });

  it('handles all daily labs explored and offers them again on a new day without duplicate XP', () => {
    const ui = load('#journey');
    ui.win.eval(`
      window.RealDate = Date;
      window.clock = new RealDate(2026, 2, 8, 12);
      Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } };
      Object.keys(testJourney.topics).forEach(key => testJourney.recordRun(key));
    `);
    expect(ui.el('#daily-next').disabled).toBe(true);
    expect(ui.el('#journey-total-xp').textContent).toBe('920');
    ui.win.eval('clock = new RealDate(2026, 2, 9, 12)');
    ui.win.dispatchEvent(new ui.win.Event('focus'));
    expect(ui.el('#daily-next').disabled).toBe(false);
    ui.win.eval("testJourney.recordRun('event-loop')");
    expect(ui.el('#journey-total-xp').textContent).toBe('920');
    expect(ui.el('#daily-feedback').textContent).toBe('1 of 3 labs explored today');
    expect(ui.el('#journey-streak').textContent).toBe('2');
  });

  it('keeps earned progress in session if a storage write exceeds quota', async () => {
    const ui = load('#consensus-quorum');
    Object.defineProperty(ui.win, 'localStorage', { value: {
      setItem: () => { throw new Error('Quota exceeded'); },
    } });
    await run(ui);
    expect(ui.el('#journey-total-xp').textContent).toBe('20');
    expect(ui.el('#journey-storage').textContent).toContain('only for this session');
  });

  it('crosses level thresholds, completes path quests, and revisits a finished curriculum', () => {
    const first = load();
    const all = first.shown();
    const ui = load('#journey', JSON.stringify({ completed: all, journey: { runs: all } }));
    expect(ui.el('#journey-total-xp').textContent).toBe('3220');
    expect(ui.el('#journey-level').textContent).toContain('Level 13');
    expect(ui.el('#journey-level-progress').value).toBe(220);
    expect(ui.el('#badge-count').textContent).toBe('8 / 10');
    expect(ui.el('[data-quest="foundations"]').textContent).toBe('Revisit path →');
    ui.el('[data-badge-filter="locked"]').click();
    expect(ui.win.document.querySelectorAll('.journey-badge')).toHaveLength(2);
    expect(ui.el('#badge-empty').hidden).toBe(true);
    ui.el('[data-quest="foundations"]').click();
    expect(ui.win.location.hash).toBe('#event-loop');
  });
});


describe('Weekly missions, skill tracks, and personal records', () => {
  function clock(ui: ReturnType<typeof load>, date: string) {
    ui.win.eval(`
      window.RealDate ||= Date;
      window.clock = new RealDate('${date}T12:00:00');
      Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } };
      testJourney.render();
    `);
  }

  it('counts weekly variety once, claims only eligible rewards, and preserves them after reload and undo', () => {
    const ui = load('#journey');
    clock(ui, '2026-01-01');
    ui.win.eval("testJourney.claimMission('explore'); testJourney.claimMission('__proto__')");
    expect(ui.el('#journey-total-xp').textContent).toBe('0');
    ui.win.eval("['event-loop', 'event-loop', 'data-structures', 'raw-tcp-udp', 'dns-resolution'].forEach(key => testJourney.recordRun(key))");
    expect(ui.el('[data-mission="explore"]').textContent).toContain('Explore a lab');
    expect(ui.el('#journey-total-xp').textContent).toBe('80');
    ui.win.eval("testJourney.recordRun('protocols')");
    const claim = ui.el('[data-mission="explore"]');
    claim.focus();
    claim.click();
    claim.click(); // A stale button cannot claim twice either.
    expect(ui.el('#journey-total-xp').textContent).toBe('160');
    expect(ui.el('[data-mission="explore"]').disabled).toBe(true);
    expect(ui.win.document.activeElement?.id).toBe('mission-feedback');
    expect(ui.el('#mission-feedback').textContent).toContain('+60 XP claimed');
    ui.el('#mark-complete').click();
    ui.el('#mark-complete').click();
    const resumed = load('#journey', ui.win.localStorage.getItem(storageKey)!);
    expect(resumed.el('#journey-total-xp').textContent).toBe('160');
    const state = JSON.parse(resumed.win.localStorage.getItem(storageKey)!);
    expect(state.journey.claims).toEqual({ '2025-12-29': ['explore'] });
    expect(resumed.el('#journey-badges').textContent).toContain('Mission accomplished');
  });

  it('separates local weeks across the year boundary and preserves claimed bonuses', () => {
    const ui = load('#journey');
    clock(ui, '2025-12-29');
    ui.win.eval("testJourney.recordRun('event-loop')");
    expect(ui.el('[data-mission="habit"]').disabled).toBe(true);
    clock(ui, '2025-12-31');
    ui.win.eval("testJourney.recordRun('event-loop')");
    clock(ui, '2026-01-04'); // Sunday still belongs to December 29's week.
    ui.win.eval("testJourney.recordRun('event-loop')");
    expect(ui.el('[data-mission="habit"]').textContent).toContain('Claim +80 XP');
    ui.el('[data-mission="habit"]').click();
    expect(ui.el('#journey-total-xp').textContent).toBe('100');
    clock(ui, '2026-01-05');
    expect(ui.el('[data-mission="habit"]').textContent).toContain('Explore a lab');
    expect(ui.el('[data-mission="habit"]').disabled).toBe(false);
    expect(ui.el('#weekly-missions').textContent).toContain('0 / 3');
    ui.win.eval("testJourney.claimMission('habit'); testJourney.recordRun('event-loop')");
    expect(ui.el('#journey-total-xp').textContent).toBe('100');
    expect(ui.el('[data-mission="habit"]').disabled).toBe(true);
  });

  it('requires all three difficulty levels for the range mission and suggests a missing level', () => {
    const ui = load('#journey');
    clock(ui, '2026-03-04');
    ui.win.eval("testJourney.recordRun('event-loop'); testJourney.recordRun('worker-threads')");
    ui.change('#topic-level', 'foundation');
    ui.change('#topic-status', 'completed');
    ui.change('#topic-search', 'absent');
    ui.el('[data-mission="range"]').click();
    expect(ui.win.location.hash).toBe('#consensus-quorum');
    expect(ui.shown()).toHaveLength(46);
    ui.win.eval("testJourney.recordRun('consensus-quorum')");
    expect(ui.el('[data-mission="range"]').textContent).toContain('Claim +100 XP');
    ui.el('[data-mission="range"]').click();
    expect(ui.el('#journey-total-xp').textContent).toBe('160');
  });

  it('rejects malformed and unearned saved claims while deduplicating evidenced rewards', () => {
    const days = { '2026-02-23': ['event-loop'], '2026-02-24': ['event-loop'], '2026-02-25': ['event-loop'] };
    const ui = load('#journey', JSON.stringify({ journey: { days, range: 999, claims: {
      '2026-02-23': ['habit', 'habit', 'range', 'explore', '__proto__'],
      '2026-02-24': ['habit'], '2026-02-30': ['habit'], '2999-01-01': ['habit'], bad: ['habit'],
      '2026-02-16': ['habit'], '2026-02-09': 'habit',
    } } }));
    const state = JSON.parse(ui.win.localStorage.getItem(storageKey)!);
    expect(state.journey.claims).toEqual({ '2026-02-23': ['habit'] });
    expect(ui.el('#journey-total-xp').textContent).toBe('80');
    expect(ui.el('#activity-range').value).toBe('7');
  });

  it('shows 28 calendar days, distinct daily totals, and personal records that survive a broken streak', () => {
    const ui = load('#journey', JSON.stringify({ journey: { days: {
      '2026-02-26': ['event-loop'], '2026-02-27': ['event-loop', 'protocols', 'protocols'],
      '2026-02-28': ['event-loop'], '2026-03-02': ['event-loop'],
    } } }));
    clock(ui, '2026-03-05');
    ui.change('#activity-range', '28');
    expect(ui.win.document.querySelectorAll('#journey-week li')).toHaveLength(28);
    expect(ui.el('#journey-week').textContent).toContain('2026-02-27: 2 labs');
    expect(ui.el('#record-streak').textContent).toBe('3 days');
    expect(ui.el('#record-days').textContent).toBe('4');
    expect(ui.el('#record-labs').textContent).toBe('2 labs');
    expect(ui.el('#journey-streak').textContent).toBe('0');
    expect(ui.el('#journey-badges').textContent).toContain('Steady practice');
    const resumed = load('#journey', ui.win.localStorage.getItem(storageKey)!);
    expect(resumed.el('#activity-range').value).toBe('28');
    expect(resumed.win.document.querySelectorAll('#journey-week li')).toHaveLength(28);
    expect(resumed.el('#record-streak').textContent).toBe('3 days');
  });

  it('keeps track progress honest, selects the next unfinished lab, and restores focus after refresh', () => {
    const ui = load('#journey', JSON.stringify({ completed: ['event-loop'], journey: { runs: ['data-structures'] } }));
    const track = ui.el('.skill-card');
    expect(track.textContent).toContain('1 / 9 labs complete · 1 explored');
    const button = ui.el('[data-skill-topic="data-structures"]');
    button.focus();
    ui.win.dispatchEvent(new ui.win.Event('focus'));
    expect(ui.win.document.activeElement?.getAttribute('data-skill-topic')).toBe('data-structures');
    ui.change('#learning-path', 'distributed');
    ui.change('#topic-search', 'absent');
    ui.el('[data-skill-topic="data-structures"]').click();
    expect(ui.win.location.hash).toBe('#data-structures');
    expect(ui.el('#learning-path').value).toBe('all');
    expect(ui.shown()).toHaveLength(46);
    expect(ui.win.document.activeElement?.id).toBe('exp-title');
    ui.el('#mark-complete').click();
    expect(ui.el('.skill-card').textContent).toContain('2 / 9 labs complete');
    ui.el('#mark-complete').click();
    expect(ui.el('.skill-card').textContent).toContain('1 / 9 labs complete');
  });

  it('keeps weekly claims usable in session when storage is blocked', () => {
    const ui = load('#journey', undefined, true);
    ui.win.eval("['event-loop', 'worker-threads', 'consensus-quorum'].forEach(key => testJourney.recordRun(key))");
    ui.el('[data-mission="range"]').click();
    ui.el('[data-mission="range"]').click();
    expect(ui.el('#journey-total-xp').textContent).toBe('160');
    expect(ui.el('#journey-storage').textContent).toContain('only for this session');
  });
});

describe('Scenario challenges, review practice, and achievement showcase', () => {
  const state = (ui: ReturnType<typeof load>) => JSON.parse(ui.win.localStorage.getItem(storageKey)!).journey;
  const record = (ui: ReturnType<typeof load>, keys: string[]) => {
    ui.win.eval(`${JSON.stringify(keys)}.forEach(key => testJourney.recordRun(key))`);
  };
  function clock(ui: ReturnType<typeof load>, date: string) {
    ui.win.eval(`window.RealDate ||= Date; window.clock = new RealDate('${date}T12:00:00');
      Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } };
      testJourney.render();`);
  }

  it('starts fresh, counts only active challenge runs, and retains steps across switches and reloads', () => {
    const ui = load('#journey');
    record(ui, ['rate-limiting']);
    ui.change('#topic-search', 'missing');
    ui.change('#topic-level', 'foundation');
    ui.el('[data-challenge="incident"]').click();
    expect(ui.shown()).toHaveLength(46);
    expect(ui.win.location.hash).toBe('#rate-limiting');
    expect(state(ui).challenges.incident.steps).toEqual([]);
    expect(ui.el('#challenge-tracker').hidden).toBe(false);
    record(ui, ['rate-limiting', 'rate-limiting', 'event-loop']);
    expect(state(ui).challenges.incident.steps).toEqual(['rate-limiting']);
    ui.el('[data-challenge="integrity"]').click();
    record(ui, ['circuit-breaker', 'acid-transactions']);
    expect(state(ui).challenges.incident.steps).toEqual(['rate-limiting']);
    expect(state(ui).challenges.integrity.steps).toEqual(['acid-transactions']);
    ui.el('#challenge-pause').click();
    expect(state(ui).activeChallenge).toBeNull();
    expect(ui.win.document.activeElement?.id).toBe('challenge-feedback');
    expect(ui.el('#challenge-tracker').hidden).toBe(true);
    record(ui, ['outbox-pattern']);
    expect(state(ui).challenges.integrity.steps).toEqual(['acid-transactions']);
    const resumed = load('#journey', ui.win.localStorage.getItem(storageKey)!);
    resumed.el('[data-challenge="incident"]').click();
    expect(resumed.win.location.hash).toBe('#circuit-breaker');
    expect(state(resumed).activeChallenge).toBe('incident');
  });

  it('awards a challenge once, supports out-of-order runs, and preserves claims after reload and revisit', () => {
    const ui = load('#journey');
    ui.win.eval("testJourney.claimChallenge('incident'); testJourney.claimChallenge('__proto__')");
    ui.el('[data-challenge="incident"]').click();
    record(ui, ['retry-backoff', 'rate-limiting']);
    ui.win.eval("testJourney.claimChallenge('incident')");
    expect(ui.el('#journey-total-xp').textContent).toBe('40');
    record(ui, ['circuit-breaker']);
    expect(ui.el('#challenge-tracker-text').textContent).toContain('Reward ready');
    const claim = ui.el('[data-challenge="incident"]');
    claim.focus();
    claim.click();
    ui.win.eval("testJourney.claimChallenge('incident')");
    expect(ui.el('#journey-total-xp').textContent).toBe('180');
    expect(ui.win.document.activeElement?.id).toBe('challenge-feedback');
    expect(state(ui).activeChallenge).toBeNull();
    const resumed = load('#journey', ui.win.localStorage.getItem(storageKey)!);
    expect(resumed.el('#journey-total-xp').textContent).toBe('180');
    resumed.el('[data-challenge="incident"]').click();
    record(resumed, ['rate-limiting']);
    expect(state(resumed).activeChallenge).toBeNull();
    expect(resumed.el('#journey-total-xp').textContent).toBe('180');
  });

  it('does not advance a challenge after failed or canceled API requests', async () => {
    const ui = load('#journey');
    ui.el('[data-challenge="incident"]').click();
    ui.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Failed' }) });
    ui.el('#run-btn').click();
    await vi.waitFor(() => expect(ui.el('#exec-status').textContent).toBe('Error'));
    expect(state(ui).challenges.incident.steps).toEqual([]);
    let finish!: (value: unknown) => void;
    ui.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    ui.el('#run-btn').click();
    ui.win.location.hash = 'journey';
    await vi.waitFor(() => expect(ui.el('#journey-view').hidden).toBe(false));
    finish({ ok: true, json: async () => ({ data: {}, executionDurationMs: 1 }) });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(state(ui).challenges.incident.steps).toEqual([]);
  });

  it('normalizes invalid challenge data, unsupported preferences, and claims lacking dated evidence', () => {
    const ui = load('#journey', JSON.stringify({ journey: {
      activeChallenge: '__proto__', reviewInterval: 0, pinnedBadge: '<img onerror=alert(1)>',
      days: { '2026-02-01': ['rate-limiting'], '2026-02-03': ['circuit-breaker', 'retry-backoff'] },
      challenges: {
        incident: { started: '2026-02-02', steps: ['rate-limiting', 'circuit-breaker', 'circuit-breaker', 'retry-backoff', '__proto__'], claimed: true },
        integrity: { started: '2026-02-30', steps: [], claimed: true },
        defender: { started: '2999-01-01', steps: [], claimed: true },
      },
    } }));
    expect(state(ui).challenges).toEqual({ incident: { started: '2026-02-02', steps: ['circuit-breaker', 'retry-backoff'], claimed: false } });
    expect(state(ui).activeChallenge).toBeNull();
    expect(state(ui).pinnedBadge).toBeNull();
    expect(state(ui).reviewInterval).toBe(7);
    expect(ui.el('#journey-total-xp').textContent).toBe('0');
  });

  it('schedules the oldest dated runs, honors calendar boundaries, and removes a successful review without repeat XP', () => {
    const ui = load('#journey', JSON.stringify({ journey: { runs: ['event-loop', 'data-structures', 'protocols'], days: {
      '2026-02-27': ['event-loop'], '2026-02-28': ['data-structures'],
    } } }));
    clock(ui, '2026-03-06');
    expect(ui.el('#review-count').textContent).toBe('1 lab due');
    expect(ui.el('[data-review-topic]').dataset.reviewTopic).toBe('event-loop');
    clock(ui, '2026-03-07');
    expect(ui.el('#review-count').textContent).toBe('2 labs due');
    ui.el('[data-review-topic="event-loop"]').focus();
    ui.win.dispatchEvent(new ui.win.Event('focus'));
    expect(ui.win.document.activeElement?.getAttribute('data-review-topic')).toBe('event-loop');
    ui.change('#topic-search', 'absent');
    ui.el('[data-review-topic="event-loop"]').click();
    expect(ui.shown()).toHaveLength(46);
    expect(ui.win.location.hash).toBe('#event-loop');
    record(ui, ['event-loop']);
    expect(ui.el('#review-count').textContent).toBe('1 lab due');
    expect(ui.el('#journey-total-xp').textContent).toBe('60');
    ui.change('#review-interval', '14');
    expect(ui.el('#review-count').textContent).toBe('0 labs due');
    const resumed = load('#journey', ui.win.localStorage.getItem(storageKey)!);
    expect(resumed.el('#review-interval').value).toBe('14');
    expect(state(resumed).days['2026-03-07']).toEqual(['event-loop']);
  });

  it('refreshes a review across a daylight-saving boundary using calendar days', () => {
    const ui = load('#journey', JSON.stringify({ journey: { reviewInterval: 3, days: { '2026-03-06': ['event-loop'] } } }));
    clock(ui, '2026-03-08');
    expect(ui.el('#review-count').textContent).toBe('0 labs due');
    clock(ui, '2026-03-09');
    ui.win.dispatchEvent(new ui.win.Event('focus'));
    expect(ui.el('#review-count').textContent).toBe('1 lab due');
  });

  it('pins only earned achievements, retains the choice on reload, and hides a badge when completion is undone', () => {
    const ui = load('#journey');
    expect(ui.win.document.querySelector('[data-pin-badge]')).toBeNull();
    ui.el('#mark-complete').click();
    ui.el('[data-pin-badge="start"]').focus();
    ui.el('[data-pin-badge="start"]').click();
    expect(ui.el('#showcase-title').textContent).toBe('A solid start');
    expect(ui.win.document.activeElement?.getAttribute('data-pin-badge')).toBe('start');
    const resumed = load('#journey', ui.win.localStorage.getItem(storageKey)!);
    expect(resumed.el('#showcase-title').textContent).toBe('A solid start');
    resumed.el('#mark-complete').click();
    expect(resumed.el('#showcase-title').textContent).toBe('Make this journey yours');
    resumed.el('#mark-complete').click();
    expect(resumed.el('#showcase-title').textContent).toBe('A solid start');
    resumed.el('[data-pin-badge="start"]').click();
    expect(state(resumed).pinnedBadge).toBeNull();
  });

  it('keeps new features usable without storage and keeps section navigation on the journey route', () => {
    const ui = load('#journey', undefined, true);
    ui.el('[data-journey-section="review-title"]').click();
    expect(ui.win.location.hash).toBe('#journey');
    expect(ui.win.document.activeElement?.id).toBe('review-title');
    ui.el('[data-challenge="defender"]').click();
    record(ui, ['auth-jwt-rotation', 'abac-authorization', 'owasp-lab']);
    ui.el('[data-challenge="defender"]').click();
    expect(ui.el('#journey-total-xp').textContent).toBe('180');
    ui.el('[data-pin-badge="discovery"]').click();
    expect(ui.el('#showcase-title').textContent).toBe('First discovery');
    expect(ui.el('#journey-storage').textContent).toContain('only for this session');
  });
});
