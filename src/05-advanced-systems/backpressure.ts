import { boundedInteger, type LabResult } from './lab-result.js';

/** Discrete-time queue model. Counts are jobs per tick, not measured throughput. */
export function runBackpressureLab(producerRate = 12, consumerRate = 4, queueCapacity = 20) {
  boundedInteger(producerRate, 'producerRate', 1, 100);
  boundedInteger(consumerRate, 'consumerRate', 1, 100);
  boundedInteger(queueCapacity, 'queueCapacity', 1, 100);
  const ticks = 12;
  function simulate(policy: 'unbounded' | 'pause' | 'shed') {
    let queue = 0, produced = 0, processed = 0, rejected = 0, deferred = 0, peakQueue = 0;
    const timeline = [];
    for (let tick = 1; tick <= ticks; tick++) {
      const admitted = policy === 'unbounded' ? producerRate : Math.min(producerRate, queueCapacity - queue);
      const excess = producerRate - admitted;
      if (policy === 'pause') deferred += excess;
      if (policy === 'shed') rejected += excess;
      produced += admitted;
      queue += admitted;
      peakQueue = Math.max(peakQueue, queue);
      const completed = Math.min(queue, consumerRate);
      processed += completed;
      queue -= completed;
      timeline.push({ tick, admitted, completed, queue, excess });
    }
    return { policy, produced, processed, queued: queue, peakQueue, rejected, deferred, timeline };
  }
  const unbounded = simulate('unbounded');
  const backpressure = simulate('pause');
  const loadShedding = simulate('shed');
  return {
    model: '12 logical ticks; admission occurs before service. Deferred demand is not generated or buffered locally. No real streams or memory benchmark.',
    summary: 'Pausing a cooperative producer bounds local backlog. When callers cannot slow down, admission control rejects excess work explicitly.',
    metrics: [
      { label: 'Unbounded peak', value: unbounded.peakQueue, hint: 'Jobs resident before service in a tick' },
      { label: 'Bounded peak', value: backpressure.peakQueue, hint: `Capacity: ${queueCapacity} jobs` },
      { label: 'Load shed', value: loadShedding.rejected, hint: 'Rejected requests need an explicit overload response' },
    ],
    steps: [
      { title: 'Offer work', detail: `${producerRate} jobs/tick offered; ${consumerRate} jobs/tick service capacity.`, state: 'ok' },
      { title: 'Allow unbounded buffering', detail: `${unbounded.queued} jobs remain after ${ticks} ticks. More buffering cannot increase service capacity.`, state: unbounded.queued ? 'warning' : 'ok' },
      { title: 'Apply backpressure', detail: `${backpressure.deferred} units of potential demand are deferred upstream; peak queue ${backpressure.peakQueue}.`, state: 'ok' },
      { title: 'Shed noncooperative demand', detail: `${loadShedding.rejected} jobs are rejected; ${loadShedding.processed} completed and ${loadShedding.queued} remain queued.`, state: loadShedding.rejected ? 'warning' : 'ok' },
    ], unbounded, backpressure, loadShedding,
  } satisfies LabResult & Record<string, unknown>;
}
