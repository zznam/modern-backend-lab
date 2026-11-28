import { boundedInteger, type LabResult } from './lab-result.js';

/** Erlang C: probability that an arriving request waits, for c servers and offered load a = λ/μ. */
export function erlangC(servers: number, offeredLoad: number): number {
  if (offeredLoad >= servers) return 1;
  // Sum a^k/k! for k < c iteratively to stay numerically stable.
  let term = 1;
  let sum = 1;
  for (let k = 1; k < servers; k++) {
    term *= offeredLoad / k;
    sum += term;
  }
  const last = (term * offeredLoad) / servers; // a^c / c!
  const top = last * (servers / (servers - offeredLoad));
  return top / (sum + top);
}

/** Smallest pool whose mean wait stays under `targetWaitMs` (or null if none up to 256). */
export function smallestPool(arrivalPerSecond: number, serviceMs: number, targetWaitMs: number): number | null {
  const mu = 1000 / serviceMs;
  const load = arrivalPerSecond / mu;
  for (let c = Math.max(1, Math.ceil(load)); c <= 256; c++) {
    if (c <= load) continue;
    const waitMs = (erlangC(c, load) / (c * mu - arrivalPerSecond)) * 1000;
    if (waitMs <= targetWaitMs) return c;
  }
  return null;
}

const round = (value: number, places = 1) => Math.round(value * 10 ** places) / 10 ** places;

/**
 * An M/M/c queue in front of a connection pool: Poisson arrivals at `arrivalPerSecond`,
 * exponential service averaging `serviceMs`, and `poolSize` connections.
 */
export function runPoolQueueingLab(arrivalPerSecond = 200, serviceMs = 40, poolSize = 10) {
  boundedInteger(arrivalPerSecond, 'arrivalPerSecond', 1, 1000);
  boundedInteger(serviceMs, 'serviceMs', 1, 500);
  boundedInteger(poolSize, 'poolSize', 1, 128);
  const mu = 1000 / serviceMs;
  const offeredLoad = arrivalPerSecond / mu; // average busy connections needed (Little's law: L = λW)
  const utilization = offeredLoad / poolSize;
  const stable = utilization < 1;
  const pWait = stable ? erlangC(poolSize, offeredLoad) : 1;
  const waitMs = stable ? (pWait / (poolSize * mu - arrivalPerSecond)) * 1000 : Infinity;
  const responseMs = waitMs + serviceMs;
  const inSystem = stable ? (arrivalPerSecond * responseMs) / 1000 : Infinity;
  const recommended = smallestPool(arrivalPerSecond, serviceMs, serviceMs * 0.1);

  return {
    model: 'Steady-state M/M/c queue: Poisson arrivals, exponential service times, identical connections and an unbounded wait queue. No timeouts, retries, connection setup cost, or database-side contention as the pool grows.',
    summary: !stable
      ? `Requests need ${round(offeredLoad)} busy connections on average but only ${poolSize} exist: the queue grows without limit and latency is unbounded.`
      : `At ${round(utilization * 100)}% utilization, ${round(pWait * 100)}% of requests wait, adding ${round(waitMs)} ms on average to the ${serviceMs} ms of work.`,
    metrics: [
      { label: 'Utilization', value: `${round(utilization * 100)}%`, hint: `${round(offeredLoad)} of ${poolSize} connections busy on average` },
      { label: 'Mean wait', value: stable ? `${round(waitMs)} ms` : 'Unbounded', hint: stable ? `${round(pWait * 100)}% of requests wait at all` : 'Arrivals exceed capacity' },
      { label: 'Suggested pool', value: recommended ?? '> 256', hint: 'Smallest pool keeping mean wait under 10% of service time' },
    ],
    steps: [
      { title: 'Apply Little\'s law', detail: `${arrivalPerSecond} req/s × ${serviceMs} ms = ${round(offeredLoad)} connections busy on average, before any queueing.`, state: 'ok' },
      { title: 'Compare with the pool', detail: `${poolSize} connections → ${round(utilization * 100)}% utilization.${stable ? '' : ' Above 100%, no amount of waiting catches up.'}`, state: !stable ? 'blocked' : utilization > 0.85 ? 'warning' : 'ok' },
      { title: 'Probability of waiting (Erlang C)', detail: stable ? `${round(pWait * 100)}% of arrivals find every connection busy.` : 'Every arrival waits and the queue keeps growing.', state: stable ? (pWait > 0.5 ? 'warning' : 'ok') : 'blocked' },
      { title: 'Latency', detail: stable ? `Mean response ${round(responseMs)} ms (${round(waitMs)} ms waiting); about ${round(inSystem)} requests in the system at once.` : 'Response time grows with every second of overload.', state: stable ? 'ok' : 'blocked' },
      { title: 'Size the pool', detail: recommended ? `${recommended} connections keep the mean wait under ${round(serviceMs * 0.1)} ms. Waits rise sharply near 100% utilization, so leave headroom rather than sizing for the average.` : 'No pool up to 256 meets the target; reduce service time or shed load.', state: recommended && poolSize >= recommended ? 'ok' : 'warning' },
    ],
    configuration: { arrivalPerSecond, serviceMs, poolSize },
    offeredLoad: round(offeredLoad, 3), utilization: round(utilization, 4), probabilityOfWaiting: round(pWait, 4),
    meanWaitMs: stable ? round(waitMs, 2) : null, meanResponseMs: stable ? round(responseMs, 2) : null, recommendedPool: recommended,
  } satisfies LabResult & Record<string, unknown>;
}
