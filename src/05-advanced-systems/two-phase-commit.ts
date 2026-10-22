import { boundedInteger, type LabResult } from './lab-result.js';

type Decision = 'commit' | 'abort';
interface Participant {
  id: string;
  vote: 'yes' | 'no';
  state: 'prepared' | 'committed' | 'aborted';
  durablePrepare: boolean;
  locked: boolean;
  appliedCommits: number;
  journal: ('prepare' | Decision)[];
}

/** A single coordinator with intact stable storage; no heuristic participant decisions. */
export function runTwoPhaseCommitLab(crashPoint = 1, rejectVote = 0) {
  boundedInteger(crashPoint, 'crashPoint', 0, 2);
  boundedInteger(rejectVote, 'rejectVote', 0, 1);

  const participants: Participant[] = ['inventory', 'payment', 'shipping'].map((id, index) => {
    const rejects = rejectVote === 1 && index === 2;
    return {
      id, vote: rejects ? 'no' : 'yes', state: rejects ? 'aborted' : 'prepared',
      durablePrepare: !rejects, locked: !rejects, appliedCommits: 0,
      // A YES vote is sent only after durable prepare. A NO voter can abort locally.
      journal: rejects ? ['abort'] : ['prepare'],
    };
  });
  const coordinatorJournal: { decision: Decision; durable: true }[] = [];
  let coordinatorOnline = true;
  const durableDecision = (): Decision | null => coordinatorJournal[0]?.decision ?? null;
  const snapshot = () => ({
    coordinatorOnline,
    durableDecision: durableDecision(),
    participants: structuredClone(participants),
    heldLocks: participants.filter(participant => participant.locked).length,
    inDoubtParticipants: participants.filter(participant => participant.state === 'prepared').length,
  });
  const prepared = snapshot();
  const voteDecision: Decision = participants.every(participant => participant.vote === 'yes') ? 'commit' : 'abort';

  // At crash point 1 no decision was forced or delivered, even if all votes were YES.
  if (crashPoint !== 1) coordinatorJournal.push({ decision: voteDecision, durable: true });
  if (crashPoint !== 0) coordinatorOnline = false;
  const blocked = coordinatorOnline ? null : snapshot();
  // Simulated time passes with no coordinator response: prepared participants retain locks.
  const afterTimeout = blocked ? snapshot() : null;

  coordinatorOnline = true;
  // Presumed abort is a coordinator recovery rule, never a participant timeout rule.
  // It is safe here because notification always follows a durable decision and storage survives.
  const finalDecision = durableDecision() ?? 'abort';
  if (!durableDecision()) coordinatorJournal.push({ decision: finalDecision, durable: true });

  function deliverDecision(): number {
    let applications = 0;
    for (const participant of participants) {
      const targetState = finalDecision === 'commit' ? 'committed' : 'aborted';
      if (participant.state === targetState) continue;
      if (participant.state !== 'prepared') throw new Error('Conflicting transaction decision');
      participant.journal.push(finalDecision);
      participant.state = targetState;
      participant.locked = false;
      if (finalDecision === 'commit') participant.appliedCommits++;
      applications++;
    }
    return applications;
  }

  const recoveryApplications = deliverDecision();
  const recovered = snapshot();
  const duplicateApplications = deliverDecision();
  const replayed = snapshot();
  const atomicOutcome = participants.every(participant => participant.state === (finalDecision === 'commit' ? 'committed' : 'aborted'));
  const locksReleased = participants.every(participant => !participant.locked);

  return {
    model: 'Deterministic two-phase commit with three participants and simulated durable journals. The same coordinator recovers with intact storage; no real databases, disk I/O, heuristic outcomes, or replicated consensus.',
    summary: crashPoint === 1
      ? 'Prepared participants block during coordinator failure. With no durable decision, coordinator recovery safely chooses abort.'
      : crashPoint === 2
        ? `A durable ${finalDecision} decision survives the coordinator crash and is replayed to every participant.`
        : `The coordinator records ${finalDecision} before notifying participants; every resource reaches the same outcome.`,
    metrics: [
      { label: 'Locks while down', value: blocked?.heldLocks ?? 0, hint: 'Prepared resources stay locked until the coordinator returns' },
      { label: 'Final decision', value: finalDecision.toUpperCase(), hint: rejectVote ? 'Shipping voted NO, so commit is impossible' : 'YES votes alone are not a durable commit decision' },
      { label: 'Duplicate effects', value: duplicateApplications, hint: 'Replaying the same decision makes no additional changes' },
    ],
    steps: [
      { title: 'Prepare before voting', detail: `${prepared.inDoubtParticipants} participants durably prepare and hold locks.${rejectVote ? ' Shipping rejects and aborts locally.' : ' All three vote YES.'}`, state: rejectVote ? 'warning' : 'ok' },
      { title: crashPoint ? 'Lose the coordinator' : 'Record the outcome', detail: crashPoint === 1 ? 'The crash happens before a durable decision. Prepared participants cannot infer commit from their own YES vote.' : `The ${voteDecision.toUpperCase()} record is durable before any notification.${crashPoint === 2 ? ' The coordinator then crashes.' : ''}`, state: crashPoint ? 'warning' : 'ok' },
      { title: 'Observe blocked resources', detail: blocked ? `${blocked.heldLocks} locks remain held during the outage and after a timeout. Participants make no unilateral decision.` : 'The coordinator remains available and sends the recorded decision immediately.', state: blocked?.heldLocks ? 'blocked' : 'ok' },
      { title: 'Resolve every participant', detail: `${crashPoint === 1 ? 'Recovery finds no durable decision and presumes ABORT.' : `The durable ${finalDecision.toUpperCase()} decision is delivered.`} All participants finish ${finalDecision === 'commit' ? 'committed' : 'aborted'} and release their locks.`, state: 'ok' },
      { title: 'Replay the decision', detail: `${duplicateApplications} additional state changes or commit effects occur on duplicate delivery. Acknowledgement loss does not require repeating the transaction.`, state: 'ok' },
    ],
    crashPoint, rejectVote, prepared, blocked, afterTimeout, coordinatorJournal,
    finalDecision, recovered, replayed, recoveryApplications, duplicateApplications, atomicOutcome, locksReleased,
  } satisfies LabResult & Record<string, unknown>;
}
