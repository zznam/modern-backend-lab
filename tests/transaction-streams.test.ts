import { describe, expect, it } from 'vitest';
import { runTwoPhaseCommitLab } from '../src/05-advanced-systems/two-phase-commit.js';
import { runStreamWatermarkLab } from '../src/05-advanced-systems/stream-watermarks.js';

describe('Two-phase commit recovery', () => {
  it.each([0, 1, 2])('keeps an atomic decision and idempotent delivery at crash point %i', crashPoint => {
    for (const rejectVote of [0, 1]) {
      const result = runTwoPhaseCommitLab(crashPoint, rejectVote);
      const commits = crashPoint !== 1 && rejectVote === 0;
      expect(result.finalDecision).toBe(commits ? 'commit' : 'abort');
      expect(result.atomicOutcome).toBe(true);
      expect(result.locksReleased).toBe(true);
      expect(result.coordinatorJournal).toEqual([{ decision: result.finalDecision, durable: true }]);
      expect(result.recovered.participants).toHaveLength(3);
      for (const participant of result.recovered.participants) {
        expect(participant.state).toBe(commits ? 'committed' : 'aborted');
        expect(participant.locked).toBe(false);
        expect(participant.appliedCommits).toBe(commits ? 1 : 0);
        expect(participant.journal.at(-1)).toBe(result.finalDecision);
      }
      expect(result.recoveryApplications).toBe(rejectVote ? 2 : 3);
      expect(result.duplicateApplications).toBe(0);
      expect(result.replayed).toEqual(result.recovered);
    }
  });

  it.each([1, 2])('holds prepared locks throughout a coordinator outage at crash point %i', crashPoint => {
    for (const rejectVote of [0, 1]) {
      const result = runTwoPhaseCommitLab(crashPoint, rejectVote);
      expect(result.blocked).not.toBeNull();
      expect(result.blocked!.coordinatorOnline).toBe(false);
      expect(result.blocked!.heldLocks).toBe(3 - rejectVote);
      expect(result.blocked!.inDoubtParticipants).toBe(3 - rejectVote);
      expect(result.afterTimeout).toEqual(result.blocked);
      for (const participant of result.blocked!.participants.filter(item => item.vote === 'yes')) {
        expect(participant).toMatchObject({ state: 'prepared', durablePrepare: true, locked: true, appliedCommits: 0, journal: ['prepare'] });
      }
      expect(result.blocked!.durableDecision).toBe(crashPoint === 1 ? null : rejectVote ? 'abort' : 'commit');
    }
  });

  it('does not equate unanimous votes with commit before a durable decision', () => {
    const beforeDecision = runTwoPhaseCommitLab(1, 0);
    const afterDecision = runTwoPhaseCommitLab(2, 0);
    expect(beforeDecision.prepared).toEqual(afterDecision.prepared);
    expect(beforeDecision.finalDecision).toBe('abort');
    expect(afterDecision.finalDecision).toBe('commit');
    expect(runTwoPhaseCommitLab(0).blocked).toBeNull();
    expect(runTwoPhaseCommitLab(0).afterTimeout).toBeNull();
  });

  it('keeps returned snapshots and subsequent runs independent', () => {
    const result = runTwoPhaseCommitLab(2);
    result.recovered.participants[0].journal.push('abort');
    result.recovered.participants[0].locked = true;
    expect(result.replayed.participants[0].journal).toEqual(['prepare', 'commit']);
    expect(result.blocked!.participants[0].journal).toEqual(['prepare']);
    expect(runTwoPhaseCommitLab(2).recovered.participants[0].locked).toBe(false);
  });
});

describe('Event-time watermark windows', () => {
  it('emits replacement updates and rejects exact cleanup-boundary arrivals', () => {
    const result = runStreamWatermarkLab();
    const firstWindow = result.emissions.filter(emission => emission.windowStart === 0);
    expect(firstWindow).toEqual([
      { windowStart: 0, windowEnd: 10, revision: 1, count: 2, sum: 12, kind: 'initial', watermark: 10 },
      { windowStart: 0, windowEnd: 10, revision: 2, count: 3, sum: 15, kind: 'update', watermark: 10 },
    ]);
    expect(result.timeline[3]).toMatchObject({ watermarkBefore: 10, watermarkAfter: 10, disposition: 'late-accepted' });
    expect(result.timeline[4].cleanedWindows).toContain(0);
    expect(result.timeline[5]).toMatchObject({ watermarkBefore: 12, windowEnd: 10, disposition: 'side-output' });
    expect(result.windows.find(window => window.start === 0)).toMatchObject({ count: 3, sum: 15, cleanedAt: 12 });
    expect(result.sideOutput.map(event => event.id)).toEqual(['event-6', 'event-10', 'event-11', 'event-15', 'event-16']);
    expect(result.acceptedCount).toBe(15);
    expect(result.updateCount).toBe(2);
  });

  it('uses half-open window assignment and admits against the prior watermark', () => {
    const result = runStreamWatermarkLab(0, 0);
    expect(result.timeline[2]).toMatchObject({ event: { eventTime: 12 }, watermarkBefore: 8, watermarkAfter: 12, disposition: 'before-window-end' });
    expect(result.timeline[2].emissions[0]).toMatchObject({ windowStart: 0, count: 2 });
    expect(result.timeline[3].disposition).toBe('side-output');
    expect(result.timeline.find(tick => tick.event.eventTime === 10)).toMatchObject({ windowStart: 10, windowEnd: 20 });
    expect(result.timeline.find(tick => tick.event.eventTime === 40)).toMatchObject({ windowStart: 40, windowEnd: 50 });
    // An event can trail the watermark while its window has not fired yet.
    expect(runStreamWatermarkLab().timeline[7]).toMatchObject({ event: { eventTime: 18 }, watermarkBefore: 19, disposition: 'before-window-end' });
  });

  it('makes lag and allowed lateness change acceptance and firing behavior', () => {
    const strict = runStreamWatermarkLab(0, 0);
    const delayed = runStreamWatermarkLab(20, 0);
    const retained = runStreamWatermarkLab(0, 20);
    expect(delayed.acceptedCount).toBeGreaterThan(strict.acceptedCount);
    expect(retained.acceptedCount).toBeGreaterThan(strict.acceptedCount);
    expect(strict.updateCount).toBe(0);
    expect(retained.updateCount).toBeGreaterThan(0);
    expect(delayed.timeline.findIndex(tick => tick.emissions.length > 0)).toBeGreaterThan(strict.timeline.findIndex(tick => tick.emissions.length > 0));
    expect(runStreamWatermarkLab(20, 20).acceptedCount).toBe(20);
  });

  it('conserves each event and its value, keeps watermarks monotonic, and clears state for every control pair', () => {
    for (let lag = 0; lag <= 20; lag++) {
      for (let lateness = 0; lateness <= 20; lateness++) {
        const result = runStreamWatermarkLab(lag, lateness);
        const accepted = result.timeline.filter(tick => tick.disposition !== 'side-output');
        const rejected = new Set(result.sideOutput.map(event => event.id));
        expect(new Set([...accepted.map(tick => tick.event.id), ...rejected]).size).toBe(result.events.length);
        expect(accepted.every(tick => !rejected.has(tick.event.id))).toBe(true);
        expect(result.acceptedCount + result.lateCount).toBe(result.events.length);
        expect(result.acceptedValue + result.lateValue).toBe(result.totalValue);
        expect(result.acceptedValue).toBe(accepted.reduce((total, tick) => total + tick.event.value, 0));
        expect(result.conservation).toMatchObject({ countsMatch: true, valuesMatch: true });
        expect(result.timeline.every(tick => tick.watermarkAfter >= (tick.watermarkBefore ?? -Infinity))).toBe(true);
        expect(result.activeWindowCount).toBe(0);
        expect(result.windows.every(window => window.cleanedAt >= window.end + lateness)).toBe(true);
        for (const window of result.windows) {
          const members = accepted.filter(tick => tick.windowStart === window.start);
          expect(window.count).toBe(members.length);
          expect(window.sum).toBe(members.reduce((total, tick) => total + tick.event.value, 0));
        }
      }
    }
  });

  it('allows an upsert consumer to reconstruct final results without double counting revisions', () => {
    const result = runStreamWatermarkLab(0, 20);
    const consumer = new Map<number, { revision: number; count: number; sum: number }>();
    for (const emission of result.emissions) {
      const previous = consumer.get(emission.windowStart);
      expect(emission.revision).toBe((previous?.revision ?? 0) + 1);
      consumer.set(emission.windowStart, emission);
    }
    for (const window of result.windows) expect(consumer.get(window.start)).toMatchObject({ count: window.count, sum: window.sum, revision: window.revision });
    expect([...consumer.values()].reduce((sum, window) => sum + window.sum, 0)).toBe(result.acceptedValue);
    expect(result.emissions.reduce((sum, emission) => sum + emission.sum, 0)).toBeGreaterThan(result.acceptedValue);
    expect(result.drain.emissions.some(emission => emission.windowStart === 40)).toBe(true);
    expect(result.drain.watermarkAfter).toBeGreaterThan(result.drain.watermarkBefore);
  });

  it('has fresh event input and window state on every run', () => {
    const result = runStreamWatermarkLab();
    const original = structuredClone(result);
    result.events[0].value = -1;
    result.windows[0].sum = -1;
    result.sideOutput.splice(0);
    expect(runStreamWatermarkLab()).toEqual(original);
    expect(JSON.parse(JSON.stringify(original))).toEqual(original);
  });
});

describe('Transaction and stream input contracts', () => {
  it.each([NaN, Infinity, -Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER])('rejects invalid control %s before simulation', invalid => {
    expect(() => runTwoPhaseCommitLab(invalid)).toThrow(RangeError);
    expect(() => runTwoPhaseCommitLab(0, invalid)).toThrow(RangeError);
    expect(() => runStreamWatermarkLab(invalid)).toThrow(RangeError);
    expect(() => runStreamWatermarkLab(0, invalid)).toThrow(RangeError);
  });

  it('enforces upper bounds and the dashboard result shape', () => {
    expect(() => runTwoPhaseCommitLab(3)).toThrow(RangeError);
    expect(() => runTwoPhaseCommitLab(0, 2)).toThrow(RangeError);
    expect(() => runStreamWatermarkLab(21)).toThrow(RangeError);
    expect(() => runStreamWatermarkLab(0, 21)).toThrow(RangeError);
    for (const result of [runTwoPhaseCommitLab(), runStreamWatermarkLab()]) {
      expect(result.metrics).toHaveLength(3);
      expect(result.model).toContain('Deterministic');
      expect(result.steps.every(step => ['ok', 'warning', 'blocked'].includes(step.state))).toBe(true);
    }
  });
});
