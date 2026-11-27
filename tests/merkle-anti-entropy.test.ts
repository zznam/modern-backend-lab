import { describe, expect, it } from 'vitest';
import { runAntiEntropyLab } from '../src/05-advanced-systems/merkle-anti-entropy.js';

describe('Merkle anti-entropy', () => {
  it('stops at the root when replicas already match', () => {
    const result = runAntiEntropyLab(0, 3);
    expect(result.rootsMatch).toBe(true);
    expect(result.comparisons).toBe(1);
    expect(result.exchangedKeys).toEqual([]);
    expect(result.converged).toBe(true);
  });

  it('isolates one divergent key to a single leaf range', () => {
    const result = runAntiEntropyLab(1, 3);
    expect(result.differingLeaves).toEqual([0]);
    expect(result.exchangedKeys).toHaveLength(4);
    expect(result.repairedKeys).toEqual(['k03']);
    // root, then two children per mismatched level down to the leaves
    expect(result.comparisons).toBe(1 + 2 + 2 + 2);
  });

  it('always converges and exchanges fewer keys than a full scan while drift is local', () => {
    for (let depth = 1; depth <= 4; depth++) {
      for (let divergent = 0; divergent <= 8; divergent++) {
        const result = runAntiEntropyLab(divergent, depth);
        expect(result.converged).toBe(true);
        expect(result.repairedKeys).toHaveLength(divergent);
        expect(result.rootHashes.after).toBe(result.rootHashes.before.a);
        expect(result.exchangedKeys.length).toBe(result.differingLeaves.length * (32 / 2 ** depth));
        expect(result.comparisons).toBeLessThanOrEqual(2 * 2 ** depth - 1);
      }
    }
    expect(runAntiEntropyLab(2, 4).exchangedKeys.length).toBeLessThan(runAntiEntropyLab(2, 1).exchangedKeys.length);
  });

  it('is deterministic and rejects malformed controls', () => {
    expect(runAntiEntropyLab(3, 2)).toEqual(runAntiEntropyLab(3, 2));
    for (const [d, t] of [[-1, 3], [9, 3], [2, 0], [2, 5], [1.5, 3], [Number.NaN, 3]]) {
      expect(() => runAntiEntropyLab(d, t)).toThrow(RangeError);
    }
  });
});
