import { boundedInteger, type LabResult } from './lab-result.js';

const KEYS = 1000;
const REQUESTS = 20_000;
type Policy = 'LRU' | 'LFU' | 'FIFO';

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

/** Deterministic Zipf-distributed key stream: key k is requested with weight 1 / k^s. */
export function zipfStream(skewTenths: number, requests = REQUESTS, keys = KEYS, seed = 7): number[] {
  const s = skewTenths / 10;
  const cumulative: number[] = [];
  let total = 0;
  for (let k = 1; k <= keys; k++) {
    total += 1 / k ** s;
    cumulative.push(total);
  }
  const random = prng(seed);
  const stream: number[] = [];
  for (let i = 0; i < requests; i++) {
    const target = random() * total;
    let lo = 0;
    let hi = keys - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid]! < target) lo = mid + 1;
      else hi = mid;
    }
    stream.push(lo);
  }
  return stream;
}

/** Replays a key stream through one eviction policy and returns the hit count. */
export function simulate(policy: Policy, capacity: number, stream: readonly number[]): number {
  let hits = 0;
  if (policy === 'LRU' || policy === 'FIFO') {
    const cache = new Map<number, true>();
    for (const key of stream) {
      if (cache.has(key)) {
        hits++;
        if (policy === 'LRU') {
          cache.delete(key);
          cache.set(key, true);
        }
        continue;
      }
      if (cache.size >= capacity) cache.delete(cache.keys().next().value as number);
      cache.set(key, true);
    }
    return hits;
  }
  // LFU with LRU tie-break among equal counts; counts kept only while cached.
  const counts = new Map<number, number>();
  const lastUse = new Map<number, number>();
  stream.forEach((key, time) => {
    if (counts.has(key)) {
      hits++;
      counts.set(key, counts.get(key)! + 1);
      lastUse.set(key, time);
      return;
    }
    if (counts.size >= capacity) {
      let victim = -1;
      for (const [candidate, count] of counts) {
        if (
          victim === -1 ||
          count < counts.get(victim)! ||
          (count === counts.get(victim)! && lastUse.get(candidate)! < lastUse.get(victim)!)
        )
          victim = candidate;
      }
      counts.delete(victim);
      lastUse.delete(victim);
    }
    counts.set(key, 1);
    lastUse.set(key, time);
  });
  return hits;
}

const pct = (hits: number) => Math.round((hits / REQUESTS) * 1000) / 10;

/** Hit rates of LRU, LFU and FIFO for one cache size and workload skew. */
export function runCacheEvictionLab(cacheSize = 50, skewTenths = 10) {
  boundedInteger(cacheSize, 'cacheSize', 1, 500);
  boundedInteger(skewTenths, 'skewTenths', 0, 20);
  const stream = zipfStream(skewTenths);
  const rates = (['LRU', 'LFU', 'FIFO'] as const).map((policy) => ({ policy, hitRate: pct(simulate(policy, cacheSize, stream)) }));
  const best = [...rates].sort((a, b) => b.hitRate - a.hitRate)[0]!;
  const share = Math.round((cacheSize / KEYS) * 1000) / 10;
  const byPolicy = Object.fromEntries(rates.map((r) => [r.policy, r.hitRate])) as Record<Policy, number>;
  const skew = skewTenths / 10;

  return {
    model: `${REQUESTS.toLocaleString('en')} reads over ${KEYS} keys drawn from a Zipf distribution (s = ${skew}) with a fixed seed; one cache of ${cacheSize} entries per policy. No writes, TTLs, item sizes, admission policies (TinyLFU), or warm-up exclusion.`,
    summary: skewTenths === 0
      ? `With uniform access, every policy hits about ${share}% of the time, the share of keys that fit; eviction choice barely matters.`
      : `Caching ${share}% of keys, ${best.policy} hits ${best.hitRate}% under skew s = ${skew}; popular keys make a small cache far more valuable than its size suggests.`,
    metrics: [
      { label: 'LRU hit rate', value: `${byPolicy.LRU}%`, hint: 'Evicts the least recently used key' },
      { label: 'LFU hit rate', value: `${byPolicy.LFU}%`, hint: 'Evicts the least frequently used key' },
      { label: 'FIFO hit rate', value: `${byPolicy.FIFO}%`, hint: 'Evicts the oldest inserted key' },
    ],
    steps: [
      { title: 'Generate a skewed workload', detail: `Key k is requested with weight 1/k^${skew}; ${skewTenths === 0 ? 'every key is equally likely.' : 'a few keys receive most of the traffic.'}`, state: 'ok' },
      { title: 'Size the cache', detail: `${cacheSize} entries hold ${share}% of the ${KEYS} keys.`, state: 'ok' },
      { title: 'Replay through each policy', detail: rates.map((r) => `${r.policy} ${r.hitRate}%`).join(' · '), state: 'ok' },
      { title: 'Compare with the uniform baseline', detail: `A uniform workload would hit about ${share}%. ${best.policy} beats that by ${Math.round((best.hitRate - share) * 10) / 10} points because hot keys stay cached.`, state: best.hitRate - share > 10 ? 'ok' : 'warning' },
      { title: 'Choose a policy', detail: byPolicy.LFU > byPolicy.LRU ? 'Stable popularity favours LFU, but LFU adapts slowly when popularity shifts; LRU recovers faster.' : 'LRU matches or beats LFU here and adapts quickly when popularity changes.', state: 'ok' },
    ],
    configuration: { keys: KEYS, requests: REQUESTS, cacheSize, skewTenths, seed: 7 },
    hitRates: byPolicy, bestPolicy: best.policy, cacheShare: share,
  } satisfies LabResult & Record<string, unknown>;
}
