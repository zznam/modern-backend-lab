/**
 * Modern Backend Engineering Mastery Lab - Interactive CLI Runner
 * Run headless experiments, benchmarks, and diagnostic tools directly in terminal.
 */
import readline from 'node:readline';
import { runEventLoopExperiment } from './01-runtime-systems/event-loop/event-loop-demo.js';
import { compareSyncVsWorkerConcurrency } from './01-runtime-systems/worker-threads/worker-pool.js';
import { runMemoryLeakExperiment } from './01-runtime-systems/memory-gc/memory-leak-lab.js';
import { runRawTcpUdpDemo } from './01-runtime-systems/networking/tcp-udp-server.js';
import { runDnsResolutionDemo } from './01-runtime-systems/networking/dns-resolver.js';
import { LockingBenchmark } from './02-api-security-db/rdbms-acid/locking-strategies.js';
import { runNPlusOneBenchmark } from './02-api-security-db/graphql-grpc/graphql-engine.js';
import { compareProtobufVsJsonBenchmark } from './02-api-security-db/graphql-grpc/grpc-service.js';
import { CachingEngineLab } from './03-architecture-distributed/caching-strategies/caching-engine.js';
import { OrderSagaOrchestrator } from './03-architecture-distributed/distributed-tx/saga-pattern.js';
import { compareModuloVsConsistentHashing } from './03-architecture-distributed/distributed-theory/consistent-hashing.js';
import { runInProcessStressBenchmark } from './04-devops-reliability/load-testing/runner.js';
import { DistributedTracer } from './04-devops-reliability/observability/tracer.js';
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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let cliClosed = false;
rl.on('close', () => { cliClosed = true; });

const menu = `
================================================================
🚀 Modern Backend Engineering Mastery Lab (CLI Mode)
================================================================
Choose an experiment to run:

1. [Runtime] Event Loop Execution Order Trace
2. [Runtime] Event Loop Blocking vs Worker Threads Pool
3. [Runtime] V8 Heap Memory Leak & Leak Detection
4. [Networking] Raw TCP vs UDP Socket Roundtrip
5. [Networking] DNS Resolution Hierarchy & TTL Caching
6. [Database] Concurrency Race Condition: No-Lock vs Pessimistic vs Optimistic
7. [API] GraphQL N+1 Problem vs DataLoader Batching
8. [Protocols] Protobuf Binary Wire Encoding vs JSON Benchmark
9. [Architecture] Cache Stampede (Thundering Herd) Singleflight Benchmark
10. [Architecture] Saga Distributed Transaction Rollback Simulation
11. [Distributed] Consistent Hashing Ring vs Modulo Reshuffle
12. [DevOps] In-Process Stress Test (RPS & p95/p99 Latency)
13. [Observability] OpenTelemetry Distributed Trace Generation
14. [Advanced] Consensus, Quorum Loss & Log Repair
15. [Advanced] Lease Expiry & Fencing Tokens
16. [Advanced] Event Sourcing, CQRS & Projection Replay
17. [Advanced] Snapshot Isolation & Write Skew
18. [Advanced] Backpressure & Load Shedding
19. [Advanced] SLO Error Budgets & Multiwindow Burn Rates
20. [Advanced] Replication Quorums & Read Repair
21. [Advanced] LSM Trees, Tombstones & Compaction
22. [Advanced] Two-Phase Commit & Coordinator Recovery
23. [Advanced] Event-Time Windows, Watermarks & Late Data

q. Quit
----------------------------------------------------------------
Enter selection (1-23 or q): `;

async function handleSelection(choice: string): Promise<void> {
  console.log('\n⏳ Running experiment...\n');
  const start = performance.now();

  switch (choice.trim()) {
    case '14': console.log(JSON.stringify(runConsensusLab(), null, 2)); break;
    case '15': console.log(JSON.stringify(runFencingLab(), null, 2)); break;
    case '16': console.log(JSON.stringify(runEventSourcingLab(), null, 2)); break;
    case '17': console.log(JSON.stringify(runSnapshotLab(), null, 2)); break;
    case '18': console.log(JSON.stringify(runBackpressureLab(), null, 2)); break;
    case '19': console.log(JSON.stringify(runSloLab(), null, 2)); break;
    case '20': console.log(JSON.stringify(runReplicationLab(), null, 2)); break;
    case '21': console.log(JSON.stringify(runLsmLab(), null, 2)); break;
    case '22': console.log(JSON.stringify(runTwoPhaseCommitLab(), null, 2)); break;
    case '23': console.log(JSON.stringify(runStreamWatermarkLab(), null, 2)); break;
    case '1': {
      const res = await runEventLoopExperiment();
      console.log('📊 Event Loop Execution Trace:');
      console.table(res.trace);
      break;
    }
    case '2': {
      const res = await compareSyncVsWorkerConcurrency(25000);
      console.log('📊 Sync vs Worker Thread Concurrency:');
      console.log(JSON.stringify(res, null, 2));
      break;
    }
    case '3': {
      const res = await runMemoryLeakExperiment();
      console.log('📊 V8 Memory Heap Report:');
      console.log(JSON.stringify(res, null, 2));
      break;
    }
    case '4': {
      const res = await runRawTcpUdpDemo();
      console.log('📊 Raw TCP & UDP Socket Results:');
      console.log(JSON.stringify(res, null, 2));
      break;
    }
    case '5': {
      const res = await runDnsResolutionDemo();
      console.log('📊 DNS Resolution Trace:');
      console.table(res.simulatedHierarchy);
      break;
    }
    case '6': {
      console.log('Running 30 concurrent withdrawals under 3 locking strategies...');
      const noLock = await LockingBenchmark.runNoLock(1000, 10, 30);
      const pessimistic = await LockingBenchmark.runPessimisticLock(1000, 10, 30);
      const optimistic = await LockingBenchmark.runOptimisticLock(1000, 10, 30);
      console.table([
        { Strategy: noLock.strategy, FinalBalance: noLock.actualFinalBalance, DataLost: noLock.dataLostAmount, DurationMs: noLock.durationMs },
        { Strategy: pessimistic.strategy, FinalBalance: pessimistic.actualFinalBalance, DataLost: pessimistic.dataLostAmount, DurationMs: pessimistic.durationMs },
        { Strategy: optimistic.strategy, FinalBalance: optimistic.actualFinalBalance, DataLost: optimistic.dataLostAmount, DurationMs: optimistic.durationMs },
      ]);
      break;
    }
    case '7': {
      const res = await runNPlusOneBenchmark();
      console.log('📊 GraphQL DataLoader N+1 Benchmark:');
      console.log(JSON.stringify(res, null, 2));
      break;
    }
    case '8': {
      const res = compareProtobufVsJsonBenchmark(30000);
      console.log('📊 Protobuf vs JSON Serialization Benchmark:');
      console.log(JSON.stringify(res, null, 2));
      break;
    }
    case '9': {
      const lab = new CachingEngineLab();
      const withoutMutex = await lab.simulateStampedeWithoutMutex('product_1', 50);
      const withMutex = await lab.simulateStampedeWithSingleflight('product_1', 50);
      console.log('📊 Cache Stampede Benchmark:');
      console.table([
        { Mode: 'Without Singleflight Mutex', DB_Queries: withoutMutex.dbQueriesFired, DurationMs: withoutMutex.durationMs },
        { Mode: 'With Singleflight Mutex', DB_Queries: withMutex.dbQueriesFired, DurationMs: withMutex.durationMs },
      ]);
      break;
    }
    case '10': {
      const saga = new OrderSagaOrchestrator();
      const res = await saga.executeOrderSaga({ orderId: 'ord_fail_99', customerId: 'cust_xyz', amount: 250, inventoryAvailable: false });
      console.log(`📊 Saga Status: ${res.sagaStatus}`);
      console.table(res.logs);
      break;
    }
    case '11': {
      const res = compareModuloVsConsistentHashing(1000);
      console.log('📊 Consistent Hashing Relocation Benchmark:');
      console.table([
        { Method: 'Modulo Hashing [hash(k) % N]', KeysRelocated: `${res.moduloRelocationPercent}%` },
        { Method: 'Consistent Hashing Ring', KeysRelocated: `${res.consistentHashingRelocationPercent}%` },
      ]);
      console.log(res.explanation);
      break;
    }
    case '12': {
      console.log('Generating 1,000 requests at concurrency 50...');
      const res = await runInProcessStressBenchmark(async () => {
        Math.sqrt(Math.random() * 1000000);
      }, 1000, 50);
      console.log('📊 Load Test Results:');
      console.log(JSON.stringify(res, null, 2));
      break;
    }
    case '13': {
      const trace = DistributedTracer.simulateDistributedOrderTrace();
      console.log(`📊 Trace ID: ${trace.traceId}`);
      console.log(`W3C traceparent header: ${trace.w3cHeader}`);
      console.table(trace.spans.map((s) => ({ Service: s.service, Name: s.name, DurationMs: s.durationMs, Status: s.status })));
      break;
    }
    case 'q':
    case 'exit':
      rl.close();
      return;
    default:
      throw new Error('Invalid option. Please select 1-23 or q.');
  }

  const duration = Math.round((performance.now() - start) * 10) / 10;
  console.log(`\n✓ Experiment finished in ${duration}ms\n`);

}

function promptUser(): void {
  rl.question(menu, (ans) => {
    handleSelection(ans).catch(err => console.error(`Experiment failed: ${err.message}`)).finally(() => {
      if (!cliClosed) promptUser();
    });
  });
}

// Check if run directly
const directArg = process.argv[2];
if (directArg) {
  handleSelection(directArg).catch(err => {
    console.error(`Experiment failed: ${err.message}`);
    process.exitCode = 1;
  }).finally(() => rl.close());
} else {
  promptUser();
}

