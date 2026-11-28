import { describe, expect, it } from 'vitest';
import { runHedgedRequestsLab } from '../src/05-advanced-systems/hedged-requests.js';

describe('Hedged requests lab', () => {
  it('leaves latency unchanged and sends no duplicates when hedging is off', () => {
    const result = runHedgedRequestsLab(0, 5);
    expect(result.hedged).toEqual(result.baseline);
    expect(result.duplicates).toBe(0);
    expect(result.extraLoadPercent).toBe(0);
  });

  it('cuts the tail far more than the median at a moderate delay', () => {
    const result = runHedgedRequestsLab(60, 5);
    expect(result.baseline.p99).toBeGreaterThan(300);
    expect(result.hedged.p99).toBeLessThan(result.baseline.p99 / 2);
    expect(result.hedged.p50).toBe(result.baseline.p50);
    expect(result.extraLoadPercent).toBeLessThan(15);
  });

  it('shorter delays send more duplicates', () => {
    const eager = runHedgedRequestsLab(10, 5);
    const patient = runHedgedRequestsLab(120, 5);
    expect(eager.duplicates).toBeGreaterThan(patient.duplicates);
    expect(eager.extraLoadPercent).toBeGreaterThan(50);
  });

  it('never makes any percentile worse', () => {
    for (const delay of [5, 30, 60, 150, 300]) {
      for (const slow of [0, 5, 20]) {
        const { baseline, hedged } = runHedgedRequestsLab(delay, slow);
        expect(hedged.p50).toBeLessThanOrEqual(baseline.p50);
        expect(hedged.p95).toBeLessThanOrEqual(baseline.p95);
        expect(hedged.p99).toBeLessThanOrEqual(baseline.p99);
      }
    }
  });

  it('is deterministic and rejects malformed controls', () => {
    expect(runHedgedRequestsLab(40, 10)).toEqual(runHedgedRequestsLab(40, 10));
    for (const [delay, slow] of [[-1, 5], [301, 5], [60, 21], [1.5, 5], [60, Number.NaN]])
      expect(() => runHedgedRequestsLab(delay, slow)).toThrow(RangeError);
  });
});
