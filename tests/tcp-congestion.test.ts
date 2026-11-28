import { describe, expect, it } from 'vitest';
import { runTcpCongestionLab } from '../src/05-advanced-systems/tcp-congestion.js';

describe('TCP congestion control lab', () => {
  it('doubles in slow start, then grows by one segment per round trip', () => {
    const result = runTcpCongestionLab(0, 0);
    expect(result.trace.slice(0, 7).map(t => t.cwnd)).toEqual([1, 2, 4, 8, 16, 32, 33]);
    expect(result.trace[5]!.phase).toBe('congestion-avoidance');
    expect(result.afterLoss).toBeNull();
  });

  it('fast recovery halves the window instead of restarting', () => {
    const result = runTcpCongestionLab(8, 0);
    // Rounds 1–7: 1,2,4,8,16,32,33; window in flight at round 8 is 34.
    expect(result.trace[7]).toMatchObject({ round: 8, cwnd: 17, ssthresh: 17, phase: 'loss' });
    expect(result.trace[8]).toMatchObject({ cwnd: 17, phase: 'congestion-avoidance' });
    expect(result.trace[9]!.cwnd).toBe(18);
  });

  it('a timeout restarts slow start from one segment and delivers less', () => {
    const timeout = runTcpCongestionLab(8, 1);
    const fast = runTcpCongestionLab(8, 0);
    expect(timeout.trace[7]).toMatchObject({ cwnd: 1, ssthresh: 17, phase: 'loss' });
    expect(timeout.trace.slice(8, 13).map(t => t.cwnd)).toEqual([1, 2, 4, 8, 16]);
    expect(timeout.trace[13]!.cwnd).toBe(17);
    expect(timeout.delivered).toBeLessThan(fast.delivered);
  });

  it('loss in the first round keeps the threshold at the floor of 2', () => {
    expect(runTcpCongestionLab(1, 0).trace[0]).toMatchObject({ cwnd: 2, ssthresh: 2 });
  });

  it('is deterministic and rejects malformed controls', () => {
    expect(runTcpCongestionLab(5, 1)).toEqual(runTcpCongestionLab(5, 1));
    for (const [round, type] of [[-1, 0], [21, 0], [3, 2], [1.5, 0], [Number.NaN, 1]])
      expect(() => runTcpCongestionLab(round, type)).toThrow(RangeError);
  });
});
