import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { runConsensusLab } from '../src/05-advanced-systems/consensus.js';
import { FencedResource, runFencingLab } from '../src/05-advanced-systems/fencing.js';
import { BalanceProjection, EventLedger, runEventSourcingLab } from '../src/05-advanced-systems/event-sourcing.js';
import { runSnapshotLab } from '../src/05-advanced-systems/snapshot-isolation.js';
import { runBackpressureLab } from '../src/05-advanced-systems/backpressure.js';
import { runSloLab } from '../src/05-advanced-systems/slo-burn.js';

describe('Advanced systems invariants', () => {
  it.each([3, 5, 7, 9])('requires a fixed majority for %i members and repairs stale logs', size => {
    const quorum = Math.floor(size / 2) + 1;
    const blocked = runConsensusLab(size, quorum - 1);
    expect(blocked.elected).toBe(false);
    expect(blocked.healed).toBeNull();
    expect(blocked.partitioned.every(node => node.commitIndex === 1)).toBe(true);
    const recovered = runConsensusLab(size, quorum);
    expect(recovered.elected).toBe(true);
    expect(recovered.partitioned[0].commitIndex).toBe(1);
    expect(recovered.healed!.every(node => node.commitIndex === 2 && node.log[1].term === 2)).toBe(true);
    expect(new Set(recovered.healed!.map(node => JSON.stringify(node.log))).size).toBe(1);
  });
  it('validates membership and defaults to a reachable group smaller than the cluster', () => {
    expect(runConsensusLab(3).elected).toBe(true);
    expect(() => runConsensusLab(4)).toThrow('odd');
    expect(() => runConsensusLab(5, 5)).toThrow();
  });
  it('fences expired owners at the lease boundary, allowing repeat writes by the current generation', () => {
    expect(runFencingLab(999)).toMatchObject({ expired: false, staleWriteAccepted: true });
    expect(runFencingLab(1000)).toMatchObject({ expired: true, staleWriteAccepted: false, fencedValue: 'worker-B:new', unfencedValue: 'worker-A:resumed' });
    const resource = new FencedResource();
    expect(resource.write(2, 'first')).toBe(true);
    expect(resource.write(2, 'second')).toBe(true);
    expect(resource.write(1, 'stale')).toBe(false);
    expect(resource.value).toBe('second');
    expect(() => resource.write(0, 'invalid')).toThrow();
  });
  it.each([0, 1, 2, 3])('rebuilds a lagging projection with %i events already applied', batch => {
    const result = runEventSourcingLab(batch);
    expect(result.conflictRejected).toBe(true);
    expect(result.events).toHaveLength(3);
    expect(result.lagging.checkpoint).toBe(batch);
    expect(result.caughtUp).toEqual({ balance: 130, checkpoint: 3 });
    expect(result.rebuiltBalance).toBe(130);
    expect(result.duplicateApplications).toBe(0);
  });
  it('rejects stale appends and projection gaps and protects stored events from mutation', () => {
    const ledger = new EventLedger();
    ledger.append(0, 10).delta = 999;
    ledger.read()[0].delta = -999;
    expect(ledger.read()[0].delta).toBe(10);
    expect(() => ledger.append(0, 50)).toThrow('Version conflict');
    expect(ledger.read()).toHaveLength(1);
    const projection = new BalanceProjection();
    expect(() => projection.apply({ version: 2, delta: 10 })).toThrow('gap');
    expect(projection.balance).toBe(0);
    expect(projection.apply(ledger.read()[0])).toBe(true);
    expect(projection.apply(ledger.read()[0])).toBe(false);
    expect(projection.balance).toBe(10);
  });
  it('exposes write skew and retries decisions against fresh state', () => {
    const two = runSnapshotLab(2);
    expect(two.snapshotIsolation).toMatchObject({ remaining: 0, invariantHolds: false, aborted: 0 });
    expect(two.serializableValidation).toMatchObject({ remaining: 1, invariantHolds: true, aborted: 1, retried: false });
    const three = runSnapshotLab(3);
    expect(three.snapshotIsolation.remaining).toBe(1);
    expect(three.serializableValidation).toMatchObject({ remaining: 1, invariantHolds: true, retried: true });
  });
  it.each([[12, 4, 20], [1, 100, 1], [100, 1, 1], [100, 100, 100], [1, 1, 100]])(
    'conserves jobs at offered/service rates %i/%i and capacity %i', (producer, consumer, capacity) => {
      const result = runBackpressureLab(producer, consumer, capacity);
      for (const mode of [result.unbounded, result.backpressure, result.loadShedding]) {
        expect(mode.produced).toBe(mode.processed + mode.queued);
        expect(mode.produced + mode.rejected + mode.deferred).toBe(producer * 12);
        expect(mode.timeline.every(tick => tick.completed <= consumer && tick.queue >= 0)).toBe(true);
      }
      expect(result.backpressure.peakQueue).toBeLessThanOrEqual(capacity);
      expect(result.loadShedding.peakQueue).toBeLessThanOrEqual(capacity);
      expect(result.backpressure.rejected).toBe(0);
      expect(result.loadShedding.deferred).toBe(0);
    },
  );
  it('normalizes burn to the SLO and requires both windows, including the threshold boundary', () => {
    expect(runSloLab()).toMatchObject({ page: true, longBurn: 20, shortBurn: 20 });
    expect(runSloLab(9990, 200, 0)).toMatchObject({ page: false, shortBurn: 0 });
    expect(runSloLab(9990, 0, 200).page).toBe(false);
    expect(runSloLab(9990, 144, 144)).toMatchObject({ page: true, monthlyBudgetConsumedPercent: 2 });
    expect(runSloLab(9990, 143, 144).page).toBe(false);
    expect(runSloLab(9999, 200, 200).longBurn).toBe(200);
    expect(runSloLab(9999, 0, 0).longBurn).toBe(0);
  });
  it('bounds direct callers as well as HTTP requests', () => {
    for (const run of [() => runFencingLab(-1), () => runEventSourcingLab(4), () => runSnapshotLab(1),
      () => runBackpressureLab(Infinity), () => runBackpressureLab(1, 0), () => runSloLab(10000),
      () => runSloLab(9990, NaN), () => runSloLab(9990, 1, 10001)]) expect(run).toThrow(RangeError);
  });
});

describe('Curriculum integrity', () => {
  it('covers every dashboard topic with no dangling paths, prerequisites, or implementation references', () => {
    const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
    const ids = [...html.matchAll(/data-exp="([^"]+)"/g)].map(match => match[1]);
    const script = readFileSync(new URL('../public/curriculum.js', import.meta.url), 'utf8');
    const { guides, advanced, paths } = runInNewContext(`${script}\n({guides: TOPIC_GUIDES, advanced: ADVANCED_TOPICS, paths: LEARNING_PATHS})`);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(42);
    expect(Object.keys(advanced)).toHaveLength(6);
    expect(Object.keys(guides).length + Object.keys(advanced).length).toBe(ids.length);
    for (const id of ids) {
      const topic = advanced[id];
      const guide = guides[id];
      expect(Boolean(topic || guide), id).toBe(true);
      for (const dependency of topic?.prerequisites || guide[1]) expect(ids).toContain(dependency);
      if (topic) {
        expect(topic.objective.length).toBeGreaterThan(30);
        expect(topic.challenge.length).toBeGreaterThan(50);
        expect(topic.reference[1]).toMatch(/^https:\/\//);
        expect(readFileSync(new URL(`../${topic.source}`, import.meta.url), 'utf8')).toBeTruthy();
      }
    }
    for (const path of Object.values(paths) as { topics: string[] }[]) {
      expect(new Set(path.topics).size).toBe(path.topics.length);
      path.topics.forEach(topic => expect(ids).toContain(topic));
    }
  });
});
