import { boundedInteger, type LabResult } from './lab-result.js';

export interface LsmEntry { key: string; value: string | null; version: number }
interface SortedRun { id: number; entries: readonly Readonly<LsmEntry>[] }

/** Versioned record-count capacity; no snapshots, WAL, Bloom filter, or disk I/O. */
export class LsmStore {
  private memtable: LsmEntry[] = [];
  private runs: SortedRun[] = [];
  private nextRunId = 1;
  private version = 0;
  private flushedEntryWrites = 0;
  private compactedEntryWrites = 0;

  constructor(private readonly memtableLimit = 3) {
    boundedInteger(memtableLimit, 'memtableLimit', 2, 6);
  }

  put(key: string, value: string) { this.append(key, value); }
  delete(key: string) { this.append(key, null); }

  private append(key: string, value: string | null) {
    this.memtable.push({ key, value, version: ++this.version });
    if (this.memtable.length >= this.memtableLimit) this.flush();
  }

  private sortedRun(entries: LsmEntry[]): SortedRun {
    entries.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : b.version - a.version);
    return { id: this.nextRunId++, entries: Object.freeze(entries.map(entry => Object.freeze({ ...entry }))) };
  }

  flush() {
    if (!this.memtable.length) return;
    this.flushedEntryWrites += this.memtable.length;
    this.runs.unshift(this.sortedRun(this.memtable));
    this.memtable = [];
  }

  get(key: string) {
    const memory = [...this.memtable].reverse().find(entry => entry.key === key);
    if (memory) return { key, value: memory.value, version: memory.version, tombstone: memory.value === null, runProbes: 0 };
    let runProbes = 0;
    for (const run of this.runs) {
      runProbes++;
      // Runs are ordered newest first; versions inside a key are descending.
      const entry = run.entries.find(candidate => candidate.key === key);
      if (entry) return { key, value: entry.value, version: entry.version, tombstone: entry.value === null, runProbes };
    }
    return { key, value: null, version: null, tombstone: false, runProbes };
  }

  /** Merge a newest prefix, retaining deletions unless every possible older record is covered. */
  compact(runCount = this.runs.length) {
    boundedInteger(runCount, 'runCount', 1, this.runs.length);
    const selected = this.runs.slice(0, runCount);
    const fullCoverage = runCount === this.runs.length && this.memtable.length === 0;
    const newest = new Map<string, LsmEntry>();
    for (const run of selected) {
      for (const entry of run.entries) {
        const previous = newest.get(entry.key);
        if (!previous || entry.version > previous.version) newest.set(entry.key, { ...entry });
      }
    }
    const tombstones = [...newest.values()].filter(entry => entry.value === null).length;
    const output = [...newest.values()].filter(entry => !fullCoverage || entry.value !== null);
    this.compactedEntryWrites += output.length;
    const replacement = output.length ? [this.sortedRun(output)] : [];
    this.runs = [...replacement, ...this.runs.slice(runCount)];
    return {
      inputRuns: selected.map(run => run.id), inputEntries: selected.reduce((sum, run) => sum + run.entries.length, 0),
      outputEntries: output.length, fullCoverage,
      tombstonesRetained: fullCoverage ? 0 : tombstones, tombstonesDropped: fullCoverage ? tombstones : 0,
    };
  }

  snapshot() {
    return {
      memtable: this.memtable.map(entry => ({ ...entry })),
      runs: this.runs.map(run => ({ id: run.id, entries: run.entries.map(entry => ({ ...entry })) })),
      logicalWrites: this.version, flushedEntryWrites: this.flushedEntryWrites, compactedEntryWrites: this.compactedEntryWrites,
    };
  }
}

export function runLsmLab(memtableLimit = 3, compaction = 1) {
  boundedInteger(memtableLimit, 'memtableLimit', 2, 6);
  boundedInteger(compaction, 'compaction', 0, 1);
  const store = new LsmStore(memtableLimit);
  const workload: { key: string; value: string | null }[] = [
    { key: 'account:alice', value: '100' }, { key: 'account:bob', value: '80' },
    { key: 'account:carol', value: '60' }, { key: 'account:alice', value: '130' },
    { key: 'account:dana', value: '40' }, { key: 'account:bob', value: '95' },
    { key: 'account:alice', value: '150' }, { key: 'account:carol', value: null },
    { key: 'account:erin', value: '20' }, { key: 'account:bob', value: null },
    { key: 'account:dana', value: '45' }, { key: 'account:erin', value: '25' },
  ];
  const operations = workload.map((operation, index) => {
    if (operation.value === null) store.delete(operation.key);
    else store.put(operation.key, operation.value);
    const state = store.snapshot();
    return { ...operation, version: index + 1, memtableEntries: state.memtable.length, runCount: state.runs.length };
  });
  // Flush the final partial buffer so before/after reads compare the same stored workload.
  store.flush();
  const keys = ['account:alice', 'account:bob', 'account:carol', 'account:dana', 'account:erin', 'account:missing'];
  const before = { ...store.snapshot(), reads: keys.map(key => store.get(key)) };
  const compactionResult = compaction ? store.compact() : null;
  const after = { ...store.snapshot(), reads: keys.map(key => store.get(key)) };
  const beforeReadProbes = before.reads.reduce((sum, read) => sum + read.runProbes, 0);
  const afterReadProbes = after.reads.reduce((sum, read) => sum + read.runProbes, 0);
  const entryWrites = after.flushedEntryWrites + after.compactedEntryWrites;
  const writeAmplification = entryWrites / after.logicalWrites;
  return {
    model: 'One in-memory LSM teaching store; 12 versioned records, record-count flush threshold, newest-first sorted runs, and optional full compaction. Counts are logical run probes and entry writes, not disk bytes, latency, or RocksDB benchmarks. No WAL, snapshots, Bloom filters, or concurrent writes.',
    summary: compaction ? 'Full compaction removes obsolete versions and covered tombstones, reducing this workload’s run probes at the cost of rewriting live entries.' : 'Without compaction, old versions and deletion markers remain in separate sorted runs; reads still return the newest value.',
    metrics: [
      { label: 'Sorted runs', value: `${before.runs.length} → ${after.runs.length}`, hint: `Flush every ${memtableLimit} versioned records; final partial buffer also flushed` },
      { label: 'Read run probes', value: `${beforeReadProbes} → ${afterReadProbes}`, hint: 'Same six lookups, including two deletions and one missing key' },
      { label: 'Entry write amplification', value: `${writeAmplification.toFixed(2)}×`, hint: `${entryWrites} flushed/compacted entry writes ÷ ${after.logicalWrites} logical writes; WAL excluded` },
    ],
    steps: [
      { title: 'Buffer updates and deletes', detail: 'Append 12 ordered versions across five keys. Bob and Carol end with tombstones; Alice, Dana, and Erin keep their newest values.', state: 'ok' },
      { title: 'Flush immutable sorted runs', detail: `${before.flushedEntryWrites} entries flush into ${before.runs.length} runs. Keys are sorted and duplicate keys retain newest-first versions.`, state: 'ok' },
      { title: 'Read newest versions', detail: `${beforeReadProbes} run probes answer six lookups. A tombstone terminates lookup so an older value cannot reappear.`, state: 'ok' },
      { title: compaction ? 'Compact every run' : 'Keep runs separate', detail: compactionResult ? `Merge ${compactionResult.inputEntries} entries into ${compactionResult.outputEntries} live entries. Drop ${compactionResult.tombstonesDropped} tombstones only because no older unmerged data or snapshots exist.` : 'Compaction is disabled. Tombstones remain necessary to hide earlier values.', state: compaction ? 'ok' : 'warning' },
      { title: 'Compare read and write work', detail: `${afterReadProbes} run probes after the chosen policy; ${after.compactedEntryWrites} additional entry writes from compaction. Returned values stay identical.`, state: 'ok' },
    ],
    configuration: { memtableLimit, compaction: Boolean(compaction) }, operations, before, after, compactionResult,
    counters: { beforeReadProbes, afterReadProbes, logicalWrites: after.logicalWrites, entryWrites, writeAmplification },
  } satisfies LabResult & Record<string, unknown>;
}
