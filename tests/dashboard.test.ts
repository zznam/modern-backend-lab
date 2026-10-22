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
const scripts = ['curriculum.js', 'app.js'].map(file => readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8')).join('\n');
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
  win.eval(scripts);
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
    expect(Object.keys(JSON.parse(stored)).sort()).toEqual(['completed', 'lastTopic', 'path']);
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
