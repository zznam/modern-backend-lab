import { boundedInteger, type LabResult } from './lab-result.js';

interface StreamEvent { id: string; eventTime: number; value: number }
interface WindowState { start: number; end: number; count: number; sum: number; revision: number }
interface Emission {
  windowStart: number;
  windowEnd: number;
  revision: number;
  count: number;
  sum: number;
  kind: 'initial' | 'update';
  watermark: number;
}

/** Seconds, half-open windows, and an explicit frontier policy rather than Flink's millisecond timers. */
export function runStreamWatermarkLab(watermarkLag = 2, allowedLateness = 2) {
  boundedInteger(watermarkLag, 'watermarkLag', 0, 20);
  boundedInteger(allowedLateness, 'allowedLateness', 0, 20);
  const workload = [
    [2, 5], [8, 7], [12, 11], [7, 3], [14, 13], [9, 17], [21, 19], [18, 23],
    [24, 29], [11, 31], [19, 37], [32, 41], [25, 43], [35, 47], [22, 53],
    [10, 59], [39, 61], [31, 67], [40, 71], [38, 73],
  ];
  const events: StreamEvent[] = workload.map(([eventTime, value], index) => ({ id: `event-${index + 1}`, eventTime, value }));
  const active = new Map<number, WindowState>();
  // Completed aggregates are retained for teaching output, not as active operator state.
  const completed: (WindowState & { cleanedAt: number })[] = [];
  const emissions: Emission[] = [];
  const sideOutput: (StreamEvent & { windowStart: number; windowEnd: number; watermark: number })[] = [];
  const timeline: {
    event: StreamEvent;
    windowStart: number;
    windowEnd: number;
    watermarkBefore: number | null;
    watermarkAfter: number;
    maxObservedEventTime: number;
    disposition: 'before-window-end' | 'late-accepted' | 'side-output';
    emissions: Emission[];
    cleanedWindows: number[];
    activeWindowCount: number;
  }[] = [];
  let watermark = -Infinity;
  let maxObservedEventTime = -Infinity;

  function emit(window: WindowState): void {
    window.revision++;
    emissions.push({
      windowStart: window.start, windowEnd: window.end, revision: window.revision,
      count: window.count, sum: window.sum, kind: window.revision === 1 ? 'initial' : 'update', watermark,
    });
  }
  function advanceWatermark(next: number): number[] {
    watermark = Math.max(watermark, next);
    const cleaned: number[] = [];
    for (const window of active.values()) {
      if (watermark >= window.end && window.revision === 0) emit(window);
      if (watermark >= window.end + allowedLateness) {
        completed.push({ ...window, cleanedAt: watermark });
        active.delete(window.start);
        cleaned.push(window.start);
      }
    }
    return cleaned;
  }

  for (const event of events) {
    const start = Math.floor(event.eventTime / 10) * 10;
    const end = start + 10;
    const watermarkBefore = Number.isFinite(watermark) ? watermark : null;
    const emissionOffset = emissions.length;
    let disposition: 'before-window-end' | 'late-accepted' | 'side-output';
    // Process the record against the prior watermark, then publish progress from this record.
    if (watermark >= end + allowedLateness) {
      disposition = 'side-output';
      sideOutput.push({ ...event, windowStart: start, windowEnd: end, watermark });
    } else {
      // This describes the window firing boundary, not whether the event itself trails progress.
      disposition = watermark >= end ? 'late-accepted' : 'before-window-end';
      const window = active.get(start) ?? { start, end, count: 0, sum: 0, revision: 0 };
      window.count++;
      window.sum += event.value;
      active.set(start, window);
      // Results are replacement upserts keyed by window, never additive partial totals.
      if (watermark >= end) emit(window);
    }
    maxObservedEventTime = Math.max(maxObservedEventTime, event.eventTime);
    const cleanedWindows = advanceWatermark(maxObservedEventTime - watermarkLag);
    timeline.push({
      event: { ...event }, windowStart: start, windowEnd: end, watermarkBefore,
      watermarkAfter: watermark, maxObservedEventTime, disposition,
      emissions: emissions.slice(emissionOffset), cleanedWindows, activeWindowCount: active.size,
    });
  }

  const watermarkBeforeDrain = watermark;
  const emissionOffset = emissions.length;
  // Explicit end-of-input signal: enough progress to fire and expire every possible window.
  const cleanedWindows = advanceWatermark((Math.floor(maxObservedEventTime / 10) + 1) * 10 + allowedLateness);
  const drain = { watermarkBefore: watermarkBeforeDrain, watermarkAfter: watermark, emissions: emissions.slice(emissionOffset), cleanedWindows };
  const windows = completed.sort((a, b) => a.start - b.start);
  const acceptedCount = windows.reduce((total, window) => total + window.count, 0);
  const acceptedValue = windows.reduce((total, window) => total + window.sum, 0);
  const lateCount = sideOutput.length;
  const totalValue = events.reduce((total, event) => total + event.value, 0);
  const lateValue = sideOutput.reduce((total, event) => total + event.value, 0);
  const updateCount = emissions.filter(emission => emission.kind === 'update').length;
  const conservation = {
    inputCount: events.length, accountedCount: acceptedCount + lateCount,
    inputValue: totalValue, accountedValue: acceptedValue + lateValue,
    countsMatch: acceptedCount + lateCount === events.length,
    valuesMatch: acceptedValue + lateValue === totalValue,
  };

  return {
    model: 'Deterministic single-input event-time model, not Kafka or Flink. Seconds; windows [start,end). Admit against the prior watermark, then advance max observed event time minus lag. Emit at watermark >= end; expire at watermark >= end + allowed lateness. Final drain signals end of input.',
    summary: `${acceptedCount} events contribute to final window results; ${lateCount} arrive after state expiry. ${updateCount} late firings replace earlier results instead of being added again.`,
    metrics: [
      { label: 'Accepted events', value: acceptedCount, hint: `Of ${events.length} out-of-order arrivals; lag ${watermarkLag}s` },
      { label: 'Late updates', value: updateCount, hint: `Window state remains available for ${allowedLateness}s after its end` },
      { label: 'Side output', value: lateCount, hint: 'Expired-window arrivals remain visible for separate correction' },
    ],
    steps: [
      { title: 'Use event time', detail: 'Twenty arrivals belong to 10-second tumbling windows. Arrival order differs from timestamp order, including events exactly at window boundaries.', state: 'ok' },
      { title: 'Advance a monotonic watermark', detail: `After each event, advance to max observed event time minus ${watermarkLag}s. An older arrival never moves the watermark backward.`, state: 'ok' },
      { title: 'Emit and revise results', detail: `${updateCount} replacement updates are emitted while window state remains available. Downstream consumers upsert by window and revision.`, state: updateCount ? 'warning' : 'ok' },
      { title: 'Expire window state', detail: `${lateCount} events reach an expired window and go to side output. At the exact end + ${allowedLateness}s boundary, state is already expired.`, state: lateCount ? 'warning' : 'ok' },
      { title: 'Drain and reconcile', detail: `End of input emits remaining windows and clears all active state. ${acceptedCount} accepted + ${lateCount} late = ${events.length} events; aggregate ${acceptedValue} + late value ${lateValue} = ${totalValue}.`, state: 'ok' },
    ],
    watermarkLag, allowedLateness, events, timeline, emissions, sideOutput, windows, drain,
    acceptedCount, lateCount, totalValue, acceptedValue, lateValue, updateCount,
    finalWatermark: watermark, activeWindowCount: active.size, conservation,
  } satisfies LabResult & Record<string, unknown>;
}
