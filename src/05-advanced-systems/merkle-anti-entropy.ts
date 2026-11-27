import { createHash } from 'node:crypto';
import { boundedInteger, type LabResult } from './lab-result.js';

const KEY_COUNT = 32;
/** Spread so small divergence counts land in different leaves at every tree depth. */
const DIVERGENT_ORDER = [3, 17, 26, 9, 30, 12, 21, 6];

type Entry = { key: string; version: number };

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const short = (hash: string) => hash.slice(0, 8);

function leafOf(index: number, leafCount: number) {
  return Math.floor((index * leafCount) / KEY_COUNT);
}

/** Leaves hash their sorted key:version pairs; parents hash the concatenation of their children. */
function buildTree(entries: Entry[], leafCount: number): string[][] {
  const leaves = Array.from({ length: leafCount }, (_, leaf) =>
    sha(entries.filter((_, index) => leafOf(index, leafCount) === leaf).map(e => `${e.key}:${e.version}`).join('|')));
  const levels = [leaves];
  while (levels[0].length > 1) {
    const below = levels[0];
    levels.unshift(Array.from({ length: below.length / 2 }, (_, i) => sha(below[2 * i] + below[2 * i + 1])));
  }
  return levels;
}

/**
 * Two replicas of 32 keys compare Merkle trees top-down and exchange only the key ranges whose
 * leaf hashes differ, then repair each mismatched key to its higher version.
 */
export function runAntiEntropyLab(divergentKeys = 2, treeDepth = 3) {
  boundedInteger(divergentKeys, 'divergentKeys', 0, DIVERGENT_ORDER.length);
  boundedInteger(treeDepth, 'treeDepth', 1, 4);
  const leafCount = 2 ** treeDepth;
  const keys = Array.from({ length: KEY_COUNT }, (_, i) => `k${String(i).padStart(2, '0')}`);
  const replicaA: Entry[] = keys.map(key => ({ key, version: 1 }));
  const replicaB: Entry[] = keys.map(key => ({ key, version: 1 }));
  // Replica A accepted writes that never reached replica B (a hinted handoff was lost).
  const missed = DIVERGENT_ORDER.slice(0, divergentKeys);
  for (const index of missed) replicaA[index].version = 2;

  const treeA = buildTree(replicaA, leafCount);
  const treeB = buildTree(replicaB, leafCount);

  // Breadth-first descent: only children of mismatched nodes are compared.
  let comparisons = 0;
  let frontier = [0];
  for (let level = 0; level < treeA.length; level++) {
    const mismatched = frontier.filter(node => { comparisons++; return treeA[level][node] !== treeB[level][node]; });
    frontier = level === treeA.length - 1 ? mismatched : mismatched.flatMap(node => [2 * node, 2 * node + 1]);
  }
  const differingLeaves = frontier;

  const exchangedIndexes = keys.map((_, i) => i).filter(i => differingLeaves.includes(leafOf(i, leafCount)));
  const repairedKeys: string[] = [];
  for (const i of exchangedIndexes) {
    if (replicaA[i].version !== replicaB[i].version) {
      const newest = Math.max(replicaA[i].version, replicaB[i].version);
      replicaA[i].version = newest;
      replicaB[i].version = newest;
      repairedKeys.push(keys[i]);
    }
  }
  const converged = sha(JSON.stringify(replicaA)) === sha(JSON.stringify(replicaB));
  const rootsMatch = treeA[0][0] === treeB[0][0];
  const keysPerLeaf = KEY_COUNT / leafCount;

  return {
    model: 'Two in-memory replicas of 32 versioned keys with a static key-to-leaf partition, SHA-256 hashes, and a single synchronous comparison. Higher version wins; no concurrent writes, deletes or tombstones, tree rebuild cost, network transfer sizes, or conflicting siblings.',
    summary: rootsMatch
      ? 'Root hashes match, so one comparison proves the replicas hold identical key versions. No keys are exchanged.'
      : `Descending only into mismatched subtrees isolates ${differingLeaves.length} of ${leafCount} leaves; ${exchangedIndexes.length} of ${KEY_COUNT} keys are exchanged to repair ${repairedKeys.length}.`,
    metrics: [
      { label: 'Hash comparisons', value: comparisons, hint: `Tree has ${2 * leafCount - 1} nodes across ${treeDepth + 1} levels` },
      { label: 'Keys exchanged', value: `${exchangedIndexes.length}/${KEY_COUNT}`, hint: `A full scan compares all ${KEY_COUNT}; each leaf covers ${keysPerLeaf} keys` },
      { label: 'Keys repaired', value: repairedKeys.length, hint: converged ? 'Replicas converged' : 'Replicas still differ' },
    ],
    steps: [
      { title: 'Replicas drift apart', detail: divergentKeys ? `Replica B missed ${divergentKeys} write${divergentKeys === 1 ? '' : 's'} (${missed.map(i => keys[i]).join(', ')} at v2).` : 'Both replicas applied every write.', state: divergentKeys ? 'warning' : 'ok' },
      { title: 'Hash each key range', detail: `Each replica builds a ${leafCount}-leaf tree: leaf i hashes ${keysPerLeaf} keys' key:version pairs; parents hash their two children.`, state: 'ok' },
      { title: 'Compare roots', detail: `A ${short(treeA[0][0])} vs B ${short(treeB[0][0])}: ${rootsMatch ? 'equal, so the comparison stops here' : 'different, so descend into both children'}.`, state: rootsMatch ? 'ok' : 'warning' },
      { title: 'Descend into mismatched subtrees', detail: rootsMatch ? 'Not needed.' : `${comparisons} node comparisons locate differing leaves ${differingLeaves.join(', ')}. Matching subtrees are skipped entirely.`, state: 'ok' },
      { title: 'Exchange and repair key ranges', detail: rootsMatch ? 'Nothing to exchange.' : `Only keys in differing leaves are compared (${exchangedIndexes.length} keys). ${repairedKeys.length} advance to the newer version on replica B; ${exchangedIndexes.length - repairedKeys.length} were already equal but shared a dirty leaf.`, state: converged ? 'ok' : 'blocked' },
    ],
    configuration: { keyCount: KEY_COUNT, divergentKeys, treeDepth, leafCount },
    rootsMatch, comparisons, differingLeaves, converged,
    exchangedKeys: exchangedIndexes.map(i => keys[i]), repairedKeys,
    rootHashes: { before: { a: short(treeA[0][0]), b: short(treeB[0][0]) }, after: short(buildTree(replicaB, leafCount)[0][0]) },
  } satisfies LabResult & Record<string, unknown>;
}
