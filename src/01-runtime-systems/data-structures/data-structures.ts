/**
 * Practical Backend Data Structures
 * 1. LRU Cache (Hash Map + Doubly Linked List - O(1) Get/Put)
 * 2. Ring Buffer (Fixed memory circular buffer for zero-allocation streaming)
 * 3. Min-Heap (Priority Queue for task/timer scheduling)
 * 4. Bloom Filter (Probabilistic set membership with zero false negatives)
 * 5. Trie (Prefix tree for URL routing or autocomplete)
 */
import { createHash } from 'node:crypto';

// ==========================================
// 1. LRU CACHE (Least Recently Used)
// ==========================================
class DoublyLinkedNode<K, V> {
  key: K;
  value: V;
  prev: DoublyLinkedNode<K, V> | null = null;
  next: DoublyLinkedNode<K, V> | null = null;

  constructor(key: K, value: V) {
    this.key = key;
    this.value = value;
  }
}

export class LRUCache<K, V> {
  private capacity: number;
  private map = new Map<K, DoublyLinkedNode<K, V>>();
  private head: DoublyLinkedNode<K, V>;
  private tail: DoublyLinkedNode<K, V>;

  constructor(capacity: number) {
    if (capacity <= 0) throw new Error('Capacity must be > 0');
    this.capacity = capacity;
    this.head = new DoublyLinkedNode(null as any, null as any);
    this.tail = new DoublyLinkedNode(null as any, null as any);
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  private removeNode(node: DoublyLinkedNode<K, V>): void {
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
  }

  private moveToHead(node: DoublyLinkedNode<K, V>): void {
    this.removeNode(node);
    this.addToHead(node);
  }

  private addToHead(node: DoublyLinkedNode<K, V>): void {
    node.prev = this.head;
    node.next = this.head.next;
    if (this.head.next) this.head.next.prev = node;
    this.head.next = node;
  }

  private removeTail(): DoublyLinkedNode<K, V> | null {
    const last = this.tail.prev;
    if (!last || last === this.head) return null;
    this.removeNode(last);
    return last;
  }

  public get(key: K): V | undefined {
    const node = this.map.get(key);
    if (!node) return undefined;
    this.moveToHead(node);
    return node.value;
  }

  public put(key: K, value: V): void {
    const existing = this.map.get(key);
    if (existing) {
      existing.value = value;
      this.moveToHead(existing);
      return;
    }

    const newNode = new DoublyLinkedNode(key, value);
    this.map.set(key, newNode);
    this.addToHead(newNode);

    if (this.map.size > this.capacity) {
      const evicted = this.removeTail();
      if (evicted) this.map.delete(evicted.key);
    }
  }

  public size(): number {
    return this.map.size;
  }

  public toArray(): Array<{ key: K; value: V }> {
    const res: Array<{ key: K; value: V }> = [];
    let cur = this.head.next;
    while (cur && cur !== this.tail) {
      res.push({ key: cur.key, value: cur.value });
      cur = cur.next;
    }
    return res;
  }
}

// ==========================================
// 2. RING BUFFER (Circular Buffer)
// ==========================================
export class RingBuffer<T> {
  private buffer: Array<T | undefined>;
  private capacity: number;
  private head = 0;
  private tail = 0;
  private count = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array<T | undefined>(capacity);
  }

  public enqueue(item: T): boolean {
    if (this.count === this.capacity) {
      // Overwrite oldest item
      this.head = (this.head + 1) % this.capacity;
    } else {
      this.count++;
    }
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    return true;
  }

  public dequeue(): T | undefined {
    if (this.count === 0) return undefined;
    const item = this.buffer[this.head];
    this.buffer[this.head] = undefined;
    this.head = (this.head + 1) % this.capacity;
    this.count--;
    return item;
  }

  public size(): number {
    return this.count;
  }

  public isFull(): boolean {
    return this.count === this.capacity;
  }
}

// ==========================================
// 3. MIN-HEAP (Priority Queue)
// ==========================================
export class MinHeap<T> {
  private heap: T[] = [];
  private compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  public push(val: T): void {
    this.heap.push(val);
    this.siftUp(this.heap.length - 1);
  }

  public pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const min = this.heap[0];
    const end = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = end;
      this.siftDown(0);
    }
    return min;
  }

  public peek(): T | undefined {
    return this.heap[0];
  }

  public size(): number {
    return this.heap.length;
  }

  private siftUp(idx: number): void {
    let cur = idx;
    while (cur > 0) {
      const parent = Math.floor((cur - 1) / 2);
      if (this.compare(this.heap[cur], this.heap[parent]) < 0) {
        [this.heap[cur], this.heap[parent]] = [this.heap[parent], this.heap[cur]];
        cur = parent;
      } else {
        break;
      }
    }
  }

  private siftDown(idx: number): void {
    let cur = idx;
    const len = this.heap.length;
    while (true) {
      let smallest = cur;
      const left = 2 * cur + 1;
      const right = 2 * cur + 2;

      if (left < len && this.compare(this.heap[left], this.heap[smallest]) < 0) {
        smallest = left;
      }
      if (right < len && this.compare(this.heap[right], this.heap[smallest]) < 0) {
        smallest = right;
      }
      if (smallest !== cur) {
        [this.heap[cur], this.heap[smallest]] = [this.heap[smallest], this.heap[cur]];
        cur = smallest;
      } else {
        break;
      }
    }
  }
}

// ==========================================
// 4. BLOOM FILTER
// ==========================================
export class BloomFilter {
  private size: number;
  private hashCount: number;
  private bitArray: Uint8Array;

  constructor(expectedItems: number = 1000, falsePositiveRate: number = 0.01) {
    // Optimal size m = - (n * ln(p)) / (ln(2)^2)
    this.size = Math.ceil(-1 * ((expectedItems * Math.log(falsePositiveRate)) / Math.pow(Math.log(2), 2)));
    // Optimal k = (m / n) * ln(2)
    this.hashCount = Math.round((this.size / expectedItems) * Math.log(2));
    this.bitArray = new Uint8Array(Math.ceil(this.size / 8));
  }

  private getHashes(key: string): number[] {
    const hashes: number[] = [];
    const hash1 = parseInt(createHash('md5').update(key).digest('hex').slice(0, 8), 16);
    const hash2 = parseInt(createHash('sha1').update(key).digest('hex').slice(0, 8), 16);

    for (let i = 0; i < this.hashCount; i++) {
      // Kirsch-Mitzenmacher optimization: gi(x) = h1(x) + i * h2(x)
      const combined = Math.abs((hash1 + i * hash2) % this.size);
      hashes.push(combined);
    }
    return hashes;
  }

  public add(key: string): void {
    const hashes = this.getHashes(key);
    for (const h of hashes) {
      const byteIndex = Math.floor(h / 8);
      const bitIndex = h % 8;
      this.bitArray[byteIndex] |= 1 << bitIndex;
    }
  }

  public test(key: string): boolean {
    const hashes = this.getHashes(key);
    for (const h of hashes) {
      const byteIndex = Math.floor(h / 8);
      const bitIndex = h % 8;
      if ((this.bitArray[byteIndex] & (1 << bitIndex)) === 0) {
        return false; // Definitely not in set
      }
    }
    return true; // Probably in set
  }
}

// ==========================================
// 5. TRIE (Prefix Tree)
// ==========================================
class TrieNode {
  children = new Map<string, TrieNode>();
  isEndOfWord = false;
  handler: any = null;
}

export class TrieRouter {
  private root = new TrieNode();

  public insert(path: string, handler: any): void {
    const segments = path.split('/').filter(Boolean);
    let cur = this.root;
    for (const seg of segments) {
      if (!cur.children.has(seg)) {
        cur.children.set(seg, new TrieNode());
      }
      cur = cur.children.get(seg)!;
    }
    cur.isEndOfWord = true;
    cur.handler = handler;
  }

  public search(path: string): { found: boolean; handler?: any } {
    const segments = path.split('/').filter(Boolean);
    let cur = this.root;
    for (const seg of segments) {
      if (!cur.children.has(seg)) {
        return { found: false };
      }
      cur = cur.children.get(seg)!;
    }
    return { found: cur.isEndOfWord, handler: cur.handler };
  }
}
