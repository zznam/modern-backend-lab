# 🚀 Modern Backend Engineering Mastery Lab

[![Tests](https://img.shields.io/badge/tests-58%20passed-brightgreen.svg)](tests/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](tsconfig.json)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green.svg)](package.json)
[![Go Companion](https://img.shields.io/badge/Go-1.22+-00ADD8.svg)](src/companion-go/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](Dockerfile)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-Manifests-326CE5.svg)](k8s/)

An ultra-comprehensive, hands-on, runnable learning platform built directly in `~/workspace/modern-backend-lab` to master modern backend engineering, high-availability architecture, concurrency, data integrity, and distributed systems at scale.

---

## 🧭 Syllabus & Concept Mapping

| Pillar | Core Topic | Live Runnable Lab | Implementation File |
| :--- | :--- | :--- | :--- |
| **1. Runtime & Systems** | Event Loop Phases & Microtasks | Deterministic phase trace | [`event-loop-demo.ts`](src/01-runtime-systems/event-loop/event-loop-demo.ts) |
| | Worker Threads vs CPU Lag | Event loop stall vs Worker pool | [`worker-pool.ts`](src/01-runtime-systems/worker-threads/worker-pool.ts) |
| | V8 Heap & Memory Leak Debugger | Live closure/emitter leak & GC detector | [`memory-leak-lab.ts`](src/01-runtime-systems/memory-gc/memory-leak-lab.ts) |
| | Data Structures (LRU, Ring, Heap, Bloom, Trie) | O(1) eviction, circular buffer, min-heap | [`data-structures.ts`](src/01-runtime-systems/data-structures/data-structures.ts) |
| | Networking (TCP/UDP, Handshake, Nagle) | Low-level sockets & TCP_NODELAY | [`tcp-udp-server.ts`](src/01-runtime-systems/networking/tcp-udp-server.ts) |
| | DNS Resolution & TTL | Hierarchy trace & cache invalidation | [`dns-resolver.ts`](src/01-runtime-systems/networking/dns-resolver.ts) |
| | TLS 1.2 vs 1.3 & ECDHE PFS | Ephemeral Diffie-Hellman key exchange | [`tls-handshake.ts`](src/01-runtime-systems/networking/tls-handshake.ts) |
| | L4 vs L7 Proxies & Load Balancers | Round Robin, Least Conns, IP Hash | [`proxy-load-balancer.ts`](src/01-runtime-systems/networking/proxy-load-balancer.ts) |
| | Protocol Showdown | HTTP/1.1 vs HTTP/2 vs HTTP/3 vs WS vs gRPC | [`protocol-showdown.ts`](src/01-runtime-systems/protocols/protocol-showdown.ts) |
| | OS Context Switching & epoll/kqueue | Green threads vs OS threads, file locks | [`process-vs-thread.ts`](src/01-runtime-systems/os-fundamentals/process-vs-thread.ts) |
| | Go Companion Concurrency | 100,000 Goroutines vs OS threads bench | [`concurrency_bench.go`](src/companion-go/concurrency_bench.go) |
| | Live Server Troubleshooting | Bash script for CPU, FD leaks & zombie check | [`live-troubleshoot.sh`](src/scripts/live-troubleshoot.sh) |
| **2. APIs, Security & DBs** | RESTful Standards & Pagination | Keyset Cursor vs Offset benchmark | [`rest-controller.ts`](src/02-api-security-db/rest-standards/rest-controller.ts) |
| | Payment Idempotency Engine | Atomic locking & response cache replay | [`idempotency.ts`](src/02-api-security-db/rest-standards/idempotency.ts) |
| | GraphQL N+1 Problem & DataLoader | 9 DB queries reduced to 2 batched queries | [`graphql-engine.ts`](src/02-api-security-db/graphql-grpc/graphql-engine.ts) |
| | gRPC & Protocol Buffers | Binary wire encoding vs JSON benchmark | [`grpc-service.ts`](src/02-api-security-db/graphql-grpc/grpc-service.ts) |
| | Auth: Sessions vs JWT Rotation | Replay attack compromise detection | [`auth-service.ts`](src/02-api-security-db/auth-security/auth-service.ts) |
| | Authorization: RBAC vs ABAC | Contextual policy evaluation engine | [`access-control.ts`](src/02-api-security-db/auth-security/access-control.ts) |
| | OWASP Top 10 Mitigations | SQLi, NoSQLi, SSRF, IDOR, AES-GCM, bcrypt | [`owasp-lab.ts`](src/02-api-security-db/owasp-security/owasp-lab.ts) |
| | ACID Properties & Isolation Anomalies | Dirty, Non-repeatable & Phantom reads | [`acid-transactions.ts`](src/02-api-security-db/rdbms-acid/acid-transactions.ts) |
| | Concurrency Race Conditions | No Lock (Lost Update) vs Pessimistic vs Optimistic | [`locking-strategies.ts`](src/02-api-security-db/rdbms-acid/locking-strategies.ts) |
| | Database Performance Tuning | B-Tree/GIN indexes & HikariCP pool formula | [`index-tuning.ts`](src/02-api-security-db/db-tuning/index-tuning.ts) |
| | Polyglot Persistence & Dual-Mode Adapters | Live PostgreSQL (`pg`) & Redis (`ioredis`) + in-memory fallback | [`polyglot-manager.ts`](src/02-api-security-db/polyglot-storage/polyglot-manager.ts), [`dual-mode-adapters.ts`](src/02-api-security-db/adapters/dual-mode-adapters.ts) |
| **3. Architecture & Distributed** | Clean / Hexagonal Architecture & DDD | Aggregates, Value Objects, Ports & DI | [`clean-architecture.ts`](src/03-architecture-distributed/clean-architecture/clean-architecture.ts) |
| | System Patterns Trade-Offs | Monolith vs Modular Monolith vs Microservices | [`architecture-comparison.ts`](src/03-architecture-distributed/system-patterns/architecture-comparison.ts) |
| | Event-Driven Message Broker | ACK/NACK, Exponential Retries, DLQ & Dedup | [`message-broker.ts`](src/03-architecture-distributed/event-driven-broker/message-broker.ts) |
| | Transactional Outbox Pattern | Atomic DB write + event relay (Dual-write fix) | [`outbox-pattern.ts`](src/03-architecture-distributed/distributed-tx/outbox-pattern.ts) |
| | Saga Pattern Orchestrator | Forward execution & reverse compensation | [`saga-pattern.ts`](src/03-architecture-distributed/distributed-tx/saga-pattern.ts) |
| | Cache Stampede (Thundering Herd) | Singleflight Mutex vs Uncontrolled Stampede | [`caching-engine.ts`](src/03-architecture-distributed/caching-strategies/caching-engine.ts) |
| | CAP Theorem Split-Brain Simulation | CP (Consistency Quorum) vs AP (Divergence) | [`cap-theorem.ts`](src/03-architecture-distributed/distributed-theory/cap-theorem.ts) |
| | Eventual Consistency | Vector Clocks causality & PN-Counter CRDT | [`eventual-consistency.ts`](src/03-architecture-distributed/distributed-theory/eventual-consistency.ts) |
| | Consistent Hashing Ring | Virtual Nodes ring vs Modulo reshuffling | [`consistent-hashing.ts`](src/03-architecture-distributed/distributed-theory/consistent-hashing.ts) |
| **4. DevOps & Observability** | Rate Limiting Algorithms | Token Bucket burst vs Sliding Window Counter | [`rate-limiter.ts`](src/04-devops-reliability/resilience/rate-limiter.ts) |
| | Circuit Breaker & Fallbacks | State Machine (CLOSED -> OPEN -> HALF_OPEN) | [`circuit-breaker.ts`](src/04-devops-reliability/resilience/circuit-breaker.ts) |
| | Retries with Full Jitter | Eliminating synchronized retry storms | [`retry-backoff.ts`](src/04-devops-reliability/resilience/retry-backoff.ts) |
| | Graceful Shutdown Coordinator | SIGTERM draining & teardown hooks | [`graceful-shutdown.ts`](src/04-devops-reliability/resilience/graceful-shutdown.ts) |
| | Structured JSON Logging | Pino logger with Correlation ID propagation | [`logger.ts`](src/04-devops-reliability/observability/logger.ts) |
| | Prometheus RED Metrics | Counter, Histogram (p95/p99) & `/metrics` | [`metrics.ts`](src/04-devops-reliability/observability/metrics.ts) |
| | Distributed Tracing (OTel / Jaeger) | W3C `traceparent` & waterfall span spans | [`tracer.ts`](src/04-devops-reliability/observability/tracer.ts) |
| | Contract Testing & Load Stressing | Consumer-driven verification & Autocannon load | [`contract-testing.ts`](src/04-devops-reliability/testing/contract-testing.ts) |
| | Containerization & K8s | Multi-stage Dockerfile, Compose & K8s HPA | [`Dockerfile`](Dockerfile), [`k8s/`](k8s/) |
| | CI/CD Progressive Delivery | GitHub Actions with Canary rollout | [`ci-cd.yml`](.github/workflows/ci-cd.yml) |

---

## ⚡ Quick Start

### 1. Launch the Interactive Web Dashboard
Run the server and open the web dashboard in your browser:
```bash
npm start
```
Then visit: **`http://localhost:4000`**

### 2. Interactive Terminal CLI Runner
You can run any experiment or benchmark headless directly from your terminal:
```bash
# Interactive menu:
npm run lab

# Or run a specific experiment directly:
npm run lab 6    # Concurrency Race Condition (No Lock vs Pessimistic vs Optimistic)
npm run lab 9    # Cache Stampede Singleflight Benchmark
npm run lab 10   # Saga Distributed Transaction Rollback Simulation
npm run lab 11   # Consistent Hashing vs Modulo Reshuffle
npm run lab 12   # In-Process Stress Test (RPS & p95/p99 Latency)
npm run lab 13   # OpenTelemetry Distributed Trace Generation
```

### 3. Run the Automated Test Suite
Execute the full Vitest suite (56 tests covering all 4 pillars):
```bash
npm test
```

### 4. Run the Go Companion Concurrency Suite
Test 100,000 concurrent Goroutines vs OS threads:
```bash
npm run bench:go
```

### 5. Live Production Server Troubleshooting Script
Run the automated diagnostic tool to inspect CPU steal, memory pressure, open file descriptors, and socket states:
```bash
npm run troubleshoot
```

### 6. Full Container Stack (PostgreSQL, Redis, Prometheus, Grafana, Jaeger)
```bash
docker compose up -d
```
- **Web App:** `http://localhost:4000`
- **Prometheus:** `http://localhost:9090`
- **Grafana:** `http://localhost:3001` (user: `admin`, pass: `admin`)
- **Jaeger Tracing:** `http://localhost:16686`

---

## 🏛️ In-Depth Architectural Highlights

### 1. Concurrency Control: No Lock vs Pessimistic vs Optimistic
In [`locking-strategies.ts`](src/02-api-security-db/rdbms-acid/locking-strategies.ts), we simulate 30 concurrent withdrawals of $10 from an initial $1000 balance:
- **No Lock (Lost Update Anomaly):** Concurrent `Read-Modify-Write` cycles read the same initial balance and overwrite each other, causing the final balance to end at $990 instead of $700 ($290 lost!).
- **Pessimistic Locking (`SELECT ... FOR UPDATE`):** Acquires an exclusive row lock. Operations execute sequentially with 0 lost updates.
- **Optimistic Locking (`version` column):** Updates conditionally `WHERE id = ? AND version = ?`. If another transaction changed the version, it retries with exponential backoff. Provides maximum read concurrency with 0 lost updates.

### 2. Cache Stampede (Thundering Herd) & Singleflight Mutex
In [`caching-engine.ts`](src/03-architecture-distributed/caching-strategies/caching-engine.ts), when a hot cache key expires under 50 simultaneous requests:
- **Without Mutex:** All 50 requests experience a cache miss and execute 50 identical heavy database queries simultaneously.
- **With Singleflight Mutex:** The first request initiates the DB query; all other 49 concurrent requests attach to the in-flight promise, reducing database load from 50 queries down to **exactly 1 query (98% reduction)**.

### 3. Distributed Transactions: Outbox & Saga Patterns
- **Transactional Outbox ([`outbox-pattern.ts`](src/03-architecture-distributed/distributed-tx/outbox-pattern.ts)):** Solves the dual-write problem by saving the business record and the outbox event in the same atomic database transaction. Even if the message broker is temporarily offline, zero events are lost.
- **Saga Orchestrator ([`saga-pattern.ts`](src/03-architecture-distributed/distributed-tx/saga-pattern.ts)):** Manages multi-service workflows without 2-Phase Commit (2PC). When an downstream step fails (e.g., inventory reservation), the orchestrator automatically executes reverse compensating transactions (refunding payment and cancelling the order).

### 4. Distributed Systems Theory: CAP & Consistent Hashing
- **CAP Theorem ([`cap-theorem.ts`](src/03-architecture-distributed/distributed-theory/cap-theorem.ts)):** Simulates network partitions between cluster nodes. In **CP mode**, writes on partitioned nodes are rejected with 503 to maintain strong consistency. In **AP mode**, writes are accepted locally on both sides, causing divergence that requires reconciliation.
- **Consistent Hashing ([`consistent-hashing.ts`](src/03-architecture-distributed/distributed-theory/consistent-hashing.ts)):** Compares key migration when adding a node. Modulo hashing `hash(k) % N` reshuffles ~82% of all keys, whereas the Consistent Hashing Ring with 60 virtual nodes relocates only ~23% of keys (~1/N).

---

## 🛠️ Tech Stack & Prerequisites
- **Runtime:** Node.js v22 (native ESM, worker threads, asyncLocalStorage, crypto)
- **Language:** TypeScript 5.x with NodeNext module resolution
- **Testing:** Vitest
- **Telemetry:** Prometheus (`prom-client`), Pino structured JSON logger, OpenTelemetry W3C tracing
- **Companion:** Go 1.22+ (Goroutines vs OS threads benchmark)
- **Containerization:** Multi-stage Dockerfile, Docker Compose, Kubernetes manifests
