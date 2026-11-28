import { describe, expect, it } from 'vitest';
import { runWalDurabilityLab } from '../src/05-advanced-systems/wal-durability.js';

describe('WAL durability lab', () => {
  it('per-write fsync is safe but capped by disk latency', () => {
    const ok = runWalDurabilityLab(150, 5, 0, 5);
    expect(ok).toMatchObject({ capacity: 200, overloaded: false, commitLatencyMs: 5, lostOnCrash: 0 });
    const over = runWalDurabilityLab(2000, 5, 0, 5);
    expect(over).toMatchObject({ overloaded: true, commitLatencyMs: null });
    expect(over.steps[2]!.state).toBe('blocked');
  });

  it('group commit shares fsyncs and never loses acknowledged writes', () => {
    const result = runWalDurabilityLab(2000, 5, 1, 5);
    expect(result).toMatchObject({ overloaded: false, lostOnCrash: 0, fsyncsPerSecond: 200, writesPerFsync: 10 });
    expect(result.commitLatencyMs).toBe(7.5);
  });

  it('a longer window means fewer fsyncs but higher latency', () => {
    const short = runWalDurabilityLab(2000, 5, 1, 5);
    const long = runWalDurabilityLab(2000, 5, 1, 20);
    expect(long.fsyncsPerSecond).toBeLessThan(short.fsyncsPerSecond);
    expect(long.commitLatencyMs!).toBeGreaterThan(short.commitLatencyMs!);
  });

  it('asynchronous commit is instant but loses acknowledged writes on crash', () => {
    const result = runWalDurabilityLab(2000, 5, 2, 10);
    expect(result.commitLatencyMs).toBe(0);
    expect(result.lostOnCrash).toBe(30);
    expect(result.steps[4]!.state).toBe('warning');
  });

  it('is deterministic and rejects malformed controls', () => {
    expect(runWalDurabilityLab(500, 3, 1, 8)).toEqual(runWalDurabilityLab(500, 3, 1, 8));
    for (const args of [[9, 5, 1, 5], [5001, 5, 1, 5], [100, 0, 1, 5], [100, 21, 1, 5], [100, 5, 3, 5], [100, 5, 1, 0], [100, 5, 1, 51]] as const)
      expect(() => runWalDurabilityLab(...args)).toThrow(RangeError);
  });
});
