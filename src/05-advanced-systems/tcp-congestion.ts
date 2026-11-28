import { boundedInteger, type LabResult } from './lab-result.js';

const ROUNDS = 20;
const INITIAL_SSTHRESH = 32;

type Phase = 'slow-start' | 'congestion-avoidance' | 'loss';

/**
 * TCP Reno-style congestion window, one value per round trip, in segments. A single loss is
 * injected at `lossRound`; `lossType` 0 is three duplicate ACKs (fast retransmit and recovery),
 * 1 is a retransmission timeout.
 */
export function runTcpCongestionLab(lossRound = 8, lossType = 0) {
  boundedInteger(lossRound, 'lossRound', 0, ROUNDS);
  boundedInteger(lossType, 'lossType', 0, 1);
  let cwnd = 1;
  let ssthresh = INITIAL_SSTHRESH;
  let delivered = 0;
  let peak = 1;
  let afterLoss: number | null = null;
  const trace: { round: number; cwnd: number; ssthresh: number; phase: Phase }[] = [];

  for (let round = 1; round <= ROUNDS; round++) {
    if (round === lossRound) {
      // The window in flight is cut: halve the threshold, then either recover at it or restart.
      ssthresh = Math.max(Math.floor(cwnd / 2), 2);
      cwnd = lossType === 0 ? ssthresh : 1;
      afterLoss = cwnd;
      trace.push({ round, cwnd, ssthresh, phase: 'loss' });
      delivered += cwnd;
      continue;
    }
    const phase: Phase = cwnd < ssthresh ? 'slow-start' : 'congestion-avoidance';
    trace.push({ round, cwnd, ssthresh, phase });
    delivered += cwnd;
    peak = Math.max(peak, cwnd);
    cwnd = phase === 'slow-start' ? Math.min(cwnd * 2, Math.max(ssthresh, cwnd + 1)) : cwnd + 1;
  }

  const lost = lossRound > 0;
  const recovery = lossType === 0 ? 'fast recovery' : 'timeout';
  const firstAvoidance = trace.find((t) => t.phase === 'congestion-avoidance')?.round ?? null;
  return {
    model: `One Reno-style sender over ${ROUNDS} equal round trips, window counted in whole segments, initial ssthresh ${INITIAL_SSTHRESH}, at most one injected loss. No receiver window, pacing, SACK, CUBIC/BBR, delayed ACKs, or real network measurements.`,
    summary: !lost
      ? `Without loss, slow start doubles the window up to ssthresh ${INITIAL_SSTHRESH}, then congestion avoidance grows it by one segment per round trip.`
      : lossType === 0
        ? `Three duplicate ACKs at round ${lossRound} halve the threshold to ${ssthresh}; fast recovery resumes at that window instead of starting over.`
        : `A timeout at round ${lossRound} halves the threshold to ${ssthresh} and restarts from one segment, so slow start must rebuild the window.`,
    metrics: [
      { label: 'Segments delivered', value: delivered, hint: `Across ${ROUNDS} round trips` },
      { label: 'Peak window', value: `${peak} seg`, hint: firstAvoidance ? `Linear growth from round ${firstAvoidance}` : 'Still in slow start' },
      { label: 'Window after loss', value: afterLoss === null ? 'No loss' : `${afterLoss} seg`, hint: lost ? `ssthresh ${ssthresh} after ${recovery}` : 'Set a loss round to compare recovery' },
    ],
    steps: [
      { title: 'Slow start', detail: `The window starts at 1 segment and doubles each round trip while below ssthresh ${INITIAL_SSTHRESH}.`, state: 'ok' },
      { title: 'Congestion avoidance', detail: firstAvoidance ? `From round ${firstAvoidance} the window grows by one segment per round trip (additive increase).` : 'The window never reaches ssthresh in this run.', state: 'ok' },
      { title: 'Detect loss', detail: lost ? (lossType === 0 ? `Three duplicate ACKs at round ${lossRound} signal one missing segment while later ones still arrive.` : `No ACK arrives before the retransmission timer expires at round ${lossRound}.`) : 'No loss is injected.', state: lost ? 'warning' : 'ok' },
      { title: 'Multiplicative decrease', detail: lost ? `ssthresh becomes half the window in flight (${ssthresh}). ${lossType === 0 ? `Fast recovery continues at ${ssthresh} segments.` : 'The window collapses to 1 segment.'}` : 'Nothing to halve.', state: lost ? (lossType === 0 ? 'ok' : 'blocked') : 'ok' },
      { title: 'Recover throughput', detail: lost ? `After the loss, ${trace.filter((t) => t.round > lossRound).map((t) => t.cwnd).join(' → ') || 'the run ends'} segments per round trip.` : `Final window ${trace.at(-1)?.cwnd} segments.`, state: 'ok' },
    ],
    configuration: { rounds: ROUNDS, initialSsthresh: INITIAL_SSTHRESH, lossRound, lossType },
    trace, delivered, peak, afterLoss, finalSsthresh: ssthresh,
  } satisfies LabResult & Record<string, unknown>;
}
