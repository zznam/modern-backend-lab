import { afterEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { AuthService } from '../src/02-api-security-db/auth-security/auth-service.js';
import { OrderDatabase } from '../src/02-api-security-db/rest-standards/rest-controller.js';
import { IdempotencyStore } from '../src/02-api-security-db/rest-standards/idempotency.js';
import { AcidSimulator } from '../src/02-api-security-db/rdbms-acid/acid-transactions.js';
import { RedisEngineSimulator, InvertedIndexSearchEngine } from '../src/02-api-security-db/polyglot-storage/polyglot-manager.js';
import { GracefulShutdownCoordinator } from '../src/04-devops-reliability/resilience/graceful-shutdown.js';
import { DistributedTracer } from '../src/04-devops-reliability/observability/tracer.js';
import { runRawTcpUdpDemo } from '../src/01-runtime-systems/networking/tcp-udp-server.js';
import { OwaspSecurityLab } from '../src/02-api-security-db/owasp-security/owasp-lab.js';
import { runInProcessStressBenchmark } from '../src/04-devops-reliability/load-testing/runner.js';
import { CircuitBreaker } from '../src/04-devops-reliability/resilience/circuit-breaker.js';
import { MessageBrokerSimulator } from '../src/03-architecture-distributed/event-driven-broker/message-broker.js';
import { encodeBinaryProtobuf } from '../src/02-api-security-db/graphql-grpc/grpc-service.js';
import { LRUCache, RingBuffer, BloomFilter } from '../src/01-runtime-systems/data-structures/data-structures.js';
import { Money } from '../src/03-architecture-distributed/clean-architecture/clean-architecture.js';
import { PNCounter } from '../src/03-architecture-distributed/distributed-theory/eventual-consistency.js';
import { TokenBucketRateLimiter, SlidingWindowRateLimiter } from '../src/04-devops-reliability/resilience/rate-limiter.js';

afterEach(() => vi.restoreAllMocks());
describe('Correctness regressions', () => {
  it('prevents negative token requests from adding bucket capacity', () => {
    const limiter = new TokenBucketRateLimiter(5, 1);
    expect(() => limiter.allowRequest(-100)).toThrow();
    expect(limiter.allowRequest(5).allowed).toBe(true);
    expect(limiter.allowRequest().allowed).toBe(false);
    expect(() => new SlidingWindowRateLimiter(1000, 0)).toThrow();
  });
  it('does not execute duplicate broker effects while the first handler is in flight', async () => {
    const broker = new MessageBrokerSimulator();
    let resolve!: () => void;
    const consumer = vi.fn(() => new Promise<void>(done => { resolve = done; }));
    broker.subscribe('orders', consumer);
    broker.publish('orders', {}, 'same'); broker.publish('orders', {}, 'same');
    const first = broker.processNext('orders');
    expect(await broker.processNext('orders')).toBeNull();
    resolve(); await first;
    expect((await broker.processNext('orders'))?.action).toBe('SKIPPED_DUPLICATE');
    expect(consumer).toHaveBeenCalledOnce();
  });
  it('admits only one half-open circuit recovery probe', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const breaker = new CircuitBreaker(1, 10, 1);
    breaker.tripOpen(); clock.mockReturnValue(1010);
    let resolve!: (value: string) => void;
    const probe = breaker.execute(() => new Promise<string>(done => { resolve = done; }));
    const secondAction = vi.fn(async () => 'second');
    await expect(breaker.execute(secondAction)).rejects.toThrow('probe');
    expect(secondAction).not.toHaveBeenCalled();
    resolve('recovered'); await probe;
    expect(breaker.getState()).toBe('CLOSED');
  });
  it('does not let a stale closed-state request count as a recovery probe', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const breaker = new CircuitBreaker(1, 10, 1);
    let resolve!: (value: string) => void;
    const old = breaker.execute(() => new Promise<string>(done => { resolve = done; }));
    await expect(breaker.execute(async () => { throw new Error('down'); })).rejects.toThrow();
    clock.mockReturnValue(1010);
    expect(breaker.getState()).toBe('HALF_OPEN');
    resolve('late success'); await old;
    expect(breaker.getState()).toBe('HALF_OPEN');
  });
  it('retains a broker message until a consumer is registered', async () => {
    const broker = new MessageBrokerSimulator();
    broker.publish('orders', { id: 1 });
    await expect(broker.processNext('orders')).rejects.toThrow('consumer');
    const consumer = vi.fn(async () => {});
    broker.subscribe('orders', consumer);
    expect((await broker.processNext('orders'))?.action).toBe('ACK');
    expect(consumer).toHaveBeenCalledOnce();
  });
  it('scopes consumer deduplication to each topic', async () => {
    const broker = new MessageBrokerSimulator();
    for (const topic of ['orders', 'billing']) {
      broker.publish(topic, {}, 'same-id'); broker.subscribe(topic, async () => {});
      expect((await broker.processNext(topic))?.action).toBe('ACK');
    }
  });
  it('encodes UTF-8 protobuf string lengths with multibyte varints', () => {
    const transactionId = 'é'.repeat(100);
    const buffer = encodeBinaryProtobuf({ transactionId, customerId: 'c', amount: 5, currency: 'USD' });
    expect([...buffer.subarray(0, 3)]).toEqual([0x0a, 0xc8, 0x01]);
    expect(buffer.subarray(3, 203).toString('utf8')).toBe(transactionId);
  });
  it.each([0, -1, NaN, 1.5])('rejects invalid structure capacity %s', capacity => {
    expect(() => new RingBuffer(capacity)).toThrow();
    expect(() => new LRUCache(capacity)).toThrow();
  });
  it('rejects invalid Bloom filter and monetary parameters', () => {
    expect(() => new BloomFilter(0)).toThrow();
    expect(() => new BloomFilter(1, 1)).toThrow();
    expect(() => new Money(NaN)).toThrow();
    expect(() => new Money(Infinity)).toThrow();
  });
  it('preserves monotonic PN-counter components by rejecting negative increments', () => {
    const counter = new PNCounter('a');
    expect(() => counter.increment(-1)).toThrow();
    expect(() => counter.decrement(-1)).toThrow();
    expect(counter.value()).toBe(0);
  });
  it('rejects expired refresh tokens at the expiry boundary', () => {
    const time = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(time);
    const auth = new AuthService();
    const initial = auth.issueTokenPair('user', 'owner@example.com');
    clock.mockReturnValue(time + 7 * 24 * 3600 * 1000);
    expect(auth.rotateRefreshToken(initial.refreshToken, 'owner@example.com')).toMatchObject({ success: false, error: 'Refresh token expired' });
  });
  it('uses the original identity when rotating a refresh token', () => {
    const auth = new AuthService();
    const initial = auth.issueTokenPair('user', 'owner@example.com');
    const result = auth.rotateRefreshToken(initial.refreshToken, 'attacker@example.com');
    expect(jwt.decode(result.accessToken!)).toMatchObject({ email: 'owner@example.com', sub: 'user' });
  });
  it('seeks beyond a cursor excluded by a status filter', () => {
    const db = new OrderDatabase();
    const page = db.getWithCursorPagination(Buffer.from('ord_000005').toString('base64'), 5, 'COMPLETED');
    expect(page.data[0].orderNumber).toBe(6);
  });
  it('isolates order idempotency between database instances', () => {
    const a = new OrderDatabase(); const b = new OrderDatabase();
    const payload = { customerName: 'Alice', amount: 5 };
    a.createOrder(payload, 'same-key');
    expect(b.createOrder(payload, 'same-key').idempotentReplay).toBe(false);
    expect(b.count()).toBe(10001);
  });
  it('hashes equivalent JSON objects independently of property order', () => {
    const store = new IdempotencyStore();
    expect(store.hashPayload({ a: { b: 1, c: 2 }, d: [1, 2] })).toBe(store.hashPayload({ d: [1, 2], a: { c: 2, b: 1 } }));
  });
  it.each([-1, 0, NaN, Infinity])('rejects an invalid transfer amount %s without mutation', async amount => {
    const db = new AcidSimulator();
    await expect(db.executeAtomicTransfer('acc_alice', 'acc_bob', amount)).rejects.toThrow();
    expect(db.getAccount('acc_alice')?.balance).toBe(1000);
  });
  it('does not release an expired Redis lock', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const redis = new RedisEngineSimulator(); const lock = redis.acquireDistributedLock('resource', 100);
    clock.mockReturnValue(1100);
    expect(redis.releaseDistributedLock('resource', lock.lockToken!)).toBe(false);
  });
  it('removes stale search terms when replacing a document', () => {
    const search = new InvertedIndexSearchEngine();
    search.indexDocument(1, 'postgres database'); search.indexDocument(1, 'redis cache');
    expect(search.search('postgres')).toEqual([]);
    expect(search.search('redis')).toHaveLength(1);
  });
  it('runs TCP and UDP labs concurrently without fixed port collisions', async () => {
    const results = await Promise.all([runRawTcpUdpDemo(), runRawTcpUdpDemo()]);
    for (const result of results) {
      expect(result.tcpResult.received).toBe('TCP_ECHO:PING_TCP');
      expect(result.udpResult.received).toBe('UDP_ECHO:PING_UDP');
    }
  });
  it.each(['http://127.2.3.4', 'http://[::1]', 'http://[::ffff:127.0.0.1]', 'http://[fd00::1]', 'http://[fe80::1]', 'http://localhost.', 'http://100.64.1.1'])('blocks private or alternate-form SSRF target %s', url => {
    expect(OwaspSecurityLab.validateSsrfUrl(url).allowed).toBe(false);
  });
  it.each(['00-a-b-01', `00-${'0'.repeat(32)}-${'1'.repeat(16)}-01`, `00-${'1'.repeat(32)}-${'0'.repeat(16)}-01`])('rejects malformed traceparent %s', header => {
    expect(DistributedTracer.parseTraceparent(header)).toBeNull();
  });
  it('reports failed shutdown hooks and incomplete draining truthfully', async () => {
    const coordinator = new GracefulShutdownCoordinator();
    coordinator.trackRequestStart();
    coordinator.registerHook('failure', async () => { throw new Error('cleanup failed'); });
    const result = await coordinator.triggerShutdown('MANUAL', 0);
    expect(result).toMatchObject({ success: false, drainedRequests: 0, executedHooks: [] });
  });
  it('rejects zero benchmark concurrency instead of reporting NaN results', async () => {
    await expect(runInProcessStressBenchmark(async () => {}, 10, 0)).rejects.toThrow();
  });
});
