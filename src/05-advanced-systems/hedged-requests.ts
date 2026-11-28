import { boundedInteger, type LabResult } from './lab-result.js';

const REQUESTS = 1000;
const BASE_MS = 20;
const OUTLIER_MS = 300;

/** Small deterministic PRNG (mulberry32) so every run of the lab is reproducible. */
function prng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

/**
 * 1,000 requests to replicas whose service time is 20 ms plus exponential jitter, with
 * `slowPercent`% hitting a 300 ms outlier (GC pause, noisy neighbour). With hedging, a request
 * still unanswered after `hedgeDelayMs` is also sent to a second replica; the first reply wins.
 */
export function runHedgedRequestsLab(hedgeDelayMs = 60, slowPercent = 5) {
  boundedInteger(hedgeDelayMs, 'hedgeDelayMs', 0, 300);
  boundedInteger(slowPercent, 'slowPercent', 0, 20);
  const random = prng(42);
  const serviceTime = () =>
    BASE_MS + Math.floor(-Math.log(1 - random()) * 10) + (random() * 100 < slowPercent ? OUTLIER_MS : 0);
  const hedging = hedgeDelayMs > 0;
  const baseline: number[] = [];
  const hedged: number[] = [];
  let duplicates = 0;
  let wonByHedge = 0;
  for (let i = 0; i < REQUESTS; i++) {
    const primary = serviceTime();
    const secondary = serviceTime();
    baseline.push(primary);
    if (hedging && primary > hedgeDelayMs) {
      duplicates++;
      const viaHedge = hedgeDelayMs + secondary;
      if (viaHedge < primary) wonByHedge++;
      hedged.push(Math.min(primary, viaHedge));
    } else hedged.push(primary);
  }
  baseline.sort((a, b) => a - b);
  hedged.sort((a, b) => a - b);
  const stats = (sorted: number[]) => ({ p50: percentile(sorted, 50), p95: percentile(sorted, 95), p99: percentile(sorted, 99) });
  const before = stats(baseline);
  const after = stats(hedged);
  const extraLoadPercent = Math.round((duplicates / REQUESTS) * 1000) / 10;

  return {
    model: `${REQUESTS} independent requests from a seeded generator: ${BASE_MS} ms base service time, exponential jitter (mean 10 ms) and a ${OUTLIER_MS} ms outlier for slowPercent% of calls. Replicas are independent; cancellation of the losing request, queueing from the extra load, and network time are not modelled.`,
    summary: !hedging
      ? `Without hedging, ${slowPercent}% outliers set the tail: p99 is ${before.p99} ms while the median stays at ${before.p50} ms.`
      : `Hedging after ${hedgeDelayMs} ms sends a duplicate for ${extraLoadPercent}% of requests and moves p99 from ${before.p99} ms to ${after.p99} ms.`,
    metrics: [
      { label: 'p99 latency', value: `${after.p99} ms`, hint: hedging ? `${before.p99} ms without hedging` : 'Hedging is off' },
      { label: 'Median latency', value: `${after.p50} ms`, hint: `p95 ${after.p95} ms` },
      { label: 'Extra requests', value: `${extraLoadPercent}%`, hint: hedging ? `${wonByHedge} duplicates answered first` : 'Set a hedge delay to compare' },
    ],
    steps: [
      { title: 'Measure the baseline tail', detail: `p50 ${before.p50} ms, p95 ${before.p95} ms, p99 ${before.p99} ms. ${slowPercent ? `The ${slowPercent}% outliers dominate the tail, not the median.` : 'With no outliers the tail stays close to the median.'}`, state: before.p99 > 3 * before.p50 ? 'warning' : 'ok' },
      { title: 'Choose a hedge delay', detail: hedging ? `Wait ${hedgeDelayMs} ms, about the p${baseline.filter(t => t <= hedgeDelayMs).length / 10 | 0} of normal latency, before sending a duplicate.` : 'Hedging is off; every request waits for its first replica.', state: 'ok' },
      { title: 'Send duplicates for slow requests', detail: hedging ? `${duplicates} of ${REQUESTS} requests (${extraLoadPercent}%) were still unanswered at ${hedgeDelayMs} ms and were duplicated.` : 'No duplicates sent.', state: extraLoadPercent > 20 ? 'warning' : 'ok' },
      { title: 'Take the first reply', detail: hedging ? `${wonByHedge} duplicates beat their original. p99 moves ${before.p99} → ${after.p99} ms; the median barely changes (${before.p50} → ${after.p50} ms).` : 'Nothing to compare.', state: 'ok' },
      { title: 'Budget the extra load', detail: hedging ? `${extraLoadPercent}% more requests reach the replicas. A very short delay duplicates almost everything and can create the overload it is meant to hide.` : 'Hedging trades extra load for a shorter tail.', state: hedgeDelayMs > 0 && hedgeDelayMs < 25 ? 'blocked' : 'ok' },
    ],
    configuration: { requests: REQUESTS, hedgeDelayMs, slowPercent, seed: 42 },
    baseline: before, hedged: after, duplicates, wonByHedge, extraLoadPercent,
  } satisfies LabResult & Record<string, unknown>;
}
