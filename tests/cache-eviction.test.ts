import { describe, expect, it } from 'vitest';
import { runCacheEvictionLab, simulate, zipfStream } from '../src/05-advanced-systems/cache-eviction.js';

describe('Cache eviction lab', () => {
  it('replays policies correctly on a tiny stream', () => {
    const stream = [1, 2, 1, 3, 1, 2];
    // capacity 2: LRU keeps 1 hot → hits on the 2nd and 3rd "1".
    expect(simulate('LRU', 2, stream)).toBe(2);
    // FIFO evicts 1 when 3 arrives (1 was inserted first) → only one hit.
    expect(simulate('FIFO', 2, stream)).toBe(1);
    expect(simulate('LFU', 2, stream)).toBe(2);
  });

  it('uniform access hits about the cached share of keys', () => {
    const result = runCacheEvictionLab(100, 0);
    for (const rate of Object.values(result.hitRates)) expect(Math.abs(rate - 10)).toBeLessThan(2);
  });

  it('skew makes a small cache valuable, and more skew means more hits', () => {
    const mild = runCacheEvictionLab(50, 8);
    const strong = runCacheEvictionLab(50, 14);
    expect(mild.hitRates.LRU).toBeGreaterThan(mild.cacheShare + 10);
    expect(strong.hitRates.LRU).toBeGreaterThan(mild.hitRates.LRU);
    expect(strong.hitRates.LFU).toBeGreaterThanOrEqual(strong.hitRates.FIFO);
  });

  it('bigger caches never hit less', () => {
    const rates = [10, 50, 200].map((size) => runCacheEvictionLab(size, 10).hitRates.LRU);
    expect(rates).toEqual([...rates].sort((a, b) => a - b));
  });

  it('is deterministic, generates in range, and rejects malformed controls', () => {
    expect(zipfStream(10, 500)).toEqual(zipfStream(10, 500));
    expect(zipfStream(10, 500).every((k) => k >= 0 && k < 1000)).toBe(true);
    for (const [size, skew] of [[0, 10], [501, 10], [50, -1], [50, 21], [1.5, 10]])
      expect(() => runCacheEvictionLab(size, skew)).toThrow(RangeError);
  });
});
