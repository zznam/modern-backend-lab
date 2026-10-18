/**
 * Consistent Hashing Ring with Virtual Nodes
 * Demonstrates:
 * 1. Modulo Hashing vs Consistent Hashing
 * 2. Key relocation percentage when adding/removing nodes
 * 3. Uniform distribution via Virtual Nodes (vnodes)
 */
import crypto from 'node:crypto';

export class ConsistentHashRing {
  private ring = new Map<number, string>(); // hash -> physicalNodeId
  private sortedHashes: number[] = [];
  private vnodesPerNode: number;

  constructor(vnodesPerNode = 50) {
    this.vnodesPerNode = vnodesPerNode;
  }

  private hash(key: string): number {
    const hashHex = crypto.createHash('md5').update(key).digest('hex').slice(0, 8);
    return parseInt(hashHex, 16);
  }

  public addNode(nodeId: string): void {
    for (let i = 0; i < this.vnodesPerNode; i++) {
      const vnodeKey = `${nodeId}#vnode_${i}`;
      const h = this.hash(vnodeKey);
      this.ring.set(h, nodeId);
      this.sortedHashes.push(h);
    }
    this.sortedHashes.sort((a, b) => a - b);
  }

  public removeNode(nodeId: string): void {
    for (let i = 0; i < this.vnodesPerNode; i++) {
      const vnodeKey = `${nodeId}#vnode_${i}`;
      const h = this.hash(vnodeKey);
      this.ring.delete(h);
    }
    this.sortedHashes = Array.from(this.ring.keys()).sort((a, b) => a - b);
  }

  public getNode(key: string): string {
    if (this.sortedHashes.length === 0) throw new Error('Hash ring is empty');

    const h = this.hash(key);
    // Binary search for first node with hash >= h
    let low = 0;
    let high = this.sortedHashes.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.sortedHashes[mid] >= h) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    // Wrap around to first element if past end of ring
    const targetHash = low < this.sortedHashes.length ? this.sortedHashes[low] : this.sortedHashes[0];
    return this.ring.get(targetHash)!;
  }

  public getNodeList(): string[] {
    return Array.from(new Set(this.ring.values()));
  }
}

export function compareModuloVsConsistentHashing(keyCount = 1000): {
  moduloRelocationPercent: number;
  consistentHashingRelocationPercent: number;
  explanation: string;
} {
  const keys = Array.from({ length: keyCount }, (_, i) => `cache_key_user_${i * 42}`);

  // 1. Modulo Hashing
  const hashKey = (k: string) => {
    let h = 0;
    for (let i = 0; i < k.length; i++) h = (h << 5) - h + k.charCodeAt(i);
    return Math.abs(h);
  };

  const initialNodes = ['Node-1', 'Node-2', 'Node-3', 'Node-4'];
  const newNodes = ['Node-1', 'Node-2', 'Node-3', 'Node-4', 'Node-5']; // Added 1 node

  let moduloRelocated = 0;
  for (const k of keys) {
    const nodeBefore = initialNodes[hashKey(k) % initialNodes.length];
    const nodeAfter = newNodes[hashKey(k) % newNodes.length];
    if (nodeBefore !== nodeAfter) moduloRelocated++;
  }

  // 2. Consistent Hashing
  const ring = new ConsistentHashRing(60);
  initialNodes.forEach((n) => ring.addNode(n));

  const mappingBefore = new Map<string, string>();
  for (const k of keys) {
    mappingBefore.set(k, ring.getNode(k));
  }

  // Add Node-5 to ring
  ring.addNode('Node-5');

  let consistentRelocated = 0;
  for (const k of keys) {
    const nodeAfter = ring.getNode(k);
    if (mappingBefore.get(k) !== nodeAfter) {
      consistentRelocated++;
    }
  }

  return {
    moduloRelocationPercent: Math.round((moduloRelocated / keyCount) * 100),
    consistentHashingRelocationPercent: Math.round((consistentRelocated / keyCount) * 100),
    explanation:
      'With Modulo Hashing, adding 1 node forced ~80% of all cache keys to reshuffle, causing catastrophic cache misses! With Consistent Hashing, only ~20% (1/N = 1/5) of keys moved, while 80% stayed untouched on their original nodes.',
  };
}
