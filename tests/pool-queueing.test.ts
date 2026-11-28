import { describe, expect, it } from 'vitest';
import { erlangC, runPoolQueueingLab, smallestPool } from '../src/05-advanced-systems/pool-queueing.js';

describe('Connection pool queueing lab', () => {
  it('matches textbook Erlang C values', () => {
    // c = 1 reduces to M/M/1: P(wait) = utilization.
    expect(erlangC(1, 0.5)).toBeCloseTo(0.5, 10);
    // Classic call-centre example: a = 10 Erlangs, c = 12 → about 0.4494.
    expect(erlangC(12, 10)).toBeCloseTo(0.4494, 3);
    expect(erlangC(5, 5)).toBe(1);
  });

  it("applies Little's law and reports stable latency", () => {
    const result = runPoolQueueingLab(200, 40, 10);
    expect(result.offeredLoad).toBe(8);
    expect(result.utilization).toBe(0.8);
    expect(result.meanWaitMs).toBeGreaterThan(0);
    expect(result.meanResponseMs).toBeCloseTo(40 + (result.meanWaitMs ?? 0), 1);
  });

  it('marks an undersized pool as unbounded', () => {
    const result = runPoolQueueingLab(200, 40, 7);
    expect(result.meanWaitMs).toBeNull();
    expect(result.steps[1]!.state).toBe('blocked');
  });

  it('waits fall as the pool grows, and the suggestion meets its target', () => {
    const waits = [9, 10, 12, 16].map(c => runPoolQueueingLab(200, 40, c).meanWaitMs!);
    expect(waits).toEqual([...waits].sort((a, b) => b - a));
    const pool = smallestPool(200, 40, 4)!;
    expect(runPoolQueueingLab(200, 40, pool).meanWaitMs!).toBeLessThanOrEqual(4);
    expect(runPoolQueueingLab(200, 40, pool - 1).meanWaitMs ?? Infinity).toBeGreaterThan(4);
  });

  it('is deterministic and rejects malformed controls', () => {
    expect(runPoolQueueingLab(50, 20, 3)).toEqual(runPoolQueueingLab(50, 20, 3));
    for (const args of [[0, 40, 10], [1001, 40, 10], [200, 0, 10], [200, 40, 0], [200, 40, 129], [1.5, 40, 10]] as const)
      expect(() => runPoolQueueingLab(...args)).toThrow(RangeError);
  });
});
