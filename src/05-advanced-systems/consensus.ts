import { boundedInteger, type LabResult } from './lab-result.js';

/** A fixed-membership, scripted quorum model, NOT a complete Raft implementation. */
export function runConsensusLab(clusterSize = 5, availableNodes = Math.min(3, clusterSize - 1)) {
  boundedInteger(clusterSize, 'clusterSize', 3, 9);
  if (clusterSize % 2 === 0) throw new RangeError('clusterSize must be odd');
  boundedInteger(availableNodes, 'availableNodes', 1, clusterSize - 1);
  const quorum = Math.floor(clusterSize / 2) + 1;
  const nodes = Array.from({ length: clusterSize }, (_, id) => ({
    id: `node-${id}`, term: 1, votedFor: null as string | null,
    log: [{ index: 1, term: 1, command: 'balance=100' }], commitIndex: 1,
  }));
  // The previous leader is isolated. Other nonparticipants are unavailable.
  nodes[0].log.push({ index: 2, term: 1, command: 'balance=0 (stale)' });
  const candidate = nodes[1];
  const voters = nodes.slice(1, availableNodes + 1);
  for (const voter of voters) {
    voter.term = 2;
    voter.votedFor = candidate.id;
  }
  const elected = voters.length >= quorum;
  if (elected) {
    // Every participant starts with the same committed prefix in this scenario.
    for (const voter of voters) {
      voter.log.push({ index: 2, term: 2, command: 'balance=150' });
      voter.commitIndex = 2;
    }
  }
  const partitioned = structuredClone(nodes);
  if (elected) {
    // Healing: the winning leader repairs conflicting/unavailable replicas.
    for (const node of nodes) {
      node.term = 2;
      node.log = structuredClone(candidate.log);
      node.commitIndex = candidate.commitIndex;
    }
  }
  const steps: LabResult['steps'] = [
    { title: 'Committed prefix', detail: `All ${clusterSize} replicas begin at index 1, term 1.`, state: 'ok' },
    { title: 'Old leader becomes isolated', detail: `Its stale append has 1 acknowledgement; ${quorum} are required. It cannot commit.`, state: 'blocked' },
    { title: 'Term 2 election', detail: `${voters.length} distinct votes for ${candidate.id}; ${elected ? 'a majority elects the candidate' : 'no majority, so no leader or new commit'}.`, state: elected ? 'ok' : 'blocked' },
    { title: elected ? 'Replicate and heal' : 'Wait for quorum', detail: elected ? 'A current-term entry reaches a majority. On healing, the conflicting uncommitted suffix is replaced.' : 'Committed state stays at index 1. Recovery is not simulated without a winning leader.', state: elected ? 'ok' : 'warning' },
  ];
  return {
    model: 'Scripted quorum / Raft-inspired log replication; no timers, durable storage, arbitrary failures, or membership changes.',
    summary: elected ? 'The majority commits a new value; the isolated old leader cannot overwrite it.' : 'Without a majority, the cluster sacrifices write availability to preserve safety.',
    metrics: [
      { label: 'Quorum required', value: quorum, hint: `Fixed cluster of ${clusterSize} nodes` },
      { label: 'Election votes', value: voters.length, hint: elected ? 'Majority reached' : 'Insufficient votes' },
      { label: 'Committed index', value: candidate.commitIndex, hint: 'Unacknowledged writes are not committed' },
    ], steps, elected, quorum, staleLeaderCommitted: false, partitioned, healed: elected ? nodes : null,
  } satisfies LabResult & Record<string, unknown>;
}
