import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { server, startServer } from '../src/server.js';
import { globalShutdownCoordinator } from '../src/04-devops-reliability/resilience/graceful-shutdown.js';
import { CachingEngineLab } from '../src/03-architecture-distributed/caching-strategies/caching-engine.js';

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
  it.each(ids)('runs the dashboard module %s', async experimentId => {
    const response = await post('/api/experiments/run', { experimentId });
    const body = await response.json() as { data: any; experimentId: string; executionDurationMs: number };
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body).toMatchObject({ experimentId, executionDurationMs: expect.any(Number) });
    expect(body.data).toBeDefined();
    if (experimentId === 'idempotency') expect(body.data.initial.order.id).toBe(body.data.replay.order.id);
    if (experimentId === 'data-structures') expect(body.data).toMatchObject({ ringBuffer: [2, 3], minHeap: [1, 2, 3] });
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

  it.each([null, [], {}, { experimentId: 5 }, { experimentId: 'event-loop', params: null },
    { experimentId: 'worker-threads', params: { limit: -1 } },
    { experimentId: 'cache-stampede', params: { concurrency: 1000000 } },
    { experimentId: 'load-stress-benchmark', params: { concurrency: 0 } },
    { experimentId: 'grpc-protobuf', params: { iterations: '1000' } },
    { experimentId: 'abac-authorization', params: { subject: {} } },
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
