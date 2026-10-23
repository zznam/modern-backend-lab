/**
 * Modern Backend Engineering Mastery Lab - Master Server
 * Integrates:
 * - RESTful APIs & Idempotency
 * - WebSockets for real-time bi-directional protocols
 * - Prometheus Metrics (/metrics)
 * - Distributed Tracing & Structured Logging
 * - Interactive Experiment Orchestrator
 */
import express, { type ErrorRequestHandler } from 'express';
import { experimentInput, InputError, queryInteger, stringInput } from './http-validation.js';
import { LRUCache, RingBuffer, MinHeap, BloomFilter, TrieRouter } from './01-runtime-systems/data-structures/data-structures.js';
import { OrderDatabase } from './02-api-security-db/rest-standards/rest-controller.js';
import { AuthService } from './02-api-security-db/auth-security/auth-service.js';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Observability
import { ContextLogger, traceStorage } from './04-devops-reliability/observability/logger.js';
import {
  metricsRegistry,
  httpRequestsTotal,
  httpRequestDurationSeconds,
  getPrometheusMetricsText,
} from './04-devops-reliability/observability/metrics.js';
import { DistributedTracer } from './04-devops-reliability/observability/tracer.js';

// Modules
import { runEventLoopExperiment } from './01-runtime-systems/event-loop/event-loop-demo.js';
import { compareSyncVsWorkerConcurrency } from './01-runtime-systems/worker-threads/worker-pool.js';
import { runMemoryLeakExperiment, MemoryDiagnostics } from './01-runtime-systems/memory-gc/memory-leak-lab.js';
import { runRawTcpUdpDemo } from './01-runtime-systems/networking/tcp-udp-server.js';
import { runDnsResolutionDemo } from './01-runtime-systems/networking/dns-resolver.js';
import { getTls13HandshakeFlow, simulateECDHEKeyExchange } from './01-runtime-systems/networking/tls-handshake.js';
import { LoadBalancer, compareL4VsL7Architecture } from './01-runtime-systems/networking/proxy-load-balancer.js';
import { getProtocolsComparison } from './01-runtime-systems/protocols/protocol-showdown.js';
import { getConcurrencyModelMatrix, getIoMultiplexingEvolution, getHostOsSystemReport } from './01-runtime-systems/os-fundamentals/process-vs-thread.js';
import { parsePosixMode, calculateUmask } from './01-runtime-systems/os-fundamentals/posix-filesystem.js';

import { globalOrderDb } from './02-api-security-db/rest-standards/rest-controller.js';
import { runNPlusOneBenchmark } from './02-api-security-db/graphql-grpc/graphql-engine.js';
import { compareProtobufVsJsonBenchmark } from './02-api-security-db/graphql-grpc/grpc-service.js';
import { AbacPolicyEngine } from './02-api-security-db/auth-security/access-control.js';
import { OwaspSecurityLab } from './02-api-security-db/owasp-security/owasp-lab.js';
import { AcidSimulator } from './02-api-security-db/rdbms-acid/acid-transactions.js';
import { LockingBenchmark } from './02-api-security-db/rdbms-acid/locking-strategies.js';
import { getIndexTypesComparison, analyzeExecutionPlan, calculateOptimalConnectionPool } from './02-api-security-db/db-tuning/index-tuning.js';
import { getPolyglotPersistenceMatrix, globalRedisSimulator, InvertedIndexSearchEngine } from './02-api-security-db/polyglot-storage/polyglot-manager.js';
import { globalPostgresAdapter, globalRedisAdapter } from './02-api-security-db/adapters/dual-mode-adapters.js';

import { setupCleanArchitectureLab } from './03-architecture-distributed/clean-architecture/clean-architecture.js';
import { getArchitecturePatternsMatrix } from './03-architecture-distributed/system-patterns/architecture-comparison.js';
import { MessageBrokerSimulator } from './03-architecture-distributed/event-driven-broker/message-broker.js';
import { TransactionalOutboxService } from './03-architecture-distributed/distributed-tx/outbox-pattern.js';
import { OrderSagaOrchestrator } from './03-architecture-distributed/distributed-tx/saga-pattern.js';
import { CachingEngineLab } from './03-architecture-distributed/caching-strategies/caching-engine.js';
import { CapClusterSimulator } from './03-architecture-distributed/distributed-theory/cap-theorem.js';
import { VectorClock, PNCounter } from './03-architecture-distributed/distributed-theory/eventual-consistency.js';
import { compareModuloVsConsistentHashing } from './03-architecture-distributed/distributed-theory/consistent-hashing.js';

import { TokenBucketRateLimiter, SlidingWindowRateLimiter } from './04-devops-reliability/resilience/rate-limiter.js';
import { CircuitBreaker } from './04-devops-reliability/resilience/circuit-breaker.js';
import { RetryStrategies } from './04-devops-reliability/resilience/retry-backoff.js';
import { globalShutdownCoordinator } from './04-devops-reliability/resilience/graceful-shutdown.js';
import { runInProcessStressBenchmark } from './04-devops-reliability/load-testing/runner.js';
import { runConsensusLab } from './05-advanced-systems/consensus.js';
import { runFencingLab } from './05-advanced-systems/fencing.js';
import { runEventSourcingLab } from './05-advanced-systems/event-sourcing.js';
import { runSnapshotLab } from './05-advanced-systems/snapshot-isolation.js';
import { runBackpressureLab } from './05-advanced-systems/backpressure.js';
import { runSloLab } from './05-advanced-systems/slo-burn.js';
import { runReplicationLab } from './05-advanced-systems/replication-quorums.js';
import { runLsmLab } from './05-advanced-systems/lsm-compaction.js';
import { runTwoPhaseCommitLab } from './05-advanced-systems/two-phase-commit.js';
import { runStreamWatermarkLab } from './05-advanced-systems/stream-watermarks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

let activeExperiments = 0;
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
app.disable('x-powered-by');

// Tracing and Metrics Middleware
app.use((req, res, next) => {
  const incomingId = req.headers['x-correlation-id'];
  const correlationId = typeof incomingId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(incomingId)
    ? incomingId : DistributedTracer.generateTraceId();
  res.setHeader('X-Correlation-ID', correlationId);

  const start = performance.now();
  if (globalShutdownCoordinator.isDraining()) {
    res.setHeader('Connection', 'close');
    res.status(503).json({ error: 'Server is shutting down' });
    return;
  }
  globalShutdownCoordinator.trackRequestStart();

  let completed = false;
  const onComplete = () => {
    if (completed) return;
    completed = true;
    globalShutdownCoordinator.trackRequestEnd();
    const duration = (performance.now() - start) / 1000;
    const route = req.route?.path || (res.statusCode === 404 ? 'unmatched' : 'static');
    httpRequestsTotal.inc({ method: req.method, route, status_code: res.writableFinished ? res.statusCode : 499 });
    httpRequestDurationSeconds.observe({ method: req.method, route }, duration);
  };
  res.once('finish', onComplete);
  res.once('close', onComplete);

  traceStorage.run({ correlationId }, () => next());
});

app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(projectRoot, 'public')));

// ========================================================
// HEALTH & OBSERVABILITY ENDPOINTS
// ========================================================
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'HEALTHY',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    memory: MemoryDiagnostics.getReport(),
  });
});

app.get('/api/v1/ready', async (req, res) => {
  const [pgHealth, redisHealth] = await Promise.all([
    globalPostgresAdapter.healthCheck(),
    globalRedisAdapter.healthCheck(),
  ]);

  const allHealthy = pgHealth.status !== 'DISCONNECTED' && redisHealth.status !== 'DISCONNECTED';
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'READY' : 'DEGRADED',
    adapters: {
      postgres: pgHealth,
      redis: redisHealth,
    },
  });
});

app.get('/metrics', async (req, res) => {
  res.setHeader('Content-Type', metricsRegistry.contentType);
  res.send(await getPrometheusMetricsText());
});

app.get('/api/telemetry/trace', (req, res) => {
  res.json(DistributedTracer.simulateDistributedOrderTrace());
});

// ========================================================
// REST API WITH PAGINATION & IDEMPOTENCY
// ========================================================
app.get('/api/v1/orders', (req, res) => {
  const { cursor, status } = req.query;
  const limit = queryInteger(req.query.limit, 'limit', 10, 1, 100);
  const offset = queryInteger(req.query.offset, 'offset', 0, 0, Number.MAX_SAFE_INTEGER);
  if (status !== undefined && (typeof status !== 'string' || !['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED'].includes(status))) {
    throw new InputError('status must be PENDING, PROCESSING, COMPLETED or CANCELLED');
  }
  if (cursor !== undefined) {
    if (typeof cursor !== 'string') throw new InputError('cursor must be a string');
    if (cursor && (!/^[A-Za-z0-9+/]+={0,2}$/.test(cursor) || !/^ord_\d+$/.test(Buffer.from(cursor, 'base64').toString('utf8')))) {
      throw new InputError('cursor must encode an order ID in base64');
    }
    return res.json(globalOrderDb.getWithCursorPagination(cursor || null, limit, status as string));
  }
  res.json(globalOrderDb.getWithOffsetPagination(offset, limit, status as string));
});

app.post('/api/v1/orders', (req, res) => {
  const idempotencyKey = req.headers['idempotency-key'];
  if (idempotencyKey !== undefined) stringInput(idempotencyKey, 'Idempotency-Key', 200);
  try {
    const result = globalOrderDb.createOrder(req.body, idempotencyKey as string | undefined);
    if (result.idempotentReplay) {
      res.setHeader('X-Cache', 'IDEMPOTENT-HIT');
    }
    res.status(result.statusCode).json(result.order);
  } catch (err: any) {
    if (err.message.includes('409 Conflict')) {
      return res.status(409).json({ error: err.message });
    }
    res.status(422).json({ error: err.message });
  }
});

// ========================================================
// MASTER EXPERIMENTS EXECUTION DISPATCHER
// ========================================================
app.post('/api/experiments/run', async (req, res) => {
  const { experimentId, params } = experimentInput(req.body);
  if (activeExperiments >= 2) {
    res.setHeader('Retry-After', '1');
    return res.status(429).json({ error: 'Two experiments are already running. Try again shortly.' });
  }
  activeExperiments++;
  const start = performance.now();

  try {
    let result: any;

    switch (experimentId) {
      // Track 5: deterministic advanced systems models
      case 'consensus-quorum':
        result = runConsensusLab(params.clusterSize, params.availableNodes);
        break;
      case 'fencing-tokens':
        result = runFencingLab(params.pauseMs);
        break;
      case 'event-sourcing':
        result = runEventSourcingLab(params.projectionBatch);
        break;
      case 'snapshot-isolation':
        result = runSnapshotLab(params.onCallDoctors);
        break;
      case 'backpressure':
        result = runBackpressureLab(params.producerRate, params.consumerRate, params.queueCapacity);
        break;
      case 'slo-burn-rate':
        result = runSloLab(params.sloBasisPoints, params.longErrorBasisPoints, params.shortErrorBasisPoints);
        break;
      case 'replication-quorums':
        result = runReplicationLab(params.readQuorum, params.writeQuorum, params.failedReplicas);
        break;
      case 'lsm-compaction':
        result = runLsmLab(params.memtableLimit, params.compaction);
        break;
      case 'two-phase-commit':
        result = runTwoPhaseCommitLab(params.crashPoint, params.rejectVote);
        break;
      case 'stream-watermarks':
        result = runStreamWatermarkLab(params.watermarkLag, params.allowedLateness);
        break;
      // Track 1: Runtime & Systems
      case 'event-loop':
        result = await runEventLoopExperiment();
        break;
      case 'worker-threads':
        result = await compareSyncVsWorkerConcurrency(params.limit || 25000);
        break;
      case 'memory-leak':
        result = await runMemoryLeakExperiment();
        break;
      case 'raw-tcp-udp':
        result = await runRawTcpUdpDemo();
        break;
      case 'dns-resolution':
        result = await runDnsResolutionDemo();
        break;
      case 'tls-handshake':
        result = {
          handshake13: getTls13HandshakeFlow(),
          ecdhKeyExchange: simulateECDHEKeyExchange(),
        };
        break;
      case 'load-balancer': {
        const lb = new LoadBalancer([
          { id: 'srv-alpha', host: '10.0.1.10', port: 8080, weight: 1, activeConnections: 12, healthy: true },
          { id: 'srv-bravo', host: '10.0.1.11', port: 8080, weight: 1, activeConnections: 3, healthy: true },
          { id: 'srv-charlie', host: '10.0.1.12', port: 8080, weight: 1, activeConnections: 8, healthy: true },
        ]);
        result = {
          l4vsL7: compareL4VsL7Architecture(),
          roundRobinSelection: [lb.selectNode('ROUND_ROBIN').id, lb.selectNode('ROUND_ROBIN').id, lb.selectNode('ROUND_ROBIN').id],
          leastConnectionsSelection: lb.selectNode('LEAST_CONNECTIONS'),
          ipHashSelection: lb.selectNode('IP_HASH', params.clientIp || '203.0.113.45'),
        };
        break;
      }
      case 'protocols':
        result = getProtocolsComparison();
        break;
      case 'os-fundamentals':
        result = {
          hostReport: getHostOsSystemReport(),
          concurrencyModels: getConcurrencyModelMatrix(),
          ioEvolution: getIoMultiplexingEvolution(),
          posixPermissions: parsePosixMode(params.mode ?? 0o755),
          umaskCalculation: calculateUmask(params.createdMode ?? 0o666, params.umask ?? 0o022),
        };
        break;

      case 'data-structures': {
        const cache = new LRUCache<string, number>(2);
        cache.put('a', 1); cache.put('b', 2); cache.get('a'); cache.put('c', 3);
        const ring = new RingBuffer<number>(2);
        [1, 2, 3].forEach(value => ring.enqueue(value));
        const heap = new MinHeap<number>((a, b) => a - b);
        [3, 1, 2].forEach(value => heap.push(value));
        const bloom = new BloomFilter(); bloom.add('known');
        const trie = new TrieRouter(); trie.insert('/orders', 'orders-handler');
        result = { lru: { evictedB: cache.get('b') === undefined, retainedA: cache.get('a') },
          ringBuffer: [ring.dequeue(), ring.dequeue()], minHeap: [heap.pop(), heap.pop(), heap.pop()],
          bloom: { known: bloom.test('known'), missing: bloom.test('missing') }, trie: trie.search('/orders') };
        break;
      }

      // Track 2: API, Security & Databases
      case 'rest-pagination': {
        const db = new OrderDatabase();
        const first = db.getWithCursorPagination(null, 5);
        result = { offset: db.getWithOffsetPagination(5, 5), firstCursorPage: first,
          nextCursorPage: db.getWithCursorPagination(first.pagination.nextCursor, 5) };
        break;
      }
      case 'idempotency': {
        const db = new OrderDatabase();
        const key = DistributedTracer.generateTraceId();
        const payload = { customerName: 'Lab customer', amount: 99 };
        result = { initial: db.createOrder(payload, key), replay: db.createOrder(payload, key),
          explanation: 'Both requests return the same order. A changed payload with the same key is rejected.' };
        break;
      }
      case 'graphql-dataloader':
        result = await runNPlusOneBenchmark();
        break;
      case 'grpc-protobuf':
        result = compareProtobufVsJsonBenchmark(params.iterations || 20000);
        break;
      case 'auth-jwt-rotation': {
        const auth = new AuthService();
        const initial = auth.issueTokenPair('usr_test', 'user@example.com');
        const rotated = auth.rotateRefreshToken(initial.refreshToken, 'user@example.com');
        const replayAttack = auth.rotateRefreshToken(initial.refreshToken, 'user@example.com');
        result = { initial, rotated, replayAttack };
        break;
      }
      case 'abac-authorization': {
        const engine = new AbacPolicyEngine();
        const subject = params.subject || { id: 'u1', department: 'FINANCE', clearanceLevel: 4, isContractor: false };
        const resource = params.resource || { id: 'd1', ownerId: 'u1', department: 'FINANCE', classificationLevel: 3, status: 'ACTIVE' };
        const env = params.env || { currentHourUtc: 14, isCorporateVpn: true, clientIp: '10.0.1.20' };
        result = {
          allowedAction: engine.authorize(subject, resource, 'READ', env),
          deniedContractorDelete: engine.authorize({ ...subject, isContractor: true }, resource, 'DELETE', env),
          deniedClearance: engine.authorize({ ...subject, clearanceLevel: 1 }, resource, 'READ', env),
        };
        break;
      }
      case 'owasp-lab':
        result = {
          sqlInjection: OwaspSecurityLab.testSqlInjection(params.sqlPayload || "admin@test.com' OR '1'='1"),
          noSqlInjection: OwaspSecurityLab.testNoSqlInjection(params.noSqlPayload || { $gt: '' }),
          ssrfValidation: OwaspSecurityLab.validateSsrfUrl(params.ssrfUrl || 'http://169.254.169.254/latest/meta-data/'),
          idorCheck: OwaspSecurityLab.checkIdorAccess('attacker', 'doc_private', 'victim', 'USER'),
          cryptoBcrypt: await OwaspSecurityLab.demonstratePasswordHash('AdminSuperPass2026!'),
          cryptoAesGcm: OwaspSecurityLab.demonstrateAes256GcmEncryption('HighlyConfidentialFinancialData'),
        };
        break;
      case 'acid-transactions': {
        const simulation = new AcidSimulator();
        const dualModeTransfer = globalPostgresAdapter.getMode() === 'IN_MEMORY_FALLBACK'
          ? { ...await new AcidSimulator().executeAtomicTransfer('acc_alice', 'acc_bob', 100), mode: 'IN_MEMORY_FALLBACK' }
          : await globalPostgresAdapter.executeAtomicTransfer('acc_alice', 'acc_bob', 100);
        result = {
          dualModeTransfer,
          normalTransfer: await simulation.executeAtomicTransfer('acc_alice', 'acc_bob', 100),
          crashRollback: await simulation.executeAtomicTransfer('acc_alice', 'acc_bob', 100, 1),
          dirtyRead: simulation.simulateDirtyReadAnomaly(),
          nonRepeatableRead: simulation.simulateNonRepeatableReadAnomaly(),
          phantomRead: simulation.simulatePhantomReadAnomaly(),
        };
        break;
      }
      case 'locking-benchmark':
        result = {
          noLock: await LockingBenchmark.runNoLock(1000, 10, params.concurrency || 30),
          pessimisticLock: await LockingBenchmark.runPessimisticLock(1000, 10, params.concurrency || 30),
          optimisticLock: await LockingBenchmark.runOptimisticLock(1000, 10, params.concurrency || 30),
        };
        break;
      case 'db-tuning':
        result = {
          indexMatrix: getIndexTypesComparison(),
          seqScanPlan: analyzeExecutionPlan('SELECT * FROM users WHERE email = ?', false),
          indexOnlyScanPlan: analyzeExecutionPlan('SELECT * FROM users WHERE email = ?', true),
          poolCalculation: calculateOptimalConnectionPool(params.cpuCores || 8, true),
        };
        break;
      case 'polyglot-persistence': {
        const redis = globalRedisSimulator;
        const lock = redis.acquireDistributedLock('order_checkout_lock');
        redis.zadd('game_leaderboard', 1250, 'NinjaCoder');
        redis.zadd('game_leaderboard', 2400, 'ByteMaster');

        const dualModeLock = await globalRedisAdapter.acquireDistributedLock('dual_order_lock', 5000);
        await globalRedisAdapter.zadd('dual_game_leaderboard', 3500, 'DualMaster');
        const dualLeaderboard = await globalRedisAdapter.zrevrange('dual_game_leaderboard', 3);

        const search = new InvertedIndexSearchEngine();
        search.indexDocument(1, 'Distributed message queues with Kafka and RabbitMQ');
        search.indexDocument(2, 'PostgreSQL query optimization with B-Tree indexes');
        search.indexDocument(3, 'Cache stampede and thundering herd mitigation with Redis');

        if (lock.lockToken) redis.releaseDistributedLock('order_checkout_lock', lock.lockToken);
        if (dualModeLock.lockToken) await globalRedisAdapter.releaseDistributedLock('dual_order_lock', dualModeLock.lockToken);
        result = {
          storageMatrix: getPolyglotPersistenceMatrix(),
          redisRedlock: lock,
          redisLeaderboard: redis.zrevrange('game_leaderboard'),
          dualModeRedis: {
            mode: globalRedisAdapter.getMode(),
            lock: dualModeLock,
            leaderboard: dualLeaderboard,
          },
          searchEngineResults: search.search(params.searchQuery || 'message queues'),
        };
        break;
      }

      // Track 3: Architecture & Distributed Systems
      case 'clean-architecture': {
        const { useCase } = setupCleanArchitectureLab();
        result = await useCase.execute({
          orderId: `ord_${Date.now()}`,
          customerId: 'cust_premium',
          amount: 499,
        });
        break;
      }
      case 'system-patterns':
        result = getArchitecturePatternsMatrix();
        break;
      case 'message-broker': {
        const broker = new MessageBrokerSimulator();
        broker.subscribe('orders', async (msg) => {
          if (msg.payload.simulatePoison) throw new Error('Database connection failed in worker');
        });
        const m1 = broker.publish('orders', { item: 'Laptop', simulatePoison: false }, 'dedup_order_1');
        const m2 = broker.publish('orders', { item: 'PoisonPill', simulatePoison: true }, 'dedup_order_2', 2);

        const r1 = await broker.processNext('orders');
        const r2 = await broker.processNext('orders');
        const r3 = await broker.processNext('orders');

        result = {
          processedAck: r1,
          retryAttempt: r2,
          deadLetterQueueMoved: r3,
          dlqContents: broker.getDlqMessages(),
        };
        break;
      }
      case 'outbox-pattern': {
        const outbox = new TransactionalOutboxService();
        await outbox.createOrderAtomically('ord_101', 'cust_alpha', 199.99);
        const brokerDownRelay = await outbox.relayPendingEventsToBroker(true);
        const brokerRecoveredRelay = await outbox.relayPendingEventsToBroker(false);
        result = {
          brokerDownRelay,
          brokerRecoveredRelay,
          outboxStatus: outbox.getOutboxStatus(),
        };
        break;
      }
      case 'saga-pattern': {
        const saga = new OrderSagaOrchestrator();
        const successSaga = await saga.executeOrderSaga({
          orderId: 'ord_success_1',
          customerId: 'cust_a',
          amount: 89.99,
          inventoryAvailable: true,
        });
        const failedSaga = await saga.executeOrderSaga({
          orderId: 'ord_fail_2',
          customerId: 'cust_b',
          amount: 250.0,
          inventoryAvailable: false,
        });
        result = { successSaga, failedSaga };
        break;
      }
      case 'cache-stampede': {
        const lab = new CachingEngineLab();
        const withoutMutex = await lab.simulateStampedeWithoutMutex('product_1', params.concurrency || 50);
        const withMutex = await lab.simulateStampedeWithSingleflight('product_1', params.concurrency || 50);
        const penetrationTest = lab.queryWithPenetrationDefense('product_unknown_99999');
        result = { withoutMutex, withMutex, penetrationTest };
        break;
      }
      case 'cap-theorem': {
        const cluster = new CapClusterSimulator();
        cluster.setNetworkPartition(true);
        const cpAttempt = cluster.writeCP('Node-A', 'data_cp_v2');
        const apAttempt = cluster.writeAP('Node-A', 'data_ap_v2');
        result = {
          clusterStatus: cluster.getStatus(),
          cpWriteResult: cpAttempt,
          apWriteResult: apAttempt,
        };
        break;
      }
      case 'eventual-consistency': {
        const v1 = new VectorClock({ 'Node-A': 2, 'Node-B': 1 });
        const v2 = new VectorClock({ 'Node-A': 1, 'Node-B': 3 });

        const counterA = new PNCounter('nodeA');
        const counterB = new PNCounter('nodeB');
        counterA.increment(15);
        counterB.decrement(5);
        counterA.merge(counterB);

        result = {
          vectorClockComparison: v1.compare(v2),
          crdtPnCounterConvergedValue: counterA.value(),
        };
        break;
      }
      case 'consistent-hashing':
        result = compareModuloVsConsistentHashing(params.keyCount || 1000);
        break;

      // Track 4: DevOps, Reliability & Observability
      case 'observability':
        result = { trace: DistributedTracer.simulateDistributedOrderTrace(), metricsEndpoint: '/metrics',
          correlationId: res.getHeader('X-Correlation-ID'), logging: 'Structured Pino logs use the request correlation ID.' };
        break;
      case 'devops-k8s':
        result = { container: { runtime: 'Node.js 22', user: 'node', entrypoint: 'node dist/server.js' },
          probes: { liveness: '/api/v1/health', readiness: '/api/v1/ready' },
          scaling: { replicas: 3, maxReplicas: 10 },
          deployment: 'Example manifests require real credentials and cluster setup. The CI canary stage is a simulation.',
          tracing: 'Trace spans are simulated locally; this lab does not export OTLP to Jaeger.' };
        break;
      case 'rate-limiting': {
        const tb = new TokenBucketRateLimiter(5, 1);
        const sw = new SlidingWindowRateLimiter(60000, 5);
        result = {
          tokenBucketBurst: [tb.allowRequest(2), tb.allowRequest(3), tb.allowRequest(1)],
          slidingWindowTest: [
            sw.allowRequest('client-1'),
            sw.allowRequest('client-1'),
            sw.allowRequest('client-1'),
            sw.allowRequest('client-1'),
            sw.allowRequest('client-1'),
            sw.allowRequest('client-1'),
          ],
        };
        break;
      }
      case 'circuit-breaker': {
        const cb = new CircuitBreaker(2, 100, 1);
        const fail = async () => {
          throw new Error('Downstream 500 error');
        };
        const fb = async () => 'Graceful Fallback Cached Content';

        const c1 = await cb.execute(fail, fb);
        const c2 = await cb.execute(fail, fb);
        const stateAfterFailures = cb.getState();
        result = { call1: c1, call2: c2, stateAfterFailures };
        break;
      }
      case 'retry-backoff':
        result = RetryStrategies.simulate50ClientsRetrying();
        break;
      case 'load-stress-benchmark':
        result = await runInProcessStressBenchmark(async () => {
          Math.sin(Math.random()) * Math.cos(Math.random());
        }, params.totalRequests || 1000, params.concurrency || 50);
        break;

      default:
        return res.status(404).json({ error: `Unknown experimentId: ${experimentId}` });
    }

    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    res.json({
      experimentId,
      executionDurationMs: durationMs,
      data: result,
    });
  } catch (err) {
    ContextLogger.error('Experiment failed', err, { experimentId });
    res.status(500).json({ error: 'Experiment failed', correlationId: res.getHeader('X-Correlation-ID') });
  } finally {
    activeExperiments--;
  }
});

// WebSocket Echo & Real-Time Stream
wss.on('connection', (ws: WebSocket) => {
  ws.on('error', err => ContextLogger.warn('WebSocket connection error', { message: err.message }));
  if (globalShutdownCoordinator.isDraining()) {
    ws.close(1012, 'Server is shutting down');
    return;
  }
  ws.send(JSON.stringify({ type: 'WELCOME', message: 'Connected to Modern Backend Lab WebSocket' }));

  ws.on('message', (message: string) => {
    try {
      const data = JSON.parse(message.toString());
      ws.send(JSON.stringify({ type: 'ACK', echo: data, timestamp: Date.now() }));
    } catch {
      ws.send(JSON.stringify({ type: 'RAW_ECHO', data: message.toString() }));
    }
  });
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = err instanceof InputError ? 400 : [400, 413, 415].includes(err.status) ? err.status : 500;
  if (status === 500) ContextLogger.error('HTTP request failed', err);
  res.status(status).json({ error: status === 500 ? 'Internal server error' : status === 413 ? 'Request body too large' : err.message });
};
app.use(errorHandler);

globalShutdownCoordinator.registerHook('HTTP and WebSocket teardown', async () => {
  for (const ws of wss.clients) ws.terminate();
  await new Promise<void>((resolve, reject) => wss.close(err => err ? reject(err) : resolve()));
  await new Promise<void>((resolve, reject) => {
    server.close(err => err ? reject(err) : resolve());
    server.closeAllConnections();
  });
});
globalShutdownCoordinator.registerHook('PostgreSQL pool teardown', () => globalPostgresAdapter.close());
globalShutdownCoordinator.registerHook('Redis client teardown', () => globalRedisAdapter.close());

export async function startServer(port = Number(process.env.PORT ?? 4000), host = process.env.HOST ?? '127.0.0.1'): Promise<void> {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer between 0 and 65535');
  await Promise.all([globalPostgresAdapter.initSchema(), globalRedisAdapter.connect()]);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); resolve(); });
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  ContextLogger.info(`Backend Lab listening at http://${host}:${actualPort}`);
}

async function shutdown(signal: 'SIGTERM' | 'SIGINT'): Promise<void> {
  const result = await globalShutdownCoordinator.triggerShutdown(signal);
  ContextLogger.info('Shutdown finished', { ...result });
  process.exit(result.success ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  startServer().catch(async err => {
    ContextLogger.error('Server startup failed', err);
    await Promise.allSettled([globalPostgresAdapter.close(), globalRedisAdapter.close()]);
    process.exitCode = 1;
  });
}

export { app, server };
export default app;
