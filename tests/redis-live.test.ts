import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DualModeRedisAdapter } from '../src/02-api-security-db/adapters/dual-mode-adapters.js';

describe.skipIf(!process.env.TEST_REDIS_URL)('Live Redis adapter behavior', () => {
  let redis: DualModeRedisAdapter;
  const prefix = `validation:${randomUUID()}`;
  beforeAll(() => { redis = new DualModeRedisAdapter(process.env.TEST_REDIS_URL); });
  afterAll(async () => { await redis?.close(); });
  it('performs its first operation without a prior connect or health call', async () => {
    await redis.set(`${prefix}:first`, { active: true }, 10);
    expect(await redis.get(`${prefix}:first`)).toEqual({ active: true });
    expect((await redis.healthCheck()).status).toBe('CONNECTED');
  });
  it.each(['123', 'true', 'null', ''])('preserves the string %j through serialization', async value => {
    await redis.set(`${prefix}:string`, value, 10);
    expect(await redis.get(`${prefix}:string`)).toBe(value);
  });
  it('shares a lazy connection across simultaneous operations', async () => {
    const client = new DualModeRedisAdapter(process.env.TEST_REDIS_URL);
    try {
      await Promise.all(Array.from({ length: 10 }, (_, index) => client.set(`${prefix}:parallel:${index}`, index, 10)));
      expect(await client.get(`${prefix}:parallel:9`)).toBe(9);
    } finally { await client.close(); }
  });
  it('uses NX and token-checked Lua release for lock ownership', async () => {
    const resource = `${prefix}:owned`;
    const lock = await redis.acquireDistributedLock(resource, 2000);
    expect(lock).toMatchObject({ acquired: true, mode: 'LIVE_DATABASE' });
    expect((await redis.acquireDistributedLock(resource)).acquired).toBe(false);
    expect((await redis.releaseDistributedLock(resource, 'wrong-owner')).released).toBe(false);
    expect((await redis.releaseDistributedLock(resource, lock.lockToken!)).released).toBe(true);
  });
  it('does not let an expired lock holder delete the new owner lock', async () => {
    const resource = `${prefix}:expiring`;
    const old = await redis.acquireDistributedLock(resource, 30);
    await new Promise(resolve => setTimeout(resolve, 50));
    const next = await redis.acquireDistributedLock(resource, 2000);
    expect(next.acquired).toBe(true);
    expect((await redis.releaseDistributedLock(resource, old.lockToken!)).released).toBe(false);
    expect((await redis.releaseDistributedLock(resource, next.lockToken!)).released).toBe(true);
  });
  it('returns sorted leaderboard ranks and honors a zero limit', async () => {
    const key = `${prefix}:leaderboard`;
    await redis.zadd(key, 100, 'Alice'); await redis.zadd(key, 200, 'Bob');
    expect(await redis.zrevrange(key, 1)).toEqual([{ rank: 1, member: 'Bob', score: 200 }]);
    expect(await redis.zrevrange(key, 0)).toEqual([]);
  });
});
