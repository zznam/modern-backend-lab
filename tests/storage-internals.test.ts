import { describe, expect, it } from 'vitest';
import { runReplicationLab } from '../src/05-advanced-systems/replication-quorums.js';
import { LsmStore, runLsmLab } from '../src/05-advanced-systems/lsm-compaction.js';

describe('Replication quorum invariants', () => {
  const configurations = [1, 2, 3].flatMap(read => [1, 2, 3].flatMap(write => [0, 1, 2].map(failed => [read, write, failed])));
  it.each(configurations)('honors R=%i, W=%i with %i failures', (read, write, failed) => {
    const result = runReplicationLab(read, write, failed);
    expect(result.read.available).toBe(read <= 3 - failed);
    expect(result.write.acknowledged).toBe(write <= 3 - failed);
    expect(result.write.replicaIds).toHaveLength(result.write.acknowledged ? write : 0);
    expect(result.quorumIntersectionGuaranteed).toBe(read + write > 3);
    if (!result.read.available) {
      expect(result.read.returnedValue).toBeNull();
      expect(result.read.stale).toBeNull();
      expect(result.replicasAfterRead).toEqual(result.replicasBeforeRead);
    } else {
      expect(result.read.observed).toHaveLength(read);
      expect(result.read.returnedVersion).toBe(Math.max(...result.read.observed.map(reply => reply.version)));
      expect(new Set(result.read.observed.map(reply => reply.id)).size).toBe(read);
      if (result.write.acknowledged && result.quorumIntersectionGuaranteed) {
        expect(result.actualOverlap.length).toBeGreaterThan(0);
        expect(result.read.stale).toBe(false);
        expect(result.read.returnedValue).toBe(150);
      }
    }
    if (!result.write.acknowledged) expect(result.replicasAfterRead.every(replica => replica.version === 1)).toBe(true);
    for (const replica of result.replicasAfterRead) {
      const before = result.replicasBeforeRead.find(previous => previous.id === replica.id)!;
      const participated = result.read.observed.some(reply => reply.id === replica.id);
      expect(replica.version).toBeGreaterThanOrEqual(before.version);
      if (!participated) expect(replica).toEqual(before);
      if (participated) expect(replica.version).toBe(result.read.returnedVersion);
    }
  });

  it('exhibits stale reads at the intersection boundary and cannot repair unseen writes', () => {
    for (const [read, write] of [[1, 1], [1, 2], [2, 1]]) {
      const result = runReplicationLab(read, write);
      expect(result.write.acknowledged).toBe(true);
      expect(result.read).toMatchObject({ stale: true, returnedVersion: 1, returnedValue: 100, repairedReplicaIds: [] });
      expect(result.actualOverlap).toEqual([]);
      expect(result.replicasBeforeRead).toEqual(result.replicasAfterRead);
    }
  });

  it('repairs an older responder only after another response reveals the newer version', () => {
    const result = runReplicationLab(2, 2);
    expect(result.read.observed.map(reply => reply.version)).toEqual([1, 2]);
    expect(result.read.repairedReplicaIds).toEqual(['replica-3']);
    expect(result.replicasBeforeRead[2].version).toBe(1);
    expect(result.replicasAfterRead.every(replica => replica.version === 2)).toBe(true);
  });

  it('keeps each invocation independent and rejects malformed quorum controls', () => {
    const result = runReplicationLab();
    result.replicasAfterRead[0].version = 999;
    expect(runReplicationLab().replicasBeforeRead[0].version).toBe(2);
    for (const invalid of [-1, 0, 4, 1.5, NaN, Infinity]) {
      expect(() => runReplicationLab(invalid)).toThrow(RangeError);
      expect(() => runReplicationLab(2, invalid)).toThrow(RangeError);
    }
    for (const invalid of [-1, 3, 0.5, NaN, Infinity]) expect(() => runReplicationLab(2, 2, invalid)).toThrow(RangeError);
  });
});

describe('LSM storage invariants', () => {
  it.each([2, 3, 4, 5, 6])('preserves query values and accounts for work with threshold %i', limit => {
    const uncompacted = runLsmLab(limit, 0);
    const compacted = runLsmLab(limit, 1);
    const values = (reads: typeof compacted.before.reads) => reads.map(({ key, value }) => ({ key, value }));
    const expected = [
      { key: 'account:alice', value: '150' }, { key: 'account:bob', value: null },
      { key: 'account:carol', value: null }, { key: 'account:dana', value: '45' },
      { key: 'account:erin', value: '25' }, { key: 'account:missing', value: null },
    ];
    expect(values(compacted.before.reads)).toEqual(expected);
    expect(values(compacted.after.reads)).toEqual(expected);
    expect(values(uncompacted.after.reads)).toEqual(expected);
    expect(compacted.before.runs).toHaveLength(Math.ceil(12 / limit));
    expect(uncompacted.after).toEqual(uncompacted.before);
    expect(compacted.after.runs).toHaveLength(1);
    expect(compacted.after.runs[0].entries).toHaveLength(3);
    expect(compacted.compactionResult).toMatchObject({ inputEntries: 12, outputEntries: 3, fullCoverage: true, tombstonesDropped: 2 });
    expect(compacted.counters.afterReadProbes).toBeLessThan(compacted.counters.beforeReadProbes);
    expect(compacted.counters).toMatchObject({ logicalWrites: 12, entryWrites: 15, writeAmplification: 1.25 });
    expect(uncompacted.counters).toMatchObject({ logicalWrites: 12, entryWrites: 12, writeAmplification: 1 });
    expect(compacted.before.reads.find(read => read.key === 'account:bob')!.tombstone).toBe(true);
    expect(compacted.after.reads.find(read => read.key === 'account:bob')!.tombstone).toBe(false);
    expect(compacted.after.memtable).toEqual([]);
    for (const run of [...compacted.before.runs, ...compacted.after.runs]) {
      expect(run.entries.map(entry => entry.key)).toEqual(run.entries.map(entry => entry.key).sort());
      for (let index = 1; index < run.entries.length; index++) {
        if (run.entries[index - 1].key === run.entries[index].key) {
          expect(run.entries[index - 1].version).toBeGreaterThan(run.entries[index].version);
        }
      }
    }
  });

  it('never resurrects an old value when a partial compaction leaves its older run intact', () => {
    const store = new LsmStore(2);
    store.put('removed', 'old');
    store.put('original', 'keep');
    store.put('newer', 'keep');
    store.delete('removed');
    store.put('latest', 'keep');
    store.put('other', 'keep');
    const oldestRun = store.snapshot().runs[2];
    const partial = store.compact(2);
    expect(partial).toMatchObject({ fullCoverage: false, tombstonesRetained: 1, tombstonesDropped: 0 });
    expect(store.snapshot().runs[1]).toEqual(oldestRun);
    expect(store.get('removed')).toMatchObject({ value: null, tombstone: true, version: 4 });
    expect(store.snapshot().runs[0].entries.find(entry => entry.key === 'removed')!.value).toBeNull();
    const full = store.compact();
    expect(full).toMatchObject({ fullCoverage: true, tombstonesDropped: 1, tombstonesRetained: 0 });
    expect(store.get('removed')).toMatchObject({ value: null, tombstone: false, version: null });
    expect(store.snapshot().runs.flatMap(run => run.entries).some(entry => entry.key === 'removed')).toBe(false);
  });

  it('uses the newest memtable or run version through overwrites, deletions, and reinsertion', () => {
    const store = new LsmStore(3);
    store.put('key', 'old');
    store.put('key', 'new');
    expect(store.get('key')).toMatchObject({ value: 'new', version: 2, runProbes: 0 });
    store.delete('key');
    expect(store.get('key')).toMatchObject({ value: null, tombstone: true, version: 3, runProbes: 1 });
    store.put('key', 'reinserted');
    expect(store.get('key')).toMatchObject({ value: 'reinserted', version: 4, runProbes: 0 });
    expect(store.compact().tombstonesRetained).toBe(1);
    expect(store.get('key').value).toBe('reinserted');
    store.flush();
    store.compact();
    expect(store.get('key')).toMatchObject({ value: 'reinserted', version: 4, runProbes: 1 });
    expect(store.snapshot().runs[0].entries).toEqual([{ key: 'key', value: 'reinserted', version: 4 }]);
  });

  it('protects stored runs from snapshot mutation and handles deletion-only compaction', () => {
    const store = new LsmStore(2);
    store.put('key', 'old');
    store.delete('key');
    const snapshot = store.snapshot();
    snapshot.runs[0].entries[0].value = 'tampered';
    snapshot.runs.length = 0;
    expect(store.get('key')).toMatchObject({ value: null, tombstone: true });
    expect(store.compact()).toMatchObject({ outputEntries: 0, tombstonesDropped: 1 });
    expect(store.snapshot().runs).toEqual([]);
    expect(store.get('key')).toMatchObject({ value: null, version: null, runProbes: 0 });
    store.put('key', 'new');
    expect(store.get('key').value).toBe('new');
  });

  it('validates controls and returns independent runs with the display contract', () => {
    for (const invalid of [-1, 0, 1, 7, 2.5, NaN, Infinity]) expect(() => runLsmLab(invalid)).toThrow(RangeError);
    for (const invalid of [-1, 2, 0.5, NaN, Infinity]) expect(() => runLsmLab(3, invalid)).toThrow(RangeError);
    const mutated = runLsmLab();
    mutated.after.runs[0].entries[0].value = 'tampered';
    expect(runLsmLab().after.reads[0].value).toBe('150');
    for (const result of [runLsmLab(), runReplicationLab()]) {
      expect(result.metrics).toHaveLength(3);
      expect(result.steps.every(step => ['ok', 'warning', 'blocked'].includes(step.state))).toBe(true);
    }
  });
});
