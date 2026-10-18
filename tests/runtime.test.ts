import { describe, it, expect } from 'vitest';
import { runEventLoopExperiment } from '../src/01-runtime-systems/event-loop/event-loop-demo.js';
import { LRUCache, RingBuffer, MinHeap, BloomFilter, TrieRouter } from '../src/01-runtime-systems/data-structures/data-structures.js';
import { simulateTcp3WayHandshake, simulateTcp4WayTeardown, runRawTcpUdpDemo } from '../src/01-runtime-systems/networking/tcp-udp-server.js';
import { DnsCacheSimulator } from '../src/01-runtime-systems/networking/dns-resolver.js';
import { simulateECDHEKeyExchange } from '../src/01-runtime-systems/networking/tls-handshake.js';
import { LoadBalancer } from '../src/01-runtime-systems/networking/proxy-load-balancer.js';
import { parsePosixMode, calculateUmask, AdvisoryFileLockManager } from '../src/01-runtime-systems/os-fundamentals/posix-filesystem.js';
import { getConcurrencyModelMatrix, getIoMultiplexingEvolution } from '../src/01-runtime-systems/os-fundamentals/process-vs-thread.js';

describe('Pillar 1: Runtime, Networking & OS Fundamentals', () => {
  it('Event Loop phases execute in deterministic order', async () => {
    const { trace } = await runEventLoopExperiment();
    expect(trace.length).toBeGreaterThanOrEqual(4);
    expect(trace[0].phase).toBe('Call Stack');
    const microtask = trace.find((t) => t.type === 'microtask');
    expect(microtask).toBeDefined();
  });

  describe('Practical Data Structures', () => {
    it('LRU Cache evicts least recently used items on capacity overflow', () => {
      const lru = new LRUCache<string, number>(2);
      lru.put('a', 1);
      lru.put('b', 2);
      expect(lru.get('a')).toBe(1); // 'a' accessed, so 'b' is oldest
      lru.put('c', 3); // 'b' evicted
      expect(lru.get('b')).toBeUndefined();
      expect(lru.get('a')).toBe(1);
      expect(lru.get('c')).toBe(3);
    });

    it('Ring Buffer maintains circular memory without reallocation', () => {
      const rb = new RingBuffer<string>(3);
      rb.enqueue('msg1');
      rb.enqueue('msg2');
      rb.enqueue('msg3');
      expect(rb.isFull()).toBe(true);
      rb.enqueue('msg4'); // Overwrites msg1
      expect(rb.dequeue()).toBe('msg2');
      expect(rb.dequeue()).toBe('msg3');
      expect(rb.dequeue()).toBe('msg4');
    });

    it('Min-Heap pops smallest element first', () => {
      const heap = new MinHeap<number>((a, b) => a - b);
      heap.push(42);
      heap.push(5);
      heap.push(18);
      heap.push(1);
      expect(heap.pop()).toBe(1);
      expect(heap.pop()).toBe(5);
      expect(heap.pop()).toBe(18);
      expect(heap.pop()).toBe(42);
    });

    it('Bloom Filter has zero false negatives for inserted keys', () => {
      const bf = new BloomFilter(100, 0.01);
      bf.add('user_123');
      bf.add('user_456');
      expect(bf.test('user_123')).toBe(true);
      expect(bf.test('user_456')).toBe(true);
      expect(bf.test('user_definitely_not_there_999999')).toBe(false);
    });

    it('Trie prefix tree matches routed URL endpoints', () => {
      const trie = new TrieRouter();
      trie.insert('/api/v1/orders', 'OrderHandler');
      trie.insert('/api/v1/users', 'UserHandler');
      expect(trie.search('/api/v1/orders').found).toBe(true);
      expect(trie.search('/api/v1/orders').handler).toBe('OrderHandler');
      expect(trie.search('/api/v1/unknown').found).toBe(false);
    });
  });

  describe('Networking & Protocols', () => {
    it('Simulates TCP 3-way handshake and 4-way teardown sequences', () => {
      const handshake = simulateTcp3WayHandshake();
      expect(handshake).toHaveLength(3);
      expect(handshake[0].packet).toBe('SYN');
      expect(handshake[1].packet).toBe('SYN-ACK');
      expect(handshake[2].packet).toBe('ACK');

      const teardown = simulateTcp4WayTeardown();
      expect(teardown).toHaveLength(4);
      expect(teardown[3].description).toContain('TIME_WAIT');
    });

    it('Runs live raw TCP and UDP echo communication', async () => {
      const { tcpResult, udpResult } = await runRawTcpUdpDemo();
      expect(tcpResult.received).toBe('TCP_ECHO:PING_TCP');
      expect(udpResult.received).toBe('UDP_ECHO:PING_UDP');
    });

    it('DNS Cache returns cached record on subsequent calls with TTL', () => {
      const dns = new DnsCacheSimulator();
      const first = dns.resolveWithCache('api.domain.internal', 10);
      expect(first.source).toBe('CACHE_MISS');
      const second = dns.resolveWithCache('api.domain.internal', 10);
      expect(second.source).toBe('CACHE_HIT');
      expect(second.ip).toBe(first.ip);
    });

    it('ECDHE produces matching shared symmetric secret', () => {
      const res = simulateECDHEKeyExchange();
      expect(res.secretsMatch).toBe(true);
      expect(res.clientDerivedSecret).toBe(res.serverDerivedSecret);
    });

    it('Load Balancer distributes requests via Round Robin, Least Connections, and IP Hash', () => {
      const nodes = [
        { id: 'node-1', host: '10.0.0.1', port: 4000, weight: 1, activeConnections: 10, healthy: true },
        { id: 'node-2', host: '10.0.0.2', port: 4000, weight: 1, activeConnections: 2, healthy: true },
      ];
      const lb = new LoadBalancer(nodes);

      // Least connections should pick node-2 (2 conns vs 10)
      const least = lb.selectNode('LEAST_CONNECTIONS');
      expect(least.id).toBe('node-2');

      // IP Hash should be sticky
      const hash1 = lb.selectNode('IP_HASH', '192.168.1.50');
      const hash2 = lb.selectNode('IP_HASH', '192.168.1.50');
      expect(hash1.id).toBe(hash2.id);
    });
  });

  describe('OS Fundamentals', () => {
    it('Parses POSIX permission bitmasks and calculates umask correctly', () => {
      const parsed755 = parsePosixMode(0o755);
      expect(parsed755.octal).toBe('755');
      expect(parsed755.symbolic).toBe('rwxr-xr-x');
      expect(parsed755.user.write).toBe(true);
      expect(parsed755.others.write).toBe(false);

      const umaskResult = calculateUmask(0o666, 0o022);
      expect(umaskResult.resultModeOctal).toBe('644');
      expect(umaskResult.symbolicResult).toBe('rw-r--r--');
    });

    it('Advisory file lock manages exclusive vs shared locks', () => {
      const lockMgr = new AdvisoryFileLockManager();
      const file = '/tmp/mastery_test.lock';
      expect(lockMgr.acquireLock(file, 'client-1', 'SHARED')).toBe(true);
      expect(lockMgr.acquireLock(file, 'client-2', 'SHARED')).toBe(true);
      // Exclusive lock should be rejected while shared holders exist
      expect(lockMgr.acquireLock(file, 'client-3', 'EXCLUSIVE')).toBe(false);
      lockMgr.releaseLock(file, 'client-1');
      lockMgr.releaseLock(file, 'client-2');
      expect(lockMgr.acquireLock(file, 'client-3', 'EXCLUSIVE')).toBe(true);
    });

    it('Returns concurrency model matrix and I/O multiplexing evolution', () => {
      const models = getConcurrencyModelMatrix();
      expect(models.length).toBe(4);
      const ioEvolution = getIoMultiplexingEvolution();
      expect(ioEvolution.some((m) => m.mechanism.includes('epoll'))).toBe(true);
      expect(ioEvolution.some((m) => m.mechanism.includes('kqueue'))).toBe(true);
    });
  });
});
