import { boundedInteger, type LabResult } from './lab-result.js';

/** Fixed two-transaction schedule: disjoint row writes with a shared predicate. */
export function runSnapshotLab(onCallDoctors = 2) {
  boundedInteger(onCallDoctors, 'onCallDoctors', 2, 10);
  function schedule(serializable: boolean) {
    const rows = Array.from({ length: onCallDoctors }, () => ({ onCall: true, version: 0 }));
    const snapshots = [structuredClone(rows), structuredClone(rows)];
    let aborted = 0;
    for (let tx = 0; tx < 2; tx++) {
      const snapshot = snapshots[tx];
      if (snapshot.filter(row => row.onCall).length <= 1) continue;
      // Snapshot isolation checks only the written row. This conservative
      // serializable model validates the whole read set, not PostgreSQL SSI.
      const conflict = serializable
        ? rows.some((row, index) => row.version !== snapshot[index].version)
        : rows[tx].version !== snapshot[tx].version;
      if (conflict) { aborted++; continue; }
      rows[tx] = { onCall: false, version: rows[tx].version + 1 };
    }
    // A fresh-snapshot retry must re-evaluate the business predicate.
    let retried = false;
    if (aborted && rows.filter(row => row.onCall).length > 1) {
      rows[1] = { onCall: false, version: rows[1].version + 1 };
      retried = true;
    }
    const remaining = rows.filter(row => row.onCall).length;
    return { remaining, invariantHolds: remaining >= 1, aborted, retried, rows };
  }
  const snapshotIsolation = schedule(false);
  const serializableValidation = schedule(true);
  return {
    model: 'Deterministic MVCC-style snapshots with optimistic read-set validation; not a PostgreSQL engine or implementation of SSI.',
    summary: snapshotIsolation.invariantHolds ? 'With extra doctors the invariant survives, but disjoint writes still bypass the shared predicate check.' : 'Two stable snapshots can both look safe while their disjoint writes leave nobody on call.',
    metrics: [
      { label: 'Snapshot isolation', value: snapshotIsolation.remaining, hint: 'Doctors still on call after concurrent decisions' },
      { label: 'Serializable model', value: serializableValidation.remaining, hint: 'Read-set conflict triggers a fresh-snapshot retry' },
      { label: 'Aborted transactions', value: serializableValidation.aborted, hint: 'Validation is deliberately conservative' },
    ],
    steps: [
      { title: 'Take two snapshots', detail: `Both transactions see ${onCallDoctors} doctors on call. Each reads the whole set.`, state: 'ok' },
      { title: 'Write different rows', detail: 'Each doctor goes off call. There is no same-row write conflict.', state: 'warning' },
      { title: 'Check the invariant', detail: `Snapshot isolation leaves ${snapshotIsolation.remaining} on call. At least one is required.`, state: snapshotIsolation.invariantHolds ? 'ok' : 'blocked' },
      { title: 'Validate reads and retry', detail: `The second transaction aborts on a changed read, then rechecks the predicate. ${serializableValidation.remaining} remain.`, state: 'ok' },
    ], snapshotIsolation, serializableValidation,
  } satisfies LabResult & Record<string, unknown>;
}
