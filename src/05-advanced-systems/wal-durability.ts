import { boundedInteger, type LabResult } from './lab-result.js';

const MODES = ['fsync each write', 'group commit', 'asynchronous commit'] as const;
const round = (value: number, places = 1) => Math.round(value * 10 ** places) / 10 ** places;

/**
 * A write-ahead log on a disk whose fsync takes `fsyncMs`. Mode 0 flushes every write before
 * acknowledging it; mode 1 (group commit) waits up to `windowMs` to flush many writes with one
 * fsync, still acknowledging only after it; mode 2 acknowledges immediately and flushes every
 * `windowMs`, so a crash loses whatever was acknowledged since the last flush.
 */
export function runWalDurabilityLab(writesPerSecond = 2000, fsyncMs = 5, mode = 1, windowMs = 5) {
  boundedInteger(writesPerSecond, 'writesPerSecond', 10, 5000);
  boundedInteger(fsyncMs, 'fsyncMs', 1, 20);
  boundedInteger(mode, 'mode', 0, 2);
  boundedInteger(windowMs, 'windowMs', 1, 50);
  const perMs = writesPerSecond / 1000;
  let capacity: number;
  let latencyMs: number;
  let lostOnCrash: number;
  let fsyncsPerSecond: number;
  if (mode === 0) {
    capacity = Math.floor(1000 / fsyncMs);
    fsyncsPerSecond = Math.min(writesPerSecond, capacity);
    latencyMs = fsyncMs;
    lostOnCrash = 0;
  } else {
    // One flush per cycle; a cycle lasts at least one fsync.
    const cycleMs = Math.max(windowMs, fsyncMs);
    capacity = Infinity;
    fsyncsPerSecond = round(1000 / cycleMs);
    if (mode === 1) {
      latencyMs = cycleMs / 2 + fsyncMs; // average wait for the batch, then its fsync
      lostOnCrash = 0;
    } else {
      latencyMs = 0;
      lostOnCrash = Math.round(perMs * (cycleMs + fsyncMs)); // acknowledged since the last durable flush
    }
  }
  const overloaded = writesPerSecond > capacity;
  const batch = mode === 0 ? 1 : round(perMs * Math.max(windowMs, fsyncMs));

  return {
    model: 'Constant arrival rate, a fixed fsync latency, a single log device and one crash at the worst moment. No disk queue depth, battery-backed caches, replication, torn writes, or CPU cost per record.',
    summary: overloaded
      ? `Flushing every write caps the log at ${capacity} writes/s; ${writesPerSecond} writes/s queue up without limit.`
      : mode === 2
        ? `Asynchronous commit acknowledges instantly but a crash can lose about ${lostOnCrash} acknowledged writes.`
        : `${MODES[mode]} keeps every acknowledged write durable with ${fsyncsPerSecond} fsyncs/s and about ${round(latencyMs)} ms commit latency.`,
    metrics: [
      { label: 'Commit latency', value: overloaded ? 'Unbounded' : `${round(latencyMs)} ms`, hint: mode === 2 ? 'Acknowledged before the data is durable' : 'Acknowledged after fsync' },
      { label: 'Fsyncs per second', value: fsyncsPerSecond, hint: mode === 0 ? `Capacity ${capacity} writes/s` : `About ${batch} writes per fsync` },
      { label: 'Acked writes lost on crash', value: lostOnCrash, hint: lostOnCrash ? 'Durability traded for latency' : 'Every acknowledged write survives' },
    ],
    steps: [
      { title: 'Measure the disk', detail: `Each fsync takes ${fsyncMs} ms, so one-at-a-time flushing can do at most ${Math.floor(1000 / fsyncMs)} per second.`, state: 'ok' },
      { title: 'Choose a commit mode', detail: `${MODES[mode]}${mode === 0 ? '' : `, flushing every ${Math.max(windowMs, fsyncMs)} ms`}.`, state: 'ok' },
      { title: 'Check throughput', detail: overloaded ? `${writesPerSecond} writes/s exceed the ${capacity} writes/s limit: the queue grows forever.` : `${writesPerSecond} writes/s fit; ${mode === 0 ? 'every write gets its own fsync' : `about ${batch} writes share each fsync`}.`, state: overloaded ? 'blocked' : 'ok' },
      { title: 'Check latency', detail: overloaded ? 'Latency grows with the backlog.' : mode === 2 ? 'Clients see near-zero commit latency.' : `Average commit latency ≈ ${round(latencyMs)} ms${mode === 1 ? ' (waiting for the batch plus its fsync)' : ''}.`, state: overloaded ? 'blocked' : 'ok' },
      { title: 'Crash at the worst moment', detail: lostOnCrash ? `Up to ${lostOnCrash} writes were acknowledged but not yet flushed: clients believe they succeeded.` : 'Nothing acknowledged is lost: acknowledgements wait for fsync.', state: lostOnCrash ? 'warning' : 'ok' },
    ],
    configuration: { writesPerSecond, fsyncMs, mode, windowMs },
    modeName: MODES[mode], capacity: Number.isFinite(capacity) ? capacity : null, overloaded,
    commitLatencyMs: overloaded ? null : round(latencyMs, 2), fsyncsPerSecond, lostOnCrash, writesPerFsync: batch,
  } satisfies LabResult & Record<string, unknown>;
}
