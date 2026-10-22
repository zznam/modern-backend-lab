import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { runConsensusLab } from '../src/05-advanced-systems/consensus.js';
import { runFencingLab } from '../src/05-advanced-systems/fencing.js';
import { runEventSourcingLab } from '../src/05-advanced-systems/event-sourcing.js';
import { runSnapshotLab } from '../src/05-advanced-systems/snapshot-isolation.js';
import { runBackpressureLab } from '../src/05-advanced-systems/backpressure.js';
import { runSloLab } from '../src/05-advanced-systems/slo-burn.js';

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
    expect(ui.shown()).toHaveLength(42);
    ui.change('#topic-level', 'advanced');
    expect(ui.shown()).toHaveLength(6);
    ui.change('#topic-search', 'raft');
    expect(ui.shown()).toEqual(['consensus-quorum']);
    ui.change('#topic-search', 'no-such-concept');
    expect(ui.shown()).toEqual([]);
    expect(ui.el('#no-topics').hidden).toBe(false);
    ui.el('#clear-filters').click();
    expect(ui.shown()).toHaveLength(42);
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
    expect(load('#unknown', '{"completed":["unknown"],"path":"__proto__"}').el('#progress-label').textContent).toBe('0 of 42 completed');
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
});
