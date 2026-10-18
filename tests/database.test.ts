import { describe, it, expect } from 'vitest';
import { AcidSimulator } from '../src/02-api-security-db/rdbms-acid/acid-transactions.js';
import { LockingBenchmark } from '../src/02-api-security-db/rdbms-acid/locking-strategies.js';
import { analyzeExecutionPlan, calculateOptimalConnectionPool } from '../src/02-api-security-db/db-tuning/index-tuning.js';
import { RedisEngineSimulator, InvertedIndexSearchEngine } from '../src/02-api-security-db/polyglot-storage/polyglot-manager.js';
import { runNPlusOneBenchmark } from '../src/02-api-security-db/graphql-grpc/graphql-engine.js';
import { OrderDatabase } from '../src/02-api-security-db/rest-standards/rest-controller.js';

describe('Pillar 2: Databases, Query Optimization & Polyglot Persistence', () => {
  describe('ACID Transactions & Rollback', () => {
    it('Commits atomic transfer when no errors occur', async () => {
      const acid = new AcidSimulator();
      const res = await acid.executeAtomicTransfer('acc_alice', 'acc_bob', 200);
      expect(res.success).toBe(true);
      expect(res.rolledBack).toBe(false);
      expect(acid.getAccount('acc_alice')?.balance).toBe(800);
      expect(acid.getAccount('acc_bob')?.balance).toBe(700);
    });

    it('Atomically rolls back state when a crash or failure occurs during transfer', async () => {
      const acid = new AcidSimulator();
      const res = await acid.executeAtomicTransfer('acc_alice', 'acc_bob', 200, 1);
      expect(res.success).toBe(false);
      expect(res.rolledBack).toBe(true);
      // Alice balance must NOT be debited
      expect(acid.getAccount('acc_alice')?.balance).toBe(1000);
      expect(acid.getAccount('acc_bob')?.balance).toBe(500);
    });
  });

  describe('Concurrency & Locking Strategies', () => {
    it('No Locking produces Lost Updates anomaly under concurrency', async () => {
      const result = await LockingBenchmark.runNoLock(1000, 10, 20);
      // In concurrent environment without locks, race condition causes lost updates
      expect(result.anomalyDetected).toBe(true);
      expect(result.dataLostAmount).toBeGreaterThan(0);
    });

    it('Pessimistic Locking preserves exact balance with 0 data loss', async () => {
      const result = await LockingBenchmark.runPessimisticLock(1000, 10, 20);
      expect(result.anomalyDetected).toBe(false);
      expect(result.dataLostAmount).toBe(0);
      expect(result.actualFinalBalance).toBe(800);
    });

    it('Optimistic Locking preserves exact balance via version check-and-set', async () => {
      const result = await LockingBenchmark.runOptimisticLock(1000, 10, 20);
      expect(result.anomalyDetected).toBe(false);
      expect(result.dataLostAmount).toBe(0);
      expect(result.actualFinalBalance).toBe(800);
    });
  });

  describe('Database Tuning & Performance', () => {
    it('Execution plan analyzer differentiates Seq Scan from Index Scan', () => {
      const seq = analyzeExecutionPlan('SELECT * FROM users WHERE email = ?', false);
      expect(seq.scanType).toBe('Seq Scan');
      expect(seq.recommendation).toContain('Full Sequential Scan');

      const idx = analyzeExecutionPlan('SELECT * FROM users WHERE email = ?', true);
      expect(idx.scanType).toBe('Index Only Scan');
      expect(idx.cacheHitRatioPercent).toBe(100);
    });

    it('Connection pool formula calculates optimal pool based on CPU and storage', () => {
      const ssdPool = calculateOptimalConnectionPool(8, true);
      expect(ssdPool.recommendedPoolSize).toBe(17); // 8 * 2 + 1
      const hddPool = calculateOptimalConnectionPool(8, false);
      expect(hddPool.recommendedPoolSize).toBe(20); // 8 * 2 + 4
    });
  });

  describe('Polyglot Persistence: Redis & Inverted Index', () => {
    it('Redis Redlock acquires and releases distributed locks safely', () => {
      const redis = new RedisEngineSimulator();
      const lock = redis.acquireDistributedLock('order_123');
      expect(lock.acquired).toBe(true);

      // Second client cannot acquire active lock
      const secondTry = redis.acquireDistributedLock('order_123');
      expect(secondTry.acquired).toBe(false);

      // Release lock
      redis.releaseDistributedLock('order_123', lock.lockToken!);
    });

    it('Redis Sorted Set creates real-time leaderboards', () => {
      const redis = new RedisEngineSimulator();
      redis.zadd('leaderboard', 500, 'Alice');
      redis.zadd('leaderboard', 950, 'Bob');
      redis.zadd('leaderboard', 720, 'Charlie');

      const top = redis.zrevrange('leaderboard', 2);
      expect(top[0].member).toBe('Bob');
      expect(top[0].score).toBe(950);
      expect(top[1].member).toBe('Charlie');
    });

    it('Inverted Index performs BM25 full-text keyword search', () => {
      const search = new InvertedIndexSearchEngine();
      search.indexDocument(1, 'Distributed systems and caching strategies');
      search.indexDocument(2, 'PostgreSQL database query optimization and B-Tree indexing');
      search.indexDocument(3, 'Event loop concurrency and worker threads in Node.js');

      const res = search.search('database indexing');
      expect(res.length).toBeGreaterThanOrEqual(1);
      expect(res[0].docId).toBe(2);
    });
  });

  describe('GraphQL DataLoader & REST Pagination', () => {
    it('DataLoader batches N+1 queries into 2 single queries', async () => {
      const benchmark = await runNPlusOneBenchmark();
      expect(benchmark.withDataLoader.queriesFired).toBe(2);
      expect(benchmark.withoutDataLoader.queriesFired).toBeGreaterThan(5);
    });

    it('Cursor pagination provides stable keyset pagination', () => {
      const db = new OrderDatabase();
      const page1 = db.getWithCursorPagination(null, 5);
      expect(page1.data).toHaveLength(5);
      expect(page1.pagination.nextCursor).toBeDefined();

      const page2 = db.getWithCursorPagination(page1.pagination.nextCursor, 5);
      expect(page2.data).toHaveLength(5);
      expect(page2.data[0].id).not.toBe(page1.data[0].id);
    });
  });
});
