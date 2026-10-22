import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { server, startServer } from '../src/server.js';
import { globalShutdownCoordinator } from '../src/04-devops-reliability/resilience/graceful-shutdown.js';
import { CachingEngineLab } from '../src/03-architecture-distributed/caching-strategies/caching-engine.js';
import { runReplicationLab } from '../src/05-advanced-systems/replication-quorums.js';
import { runLsmLab } from '../src/05-advanced-systems/lsm-compaction.js';
import { runTwoPhaseCommitLab } from '../src/05-advanced-systems/two-phase-commit.js';
import { runStreamWatermarkLab } from '../src/05-advanced-systems/stream-watermarks.js';

let base: string;
beforeAll(async () => {
  await startServer(0);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing HTTP address');
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  const result = await globalShutdownCoordinator.triggerShutdown('MANUAL');
  expect(result.success).toBe(true);
});

function post(path: string, body: unknown, headers = {}) {
  return fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

describe('Dashboard → HTTP → labs', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/data-exp="([^"]+)"/g)].map(match => match[1]);
  const curriculum = readFileSync(new URL('../public/curriculum.js', import.meta.url), 'utf8');
  const presets = runInNewContext(`${curriculum}\nObject.entries(ADVANCED_TOPICS).flatMap(([id, topic]) => (topic.scenarios || []).map(scenario => [id, scenario.label, scenario.params]))`) as [string, string, Record<string, number>][];
  it.each(presets)('runs the dashboard preset %s: %s', async (experimentId, _label, params) => {
    const response = await post('/api/experiments/run', { experimentId, params });
    const body = await response.json() as { data: { metrics: unknown[]; steps: unknown[] } };
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body.data.metrics).toHaveLength(3);
    expect(body.data.steps.length).toBeGreaterThan(0);
  });
  it.each(ids)('runs the dashboard module %s', async experimentId => {
    const response = await post('/api/experiments/run', { experimentId });
    const body = await response.json() as { data: any; experimentId: string; executionDurationMs: number };
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body).toMatchObject({ experimentId, executionDurationMs: expect.any(Number) });
    expect(body.data).toBeDefined();
    if (experimentId === 'idempotency') expect(body.data.initial.order.id).toBe(body.data.replay.order.id);
    if (experimentId === 'data-structures') expect(body.data).toMatchObject({ ringBuffer: [2, 3], minHeap: [1, 2, 3] });
  });

  it.each([
    ['consensus-quorum', { clusterSize: 5, availableNodes: 2 }, { elected: false }],
    ['fencing-tokens', { pauseMs: 0 }, { expired: false, staleWriteAccepted: true }],
    ['event-sourcing', { projectionBatch: 0 }, { lagging: { checkpoint: 0, balance: 0 } }],
    ['snapshot-isolation', { onCallDoctors: 3 }, { snapshotIsolation: { invariantHolds: true } }],
    ['backpressure', { producerRate: 1, consumerRate: 10, queueCapacity: 20 }, { loadShedding: { rejected: 0, queued: 0 } }],
    ['slo-burn-rate', { sloBasisPoints: 9990, longErrorBasisPoints: 200, shortErrorBasisPoints: 0 }, { page: false }],
  ])('honors custom %s controls through HTTP', async (experimentId, params, expected) => {
    const response = await post('/api/experiments/run', { experimentId, params });
    expect(response.status).toBe(200);
    const body = await response.json() as { data: unknown };
    expect(body.data).toMatchObject(expected as Record<string, unknown>);
  });

  it('serves the dashboard, health, readiness, metrics, and correlation headers', async () => {
    const home = await fetch(base);
    expect(await home.text()).toContain('Run Live Experiment');
    expect(home.headers.get('x-correlation-id')).toBeTruthy();
    const health = await fetch(`${base}/api/v1/health`, { headers: { 'x-correlation-id': 'request-123' } });
    expect(health.headers.get('x-correlation-id')).toBe('request-123');
    expect((await health.json() as { status: string }).status).toBe('HEALTHY');
    expect((await fetch(`${base}/api/v1/ready`)).status).toBe(200);
    const metrics = await (await fetch(`${base}/metrics`)).text();
    expect(metrics).toContain('http_requests_total');
  });

  it.each([
    ['replication-quorums', { readQuorum: 1, writeQuorum: 1, failedReplicas: 1 }, () => runReplicationLab(1, 1, 1)],
    ['replication-quorums', { readQuorum: 3, writeQuorum: 3, failedReplicas: 2 }, () => runReplicationLab(3, 3, 2)],
    ['lsm-compaction', { memtableLimit: 2, compaction: 0 }, () => runLsmLab(2, 0)],
    ['lsm-compaction', { memtableLimit: 6, compaction: 1 }, () => runLsmLab(6, 1)],
    ['two-phase-commit', { crashPoint: 2, rejectVote: 0 }, () => runTwoPhaseCommitLab(2, 0)],
    ['two-phase-commit', { crashPoint: 0, rejectVote: 1 }, () => runTwoPhaseCommitLab(0, 1)],
    ['stream-watermarks', { watermarkLag: 0, allowedLateness: 0 }, () => runStreamWatermarkLab(0, 0)],
    ['stream-watermarks', { watermarkLag: 20, allowedLateness: 20 }, () => runStreamWatermarkLab(20, 20)],
  ] as const)('forwards every data-systems control for %s', async (experimentId, params, expected) => {
    const response = await post('/api/experiments/run', { experimentId, params });
    expect(response.status).toBe(200);
    const body = await response.json() as { data: unknown };
    expect(body.data).toEqual(expected());
  });

  const dataControls = [
    ['replication-quorums', 'readQuorum', 1, 3],
    ['replication-quorums', 'writeQuorum', 1, 3],
    ['replication-quorums', 'failedReplicas', 0, 2],
    ['lsm-compaction', 'memtableLimit', 2, 6],
    ['lsm-compaction', 'compaction', 0, 1],
    ['two-phase-commit', 'crashPoint', 0, 2],
    ['two-phase-commit', 'rejectVote', 0, 1],
    ['stream-watermarks', 'watermarkLag', 0, 20],
    ['stream-watermarks', 'allowedLateness', 0, 20],
  ] as const;
  it.each(dataControls)('rejects invalid %s %s values at the HTTP boundary', async (experimentId, key, min, max) => {
    for (const value of [min - 1, max + 1, min + 0.5, String(min), null, true]) {
      const response = await post('/api/experiments/run', { experimentId, params: { [key]: value } });
      expect(response.status, `${key}=${JSON.stringify(value)}`).toBe(400);
      expect(await response.json()).toEqual({ error: expect.stringContaining(key) });
    }
  });

  it.each([null, [], {}, { experimentId: 5 }, { experimentId: 'event-loop', params: null },
    { experimentId: 'worker-threads', params: { limit: -1 } },
    { experimentId: 'cache-stampede', params: { concurrency: 1000000 } },
    { experimentId: 'load-stress-benchmark', params: { concurrency: 0 } },
    { experimentId: 'grpc-protobuf', params: { iterations: '1000' } },
    { experimentId: 'abac-authorization', params: { subject: {} } },
    { experimentId: 'consensus-quorum', params: { clusterSize: 4 } },
    { experimentId: 'consensus-quorum', params: { clusterSize: 3, availableNodes: 3 } },
    { experimentId: 'fencing-tokens', params: { pauseMs: -1 } },
    { experimentId: 'event-sourcing', params: { projectionBatch: 4 } },
    { experimentId: 'snapshot-isolation', params: { onCallDoctors: 1 } },
    { experimentId: 'backpressure', params: { queueCapacity: 1000000 } },
    { experimentId: 'slo-burn-rate', params: { sloBasisPoints: 10000 } },
    { experimentId: 'slo-burn-rate', params: { shortErrorBasisPoints: '200' } },
  ])('rejects malformed or unbounded requests: %j', async body => {
    const response = await post('/api/experiments/run', body);
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty('error');
  });

  it.each(['limit=-1', 'limit=0', 'limit=NaN', 'limit=101', 'offset=-5', 'limit=2x', 'limit=2&limit=3', 'cursor=garbage', 'status=unknown'])('rejects invalid pagination %s', async query => {
    expect((await fetch(`${base}/api/v1/orders?${query}`)).status).toBe(400);
  });

  it('validates before mutation and safely replays an idempotent order', async () => {
    const headers = { 'idempotency-key': 'http-order-1' };
    expect((await post('/api/v1/orders', {}, headers)).status).toBe(422);
    const payload = { customerName: 'Test customer', amount: 25 };
    const original = await post('/api/v1/orders', payload, headers);
    expect(original.status).toBe(201);
    const order = await original.json();
    const replay = await post('/api/v1/orders', payload, headers);
    expect(await replay.json()).toEqual(order);
    expect(replay.headers.get('x-cache')).toBe('IDEMPOTENT-HIT');
    expect((await post('/api/v1/orders', { ...payload, amount: 30 }, headers)).status).toBe(422);
  });

  it('returns JSON errors without exposing stacks', async () => {
    const malformed = await fetch(`${base}/api/experiments/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).not.toHaveProperty('stack');
    const oversized = await post('/api/experiments/run', { padding: 'x'.repeat(70000) });
    expect(oversized.status).toBe(413);
    expect((await post('/api/experiments/run', { experimentId: 'unknown' })).status).toBe(404);
  });

  it('does not create a distinct metric label for every unknown URL', async () => {
    await fetch(`${base}/unknown-123`);
    await fetch(`${base}/unknown-456`);
    const metrics = await (await fetch(`${base}/metrics`)).text();
    expect(metrics).toContain('route="unmatched"');
    expect(metrics).not.toContain('unknown-123');
    expect(metrics).not.toContain('unknown-456');
  });

  it('bounds concurrent experiments and accepts new work after completion', async () => {
    let started!: () => void;
    const bothStarted = new Promise<void>(resolve => { started = resolve; });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    const mock = vi.spyOn(CachingEngineLab.prototype, 'simulateStampedeWithoutMutex').mockImplementation(async () => {
      if (++calls === 2) started();
      await gate;
      return { dbQueriesFired: 50, durationMs: 1 };
    });
    const pending = [post('/api/experiments/run', { experimentId: 'cache-stampede' }), post('/api/experiments/run', { experimentId: 'cache-stampede' })];
    try {
      await bothStarted;
      const rejected = await post('/api/experiments/run', { experimentId: 'event-loop' });
      expect(rejected.status).toBe(429);
      expect(rejected.headers.get('retry-after')).toBe('1');
    } finally {
      release(); await Promise.all(pending); mock.mockRestore();
    }
    expect((await post('/api/experiments/run', { experimentId: 'event-loop' })).status).toBe(200);
  });

  it('echoes WebSocket messages and releases the connection', async () => {
    const ws = new WebSocket(`${base.replace('http:', 'ws:')}/ws`);
    const welcome = once(ws, 'message');
    await once(ws, 'open');
    expect(JSON.parse(String((await welcome)[0])).type).toBe('WELCOME');
    const ack = once(ws, 'message');
    ws.send(JSON.stringify({ ping: true }));
    expect(JSON.parse(String((await ack)[0]))).toMatchObject({ type: 'ACK', echo: { ping: true } });
    const closed = once(ws, 'close'); ws.close(); await closed;
  });
  it('closes an oversized WebSocket message without crashing HTTP', async () => {
    const ws = new WebSocket(`${base.replace('http:', 'ws:')}/ws`);
    ws.on('error', () => {});
    await once(ws, 'open');
    const closed = new Promise<number>(resolve => ws.once('close', code => resolve(code)));
    ws.send('x'.repeat(70000));
    expect(await closed).toBe(1009);
    expect((await fetch(`${base}/api/v1/health`)).status).toBe(200);
  });
});
