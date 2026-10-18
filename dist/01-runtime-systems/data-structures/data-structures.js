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
class DoublyLinkedNode {
    key;
    value;
    prev = null;
    next = null;
    constructor(key, value) {
        this.key = key;
        this.value = value;
    }
}
export class LRUCache {
    capacity;
    map = new Map();
    head;
    tail;
    constructor(capacity) {
        if (capacity <= 0)
            throw new Error('Capacity must be > 0');
        this.capacity = capacity;
        this.head = new DoublyLinkedNode(null, null);
        this.tail = new DoublyLinkedNode(null, null);
        this.head.next = this.tail;
        this.tail.prev = this.head;
    }
    removeNode(node) {
        if (node.prev)
            node.prev.next = node.next;
        if (node.next)
            node.next.prev = node.prev;
    }
    moveToHead(node) {
        this.removeNode(node);
        this.addToHead(node);
    }
    addToHead(node) {
        node.prev = this.head;
        node.next = this.head.next;
        if (this.head.next)
            this.head.next.prev = node;
        this.head.next = node;
    }
    removeTail() {
        const last = this.tail.prev;
        if (!last || last === this.head)
            return null;
        this.removeNode(last);
        return last;
    }
    get(key) {
        const node = this.map.get(key);
        if (!node)
            return undefined;
        this.moveToHead(node);
        return node.value;
    }
    put(key, value) {
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
            if (evicted)
                this.map.delete(evicted.key);
        }
    }
    size() {
        return this.map.size;
    }
    toArray() {
        const res = [];
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
export class RingBuffer {
    buffer;
    capacity;
    head = 0;
    tail = 0;
    count = 0;
    constructor(capacity) {
        this.capacity = capacity;
        this.buffer = new Array(capacity);
    }
    enqueue(item) {
        if (this.count === this.capacity) {
            // Overwrite oldest item
            this.head = (this.head + 1) % this.capacity;
        }
        else {
            this.count++;
        }
        this.buffer[this.tail] = item;
        this.tail = (this.tail + 1) % this.capacity;
        return true;
    }
    dequeue() {
        if (this.count === 0)
            return undefined;
        const item = this.buffer[this.head];
        this.buffer[this.head] = undefined;
        this.head = (this.head + 1) % this.capacity;
        this.count--;
        return item;
    }
    size() {
        return this.count;
    }
    isFull() {
        return this.count === this.capacity;
    }
}
// ==========================================
// 3. MIN-HEAP (Priority Queue)
// ==========================================
export class MinHeap {
    heap = [];
    compare;
    constructor(compare) {
        this.compare = compare;
    }
    push(val) {
        this.heap.push(val);
        this.siftUp(this.heap.length - 1);
    }
    pop() {
        if (this.heap.length === 0)
            return undefined;
        const min = this.heap[0];
        const end = this.heap.pop();
        if (this.heap.length > 0) {
            this.heap[0] = end;
            this.siftDown(0);
        }
        return min;
    }
    peek() {
        return this.heap[0];
    }
    size() {
        return this.heap.length;
    }
    siftUp(idx) {
        let cur = idx;
        while (cur > 0) {
            const parent = Math.floor((cur - 1) / 2);
            if (this.compare(this.heap[cur], this.heap[parent]) < 0) {
                [this.heap[cur], this.heap[parent]] = [this.heap[parent], this.heap[cur]];
                cur = parent;
            }
            else {
                break;
            }
        }
    }
    siftDown(idx) {
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
            }
            else {
                break;
            }
        }
    }
}
// ==========================================
// 4. BLOOM FILTER
// ==========================================
export class BloomFilter {
    size;
    hashCount;
    bitArray;
    constructor(expectedItems = 1000, falsePositiveRate = 0.01) {
        // Optimal size m = - (n * ln(p)) / (ln(2)^2)
        this.size = Math.ceil(-1 * ((expectedItems * Math.log(falsePositiveRate)) / Math.pow(Math.log(2), 2)));
        // Optimal k = (m / n) * ln(2)
        this.hashCount = Math.round((this.size / expectedItems) * Math.log(2));
        this.bitArray = new Uint8Array(Math.ceil(this.size / 8));
    }
    getHashes(key) {
        const hashes = [];
        const hash1 = parseInt(createHash('md5').update(key).digest('hex').slice(0, 8), 16);
        const hash2 = parseInt(createHash('sha1').update(key).digest('hex').slice(0, 8), 16);
        for (let i = 0; i < this.hashCount; i++) {
            // Kirsch-Mitzenmacher optimization: gi(x) = h1(x) + i * h2(x)
            const combined = Math.abs((hash1 + i * hash2) % this.size);
            hashes.push(combined);
        }
        return hashes;
    }
    add(key) {
        const hashes = this.getHashes(key);
        for (const h of hashes) {
            const byteIndex = Math.floor(h / 8);
            const bitIndex = h % 8;
            this.bitArray[byteIndex] |= 1 << bitIndex;
        }
    }
    test(key) {
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
    children = new Map();
    isEndOfWord = false;
    handler = null;
}
export class TrieRouter {
    root = new TrieNode();
    insert(path, handler) {
        const segments = path.split('/').filter(Boolean);
        let cur = this.root;
        for (const seg of segments) {
            if (!cur.children.has(seg)) {
                cur.children.set(seg, new TrieNode());
            }
            cur = cur.children.get(seg);
        }
        cur.isEndOfWord = true;
        cur.handler = handler;
    }
    search(path) {
        const segments = path.split('/').filter(Boolean);
        let cur = this.root;
        for (const seg of segments) {
            if (!cur.children.has(seg)) {
                return { found: false };
            }
            cur = cur.children.get(seg);
        }
        return { found: cur.isEndOfWord, handler: cur.handler };
    }
}
