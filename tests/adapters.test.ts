import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pool: { on: vi.fn(), query: vi.fn(), connect: vi.fn(), end: vi.fn() },
  connection: { query: vi.fn(), release: vi.fn() },
  redis: { status: 'wait', on: vi.fn(), connect: vi.fn(), disconnect: vi.fn(),
    ping: vi.fn(), set: vi.fn(), get: vi.fn(), zadd: vi.fn(), zrevrange: vi.fn(), eval: vi.fn() },
}));
vi.mock('pg', () => ({ default: { Pool: class { constructor() { return mocks.pool; } } } }));
vi.mock('ioredis', () => ({ Redis: class { constructor() { return mocks.redis; } } }));
import { DualModePostgresAdapter, DualModeRedisAdapter } from '../src/02-api-security-db/adapters/dual-mode-adapters.js';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.pool.connect.mockResolvedValue(mocks.connection);
  mocks.connection.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mocks.redis.status = 'wait';
  mocks.redis.connect.mockImplementation(async () => { mocks.redis.status = 'ready'; });
});

describe('Configured services must not silently switch data stores', () => {
  it('keeps readiness degraded when schema initialization fails', async () => {
    const db = new DualModePostgresAdapter('postgresql://localhost/db');
    mocks.connection.query.mockRejectedValue(new Error('permission denied'));
    mocks.pool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    expect((await db.healthCheck()).status).toBe('DISCONNECTED');
  });
  it('propagates live query failures and redacts health credentials', async () => {
    const db = new DualModePostgresAdapter('postgresql://lab:secret@localhost/db?password=also-secret');
    mocks.pool.query.mockRejectedValue(new Error('connection secret failed'));
    await expect(db.query('SELECT 1')).rejects.toThrow();
    const health = await db.healthCheck();
    expect(health).toMatchObject({ status: 'DISCONNECTED', mode: 'LIVE_DATABASE' });
    expect(JSON.stringify(health)).not.toContain('secret');
  });
  it('rejects a missing recipient before either balance is updated', async () => {
    const db = new DualModePostgresAdapter('postgresql://localhost/db');
    mocks.connection.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('FOR UPDATE') ? [{ id: 'acc_alice', balance: 1000 }] : [] }));
    const result = await db.executeAtomicTransfer('acc_alice', 'missing', 50);
    expect(result).toMatchObject({ success: false, rolledBack: true, mode: 'LIVE_DATABASE' });
    expect(mocks.connection.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    expect(mocks.connection.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mocks.connection.release).toHaveBeenCalledOnce();
  });
  it('locks both accounts in order and uses the live transaction for simulated failures', async () => {
    const db = new DualModePostgresAdapter('postgresql://localhost/db');
    mocks.connection.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('FOR UPDATE') ? [{ id: 'acc_alice', balance: 1000 }, { id: 'acc_bob', balance: 500 }] : [] }));
    const result = await db.executeAtomicTransfer('acc_alice', 'acc_bob', 50, 1);
    expect(result).toMatchObject({ success: false, rolledBack: true, mode: 'LIVE_DATABASE' });
    expect(mocks.connection.query.mock.calls.find(([sql]) => sql.includes('FOR UPDATE'))?.[0]).toContain('ORDER BY id');
    expect(mocks.connection.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mocks.connection.query).not.toHaveBeenCalledWith('COMMIT');
  });
  it('does not perform a fallback transfer after a connection error', async () => {
    const db = new DualModePostgresAdapter('postgresql://localhost/db');
    mocks.pool.connect.mockRejectedValue(new Error('offline'));
    await expect(db.executeAtomicTransfer('acc_alice', 'acc_bob', 50)).rejects.toThrow('offline');
  });
  it('lazily connects Redis without requiring a readiness request first', async () => {
    const redis = new DualModeRedisAdapter('redis://localhost:6379');
    mocks.redis.set.mockResolvedValue('OK');
    await redis.set('key', '123');
    expect(mocks.redis.connect).toHaveBeenCalledOnce();
    expect(mocks.redis.set).toHaveBeenCalledWith('key', '"123"');
    mocks.redis.get.mockResolvedValue('"123"');
    expect(await redis.get('key')).toBe('123');
  });
  it('shares concurrent connection attempts', async () => {
    const redis = new DualModeRedisAdapter('redis://localhost:6379');
    await Promise.all([redis.set('a', 1), redis.set('b', 2), redis.get('c')]);
    expect(mocks.redis.connect).toHaveBeenCalledOnce();
  });
  it('rejects writes and lock acquisition if configured Redis is down', async () => {
    const redis = new DualModeRedisAdapter('redis://:secret@localhost:6379');
    mocks.redis.connect.mockRejectedValue(new Error('secret is invalid'));
    await expect(redis.set('key', 'value')).rejects.toThrow('unavailable');
    await expect(redis.acquireDistributedLock('key')).rejects.toThrow('unavailable');
    const health = await redis.healthCheck();
    expect(health).toMatchObject({ status: 'DISCONNECTED', mode: 'LIVE_DATABASE' });
    expect(JSON.stringify(health)).not.toContain('secret');
  });
  it('does not translate a zero-length leaderboard into Redis end=-1', async () => {
    const redis = new DualModeRedisAdapter('redis://localhost:6379');
    expect(await redis.zrevrange('board', 0)).toEqual([]);
    expect(mocks.redis.zrevrange).not.toHaveBeenCalled();
  });
});
