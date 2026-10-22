import { boundedInteger, type LabResult } from './lab-result.js';

/** One sequential writer; failures are known before requests are dispatched. */
export function runReplicationLab(readQuorum = 2, writeQuorum = 2, failedReplicas = 0) {
  boundedInteger(readQuorum, 'readQuorum', 1, 3);
  boundedInteger(writeQuorum, 'writeQuorum', 1, 3);
  boundedInteger(failedReplicas, 'failedReplicas', 0, 2);
  const replicas = Array.from({ length: 3 }, (_, index) => ({
    id: `replica-${index + 1}`, available: index < 3 - failedReplicas, version: 1, value: 100,
  }));
  const reachable = replicas.filter(replica => replica.available);
  const writeAvailable = reachable.length >= writeQuorum;
  // Only W replies have arrived at this point; delivery to other replicas is delayed.
  // A known-unavailable quorum is rejected before dispatch, not rolled back after timeout.
  const acknowledged = writeAvailable ? reachable.slice(0, writeQuorum) : [];
  acknowledged.forEach(replica => { replica.version = 2; replica.value = 150; });
  const replicasBeforeRead = structuredClone(replicas);
  const readAvailable = reachable.length >= readQuorum;
  const responders = readAvailable
    ? [...reachable].sort((a, b) => a.version - b.version || a.id.localeCompare(b.id)).slice(0, readQuorum)
    : [];
  const observed = responders.map(replica => ({ id: replica.id, version: replica.version, value: replica.value }));
  const newest = observed.reduce<(typeof observed)[number] | null>((best, reply) =>
    !best || reply.version > best.version ? reply : best, null);
  const repairedReplicaIds: string[] = [];
  if (newest) {
    for (const replica of responders) {
      if (replica.version < newest.version) {
        replica.version = newest.version;
        replica.value = newest.value;
        repairedReplicaIds.push(replica.id);
      }
    }
  }
  const latestAcknowledgedVersion = writeAvailable ? 2 : 1;
  const stale = newest ? newest.version < latestAcknowledgedVersion : null;
  const quorumIntersectionGuaranteed = readQuorum + writeQuorum > 3;
  const actualOverlap = observed.filter(reply => acknowledged.some(replica => replica.id === reply.id)).map(reply => reply.id);
  return {
    model: 'Three fixed in-memory replicas, one sequential versioned writer, known failures, delayed delivery, and a read after the write attempt. No concurrent writes, timeouts with partial writes, sloppy quorums, durability, or linearizability proof.',
    summary: !readAvailable ? 'Too few reachable replicas to satisfy the configured read quorum.'
      : stale ? 'A stale-first read misses the acknowledged write. Repair cannot discover a version absent from every reply.'
      : 'The read selects the newest version among its replies and repairs older responding replicas.',
    metrics: [
      { label: 'Reachable replicas', value: `${reachable.length}/3`, hint: `Write needs ${writeQuorum}; read needs ${readQuorum}` },
      { label: 'Read version', value: newest ? newest.version : 'Unavailable', hint: `Latest acknowledged version: ${latestAcknowledgedVersion}` },
      { label: 'Replicas repaired', value: repairedReplicaIds.length, hint: 'Only responding replicas can be repaired by this read' },
    ],
    steps: [
      { title: 'Start at version 1', detail: `All three replicas store 100; ${failedReplicas} become unavailable before either operation.`, state: 'ok' },
      { title: 'Attempt version 2', detail: writeAvailable ? `${writeQuorum} replicas acknowledge 150; delivery to all others is delayed.` : `Only ${reachable.length} replicas are reachable. The write is rejected before dispatch, so version 1 remains authoritative.`, state: writeAvailable ? 'ok' : 'blocked' },
      { title: 'Check quorum intersection', detail: `R + W = ${readQuorum + writeQuorum}; ${quorumIntersectionGuaranteed ? 'every read set and write set of these sizes must overlap' : 'disjoint read and write sets are possible in the full three-replica cluster'}. Availability still requires enough reachable replicas.`, state: quorumIntersectionGuaranteed ? 'ok' : 'warning' },
      { title: 'Read stale replicas first', detail: newest ? `${observed.map(reply => `${reply.id}:v${reply.version}`).join(', ')} return; the newest reply is v${newest.version}${stale ? ', older than the acknowledged write' : ''}.` : `${readQuorum} responses are required; only ${reachable.length} replicas are reachable. No value is returned.`, state: !readAvailable ? 'blocked' : stale ? 'warning' : 'ok' },
      { title: 'Repair responding replicas', detail: newest ? `${repairedReplicaIds.length} responders advance to v${newest.version}. Unread and unavailable replicas remain untouched; an all-stale response set cannot repair itself to an unseen version.` : 'Read repair waits for a successful read.', state: !readAvailable || stale ? 'warning' : 'ok' },
    ],
    configuration: { replicaCount: 3, readQuorum, writeQuorum, failedReplicas },
    quorumIntersectionGuaranteed, actualOverlap, latestAcknowledgedVersion,
    write: { available: writeAvailable, acknowledged: writeAvailable, replicaIds: acknowledged.map(replica => replica.id), version: writeAvailable ? 2 : null },
    read: { available: readAvailable, observed, returnedVersion: newest?.version ?? null, returnedValue: newest?.value ?? null, stale, repairedReplicaIds },
    replicasBeforeRead, replicasAfterRead: structuredClone(replicas),
  } satisfies LabResult & Record<string, unknown>;
}
