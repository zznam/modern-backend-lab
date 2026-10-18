/**
 * Modern Backend Engineering Mastery Lab - Master Server
 * Integrates:
 * - RESTful APIs & Idempotency
 * - Server-Sent Events (SSE) for Live Experiment Streaming
 * - WebSockets for real-time bi-directional protocols
 * - Prometheus Metrics (/metrics)
 * - Distributed Tracing & Structured Logging
 * - Interactive Experiment Orchestrator
 */
import express from 'express';
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
import { globalAuthService } from './02-api-security-db/auth-security/auth-service.js';
import { RbacEvaluator, AbacPolicyEngine } from './02-api-security-db/auth-security/access-control.js';
import { OwaspSecurityLab } from './02-api-security-db/owasp-security/owasp-lab.js';
import { globalAcidSimulator } from './02-api-security-db/rdbms-acid/acid-transactions.js';
import { LockingBenchmark } from './02-api-security-db/rdbms-acid/locking-strategies.js';
import { getIndexTypesComparison, analyzeExecutionPlan, calculateOptimalConnectionPool } from './02-api-security-db/db-tuning/index-tuning.js';
import { getPolyglotPersistenceMatrix, globalRedisSimulator, InvertedIndexSearchEngine } from './02-api-security-db/polyglot-storage/polyglot-manager.js';

import { setupCleanArchitectureLab } from './03-architecture-distributed/clean-architecture/clean-architecture.js';
import { getArchitecturePatternsMatrix } from './03-architecture-distributed/system-patterns/architecture-comparison.js';
import { MessageBrokerSimulator } from './03-architecture-distributed/event-driven-broker/message-broker.js';
import { TransactionalOutboxService } from './03-architecture-distributed/distributed-tx/outbox-pattern.js';
import { OrderSagaOrchestrator } from './03-architecture-distributed/distributed-tx/saga-pattern.js';
import { CachingEngineLab } from './03-architecture-distributed/caching-strategies/caching-engine.js';
import { CapClusterSimulator } from './03-architecture-distributed/distributed-theory/cap-theorem.js';
import { VectorClock, PNCounter } from './03-architecture-distributed/distributed-theory/eventual-consistency.js';
import { compareModuloVsConsistentHashing, ConsistentHashRing } from './03-architecture-distributed/distributed-theory/consistent-hashing.js';

import { TokenBucketRateLimiter, SlidingWindowRateLimiter } from './04-devops-reliability/resilience/rate-limiter.js';
import { CircuitBreaker } from './04-devops-reliability/resilience/circuit-breaker.js';
import { RetryStrategies } from './04-devops-reliability/resilience/retry-backoff.js';
import { globalShutdownCoordinator } from './04-devops-reliability/resilience/graceful-shutdown.js';
import { runInProcessStressBenchmark } from './04-devops-reliability/load-testing/runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(express.json());
app.use(express.static(path.join(projectRoot, 'public')));

// Tracing and Metrics Middleware
app.use((req, res, next) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || DistributedTracer.generateTraceId();
  res.setHeader('X-Correlation-ID', correlationId);

  const start = performance.now();
  globalShutdownCoordinator.trackRequestStart();

  res.on('finish', () => {
    globalShutdownCoordinator.trackRequestEnd();
    const duration = (performance.now() - start) / 1000;
    const route = req.route?.path || req.path;
    httpRequestsTotal.inc({ method: req.method, route, status_code: res.statusCode });
    httpRequestDurationSeconds.observe({ method: req.method, route }, duration);
  });

  traceStorage.run({ correlationId }, () => next());
});

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

app.get('/api/v1/ready', (req, res) => {
  res.json({ status: 'READY', connectionsHealthy: true });
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
  const { cursor, offset, limit = '10', status } = req.query;
  const parsedLimit = parseInt(limit as string, 10);

  if (cursor !== undefined) {
    const result = globalOrderDb.getWithCursorPagination((cursor as string) || null, parsedLimit, status as string);
    return res.json(result);
  }

  const parsedOffset = parseInt((offset as string) || '0', 10);
  const result = globalOrderDb.getWithOffsetPagination(parsedOffset, parsedLimit, status as string);
  res.json(result);
});

app.post('/api/v1/orders', (req, res) => {
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
  try {
    const result = globalOrderDb.createOrder(req.body, idempotencyKey);
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
  const { experimentId, params = {} } = req.body;
  const start = performance.now();

  try {
    let result: any;

    switch (experimentId) {
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
          posixPermissions: parsePosixMode(params.mode || 0o755),
          umaskCalculation: calculateUmask(params.createdMode || 0o666, params.umask || 0o022),
        };
        break;

      // Track 2: API, Security & Databases
      case 'graphql-dataloader':
        result = await runNPlusOneBenchmark();
        break;
      case 'grpc-protobuf':
        result = compareProtobufVsJsonBenchmark(params.iterations || 20000);
        break;
      case 'auth-jwt-rotation': {
        const auth = globalAuthService;
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
      case 'acid-transactions':
        result = {
          normalTransfer: await globalAcidSimulator.executeAtomicTransfer('acc_alice', 'acc_bob', 100),
          crashRollback: await globalAcidSimulator.executeAtomicTransfer('acc_alice', 'acc_bob', 100, 1),
          dirtyRead: globalAcidSimulator.simulateDirtyReadAnomaly(),
          nonRepeatableRead: globalAcidSimulator.simulateNonRepeatableReadAnomaly(),
          phantomRead: globalAcidSimulator.simulatePhantomReadAnomaly(),
        };
        break;
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

        const search = new InvertedIndexSearchEngine();
        search.indexDocument(1, 'Distributed message queues with Kafka and RabbitMQ');
        search.indexDocument(2, 'PostgreSQL query optimization with B-Tree indexes');
        search.indexDocument(3, 'Cache stampede and thundering herd mitigation with Redis');

        result = {
          storageMatrix: getPolyglotPersistenceMatrix(),
          redisRedlock: lock,
          redisLeaderboard: redis.zrevrange('game_leaderboard'),
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
  } catch (err: any) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// WebSocket Echo & Real-Time Stream
wss.on('connection', (ws: WebSocket) => {
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

const PORT = parseInt(process.env.PORT || '4000', 10);

// Setup Graceful Shutdown hooks
globalShutdownCoordinator.registerHook('HTTP Server Teardown', async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

server.listen(PORT, '0.0.0.0', () => {
  ContextLogger.info(`🚀 Modern Backend Engineering Lab server listening on port ${PORT}`);
  console.log(`\n================================================================`);
  console.log(`🚀 Modern Backend Engineering Mastery Lab`);
  console.log(`🌐 Web Dashboard: http://localhost:${PORT}`);
  console.log(`📊 Prometheus Metrics: http://localhost:${PORT}/metrics`);
  console.log(`⚡ WebSocket Stream: ws://localhost:${PORT}/ws`);
  console.log(`🩺 Healthcheck: http://localhost:${PORT}/api/v1/health`);
  console.log(`================================================================\n`);
});

export { app, server };
