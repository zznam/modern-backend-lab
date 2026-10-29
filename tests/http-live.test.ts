import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

// Every run has its own schema so this suite can run beside postgres-live tests.
describe.skipIf(!process.env.TEST_DATABASE_URL || !process.env.TEST_REDIS_URL)('HTTP → live PostgreSQL and Redis', () => {
  const schema = `http_e2e_${randomUUID().replaceAll('-', '')}`;
  let admin: pg.Pool;
  let base: string;
  let adapters: typeof import('../src/02-api-security-db/adapters/dual-mode-adapters.js');
  let shutdown: typeof import('../src/04-devops-reliability/resilience/graceful-shutdown.js');

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const databaseUrl = new URL(process.env.TEST_DATABASE_URL!);
    databaseUrl.searchParams.set('options', `${databaseUrl.searchParams.get('options') || ''} -c search_path=${schema}`.trim());
    vi.stubEnv('DATABASE_URL', databaseUrl.toString());
    vi.stubEnv('REDIS_URL', process.env.TEST_REDIS_URL!);
    const { server, startServer } = await import('../src/server.js');
    adapters = await import('../src/02-api-security-db/adapters/dual-mode-adapters.js');
    shutdown = await import('../src/04-devops-reliability/resilience/graceful-shutdown.js');
    await startServer(0);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing HTTP address');
    base = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(async () => {
    await admin.query(`UPDATE ${schema}.accounts SET balance = CASE id WHEN 'acc_alice' THEN 1000 ELSE 500 END, version = 1`);
  });

  afterAll(async () => {
    try {
      if (shutdown) expect((await shutdown.globalShutdownCoordinator.triggerShutdown('MANUAL')).success).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      if (admin) {
        try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
        finally { await admin.end(); }
      }
    }
  });

  function run(experimentId: string) {
    return fetch(`${base}/api/experiments/run`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ experimentId }),
    });
  }

  it('reports both configured services as connected without exposing credentials', async () => {
    const response = await fetch(`${base}/api/v1/ready`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ status: 'READY', adapters: {
      postgres: { mode: 'LIVE_DATABASE', status: 'CONNECTED' },
      redis: { mode: 'LIVE_DATABASE', status: 'CONNECTED' },
    } });
    for (const raw of [process.env.TEST_DATABASE_URL!, process.env.TEST_REDIS_URL!]) {
      const password = new URL(raw).password;
      if (password) expect(JSON.stringify(body)).not.toContain(password);
    }
  });

  it('commits the HTTP transfer to PostgreSQL while keeping the simulated crash rolled back', async () => {
    const response = await run('acid-transactions');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: {
      dualModeTransfer: { success: true, mode: 'LIVE_DATABASE', balances: { acc_alice: 900, acc_bob: 600 } },
      crashRollback: { success: false, rolledBack: true },
    } });
    const actual = await admin.query(`SELECT id, balance FROM ${schema}.accounts ORDER BY id`);
    expect(actual.rows.map(row => [row.id, Number(row.balance)])).toEqual([['acc_alice', 900], ['acc_bob', 600]]);
  });

  it('uses live Redis for the HTTP leaderboard and releases its acquired lock', async () => {
    const response = await run('polyglot-persistence');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { dualModeRedis: {
      mode: 'LIVE_DATABASE', lock: { acquired: true, mode: 'LIVE_DATABASE' },
      leaderboard: [{ rank: 1, member: 'DualMaster', score: 3500 }],
    } } });
    const nextLock = await adapters.globalRedisAdapter.acquireDistributedLock('dual_order_lock');
    try { expect(nextLock.acquired).toBe(true); }
    finally {
      if (nextLock.lockToken) await adapters.globalRedisAdapter.releaseDistributedLock('dual_order_lock', nextLock.lockToken);
    }
  });

  it('returns an HTTP failure for a broken live schema and recovers after repair', async () => {
    await admin.query(`ALTER TABLE ${schema}.accounts RENAME TO unavailable_accounts`);
    try {
      const ready = await fetch(`${base}/api/v1/ready`);
      expect(ready.status).toBe(503);
      expect(await ready.json()).toMatchObject({ status: 'DEGRADED', adapters: {
        postgres: { mode: 'LIVE_DATABASE', status: 'DISCONNECTED' },
      } });
      const response = await run('acid-transactions');
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Experiment failed', correlationId: expect.any(String) });
    } finally {
      await admin.query(`ALTER TABLE ${schema}.unavailable_accounts RENAME TO accounts`);
    }
    expect((await fetch(`${base}/api/v1/ready`)).status).toBe(200);
    expect((await run('acid-transactions')).status).toBe(200);
  });
});
