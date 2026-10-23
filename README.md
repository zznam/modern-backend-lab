# 🚀 Modern Backend Engineering Mastery Lab

[![Tests](https://github.com/zznam/modern-backend-lab/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/zznam/modern-backend-lab/actions/workflows/ci-cd.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](tsconfig.json)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green.svg)](package.json)
[![Go Companion](https://img.shields.io/badge/Go-1.22+-00ADD8.svg)](src/companion-go/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](Dockerfile)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-Manifests-326CE5.svg)](k8s/)

A hands-on learning platform for exploring modern backend engineering, high-availability architecture, concurrency, data integrity, and distributed systems at scale.

---

## 🧭 Syllabus & Concept Mapping

| Pillar | Core Topic | Live Runnable Lab | Implementation File |
| :--- | :--- | :--- | :--- |
| **1. Runtime & Systems** | Event Loop Phases & Microtasks | Observed event-loop phase trace | [`event-loop-demo.ts`](src/01-runtime-systems/event-loop/event-loop-demo.ts) |
| | Worker Threads vs CPU Lag | Event loop stall vs Worker pool | [`worker-pool.ts`](src/01-runtime-systems/worker-threads/worker-pool.ts) |
| | V8 Heap & Memory Leak Debugger | Live closure/emitter leak & GC detector | [`memory-leak-lab.ts`](src/01-runtime-systems/memory-gc/memory-leak-lab.ts) |
| | Data Structures (LRU, Ring, Heap, Bloom, Trie) | O(1) eviction, circular buffer, min-heap | [`data-structures.ts`](src/01-runtime-systems/data-structures/data-structures.ts) |
| | Networking (TCP/UDP, Handshake, Nagle) | Low-level sockets & TCP_NODELAY | [`tcp-udp-server.ts`](src/01-runtime-systems/networking/tcp-udp-server.ts) |
| | DNS Resolution & TTL | Hierarchy trace & cache invalidation | [`dns-resolver.ts`](src/01-runtime-systems/networking/dns-resolver.ts) |
| | TLS 1.2 vs 1.3 & ECDHE PFS | Ephemeral Diffie-Hellman key exchange | [`tls-handshake.ts`](src/01-runtime-systems/networking/tls-handshake.ts) |
| | L4 vs L7 Proxies & Load Balancers | Round Robin, Least Conns, IP Hash | [`proxy-load-balancer.ts`](src/01-runtime-systems/networking/proxy-load-balancer.ts) |
| | Protocol Showdown | HTTP/1.1 vs HTTP/2 vs HTTP/3 vs WS vs gRPC | [`protocol-showdown.ts`](src/01-runtime-systems/protocols/protocol-showdown.ts) |
| | OS Context Switching & epoll/kqueue | Green threads vs OS threads, file locks | [`process-vs-thread.ts`](src/01-runtime-systems/os-fundamentals/process-vs-thread.ts) |
| | Go Companion Concurrency | 100,000 parked goroutines; stack memory measurement | [`concurrency_bench.go`](src/companion-go/concurrency_bench.go) |
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
| | Event-Driven Message Broker | ACK/NACK, retry queues, DLQ & Dedup | [`message-broker.ts`](src/03-architecture-distributed/event-driven-broker/message-broker.ts) |
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
| | CI/CD Progressive Delivery | GitHub Actions with simulated Canary rollout | [`ci-cd.yml`](.github/workflows/ci-cd.yml) |
| **5. Advanced Systems** | Consensus, Quorum Loss & Log Repair | Partition an old leader, elect a majority, repair the log | [`consensus.ts`](src/05-advanced-systems/consensus.ts) |
| | Lease Expiry & Fencing Tokens | Reject a paused stale owner at the protected resource | [`fencing.ts`](src/05-advanced-systems/fencing.ts) |
| | Event Sourcing & CQRS | Version conflicts, projection lag, replay & deduplication | [`event-sourcing.ts`](src/05-advanced-systems/event-sourcing.ts) |
| | MVCC & Snapshot Write Skew | Cross-row invariant violation vs read-set validation | [`snapshot-isolation.ts`](src/05-advanced-systems/snapshot-isolation.ts) |
| | Backpressure & Load Shedding | Compare unbounded, cooperative, and rejecting queues | [`backpressure.ts`](src/05-advanced-systems/backpressure.ts) |
| | SLO Error Budgets & Burn Rates | Evaluate both 1-hour and 5-minute fast-burn windows | [`slo-burn.ts`](src/05-advanced-systems/slo-burn.ts) |
| | Replication Quorums & Read Repair | Trade read/write availability against quorum overlap and stale observations | [`replication-quorums.ts`](src/05-advanced-systems/replication-quorums.ts) |
| | LSM Trees, Tombstones & Compaction | Trace flushes, versioned lookups, deletion markers, and compaction work | [`lsm-compaction.ts`](src/05-advanced-systems/lsm-compaction.ts) |
| | Two-Phase Commit & Recovery | Inspect prepared participants, coordinator crashes, and durable decision replay | [`two-phase-commit.ts`](src/05-advanced-systems/two-phase-commit.ts) |
| | Event-Time Windows & Watermarks | Follow out-of-order events, late updates, cleanup, and side output | [`stream-watermarks.ts`](src/05-advanced-systems/stream-watermarks.ts) |

---

## ⚡ Quick Start

### 1. Launch the Interactive Web Dashboard
Install dependencies with Node.js 22.12+, 24, or 26+ (Node.js 22 LTS recommended), then start the dashboard:
```bash
npm ci
npm start
```
Then visit: **`http://localhost:4000`**. No external services are required: the lab uses in-memory adapters when database URLs are absent.

The dashboard includes **46 runnable topics**. Search by concept (for example, `raft`, `write skew`, or `watermarks`), filter by difficulty or completion, or choose a guided path: **Backend foundations**, **Distributed correctness**, **Production reliability**, or **Advanced data systems**. Every topic includes a learning objective, prerequisites, mechanics, production considerations, and a practice prompt. The ten advanced topics also include adjustable parameters, summary metrics, execution traces, and primary references.

The four new data-systems labs include **scenario presets** that populate the controls and explain what to look for before you run. Run an advanced lab twice to compare the previous and current parameters and metrics. Comparisons keep successful runs for each topic in memory during the current page session; reloading clears them.

Use **Mark complete** to track learning explicitly, **Next topic** to follow the chosen path, and **Copy topic link** to share a URL such as `http://localhost:4000/#consensus-quorum`. Completion, the selected path, and the last viewed topic are saved in browser local storage; a valid URL fragment takes precedence on load. Storage failures fall back to session-only progress. No learning history is sent to the server.

Open **Learning journey** in the header (or `/#journey`) for:

- **XP and levels:** 20 XP for the first successful run of each lab and 50 XP per marked completion, with a new level every 250 XP. Undoing completion removes its XP; toggles and repeated runs cannot duplicate rewards.
- **Daily quests:** choose a goal of 1, 3, or 5 distinct successful labs. Repeating the same lab on the same day counts once; revisiting it on another day counts toward that day's goal.
- **Streaks and activity:** switch between 7-day and 28-day activity views, see daily distinct-lab totals and personal bests (longest streak, active days, busiest day), plus a consecutive active-day count using the device's local calendar. Yesterday's streak remains available until the end of today. Failed or canceled runs do not count.
- **Path quests:** see all four guided paths, continue at the first unfinished lab, or revisit a completed path. Starting a quest clears conflicting search and difficulty filters.
- **Weekly missions:** run five distinct labs (+60 XP), practice on three distinct days (+80 XP), or run a lab at each difficulty level (+100 XP). Claim each eligible reward once during its local Monday–Sunday week. Progress resets on Monday; claimed bonuses remain earned. Missions suggest a relevant lab, and the habit mission tells you when to return tomorrow.
- **Scenario challenges:** accept one of three three-lab scenarios: **Weather the traffic spike**, **Protect the order**, or **Guard the API**. Successful runs after acceptance advance the active challenge in any order; repeated steps count once. Switch or pause without losing steps, resume at the next unfinished lab, and claim **120 XP once per challenge**. A tracker follows you into the lab. Revisit finished challenges without duplicating rewards.
- **Practice review:** revisit labs after **3, 7, or 14 local calendar days** since their last successful run. The queue shows the five oldest due labs and the total due count; finishing a review reschedules that lab. Reviews support daily goals and streaks without duplicating first-run XP. Earlier completions or runs without a recorded date are not scheduled.
- **Achievement showcase:** feature any earned badge at the top of your journey, replace it, or unpin it. Your selection survives reloads. If you undo the completion needed for that badge, it stays hidden until earned again. Section shortcuts let you jump to challenges, review, weekly missions, and achievements while keeping the journey URL.
- **Skill tracks:** see explored and completed counts for foundations, applied engineering, and advanced systems. Continue at the first unfinished lab, with conflicting filters cleared, or revisit a completed track.
- **Achievements:** ten milestones with earned/locked filters and visible requirements. New milestones reward a three-day best streak, a weekly claim, exploring all difficulty levels, and five advanced completions. Completion-based badges reflect current progress, including undo; historical streak and claim badges remain earned.
- **Quest hub:** six tabs add [56 documented gamification features](docs/GAMIFICATION.md), with 12 campaigns covering all 46 labs, 12 knowledge checks, daily featured labs, focus sprints, eight claimable milestones, and seven cosmetic rewards. Personalize a profile, earn coins, organize favorites and a practice queue, rate confidence, write searchable reflections, and inspect mastery, weekly goals, and monthly activity. The lab toolbar opens the current topic's notebook and shows active campaign/sprint progress. Successful runs advance the queue; failed or abandoned requests never advance quests.

Journey and quest progress share the existing browser-local learning record. Earlier completions automatically count toward XP; historical runs and dates are not invented. The original journey stores topic IDs, activity dates, preferences, and reward claims. Quest data also includes your optional alias, notes, confidence, queue, and cosmetics. No learning history or reflections are sent to a server, and experiment results are not persisted. A blocked or full local store falls back to session-only progress. Date-based goals refresh when the tab regains focus and once a minute while visible.

Use **Quest hub → Progress** to download a JSON backup or merge a supported backup of up to 200 KB. Backups include both journey progress and private reflections; keep them somewhere you trust. Resetting the quest hub requires a second confirmation and clears its profile, notes, and rewards while retaining the original journey's runs, completions, and bonuses. Rewards are derived from distinct learning actions and cannot be duplicated by repeat clicks or importing the same backup twice. These are personal learning records, not verified proficiency scores or a competitive leaderboard.

The server binds to `127.0.0.1` by default. Set `HOST=0.0.0.0` explicitly for containers or access from another device. `PORT` defaults to `4000`. The Docker image sets `HOST` automatically.

This is a local teaching lab with intentionally vulnerable examples and expensive experiments, without application authentication. Use a trusted development environment. Orders, sessions, and simulations live in process memory; multiple replicas do not share those stores.

For a compiled production-dependency smoke run:
```bash
npm run build
npm run start:prod
```
`npm start` uses the development TypeScript runner; `start:prod` uses compiled JavaScript. HTTP load testing is optional and its tool is loaded only by `npm run bench:load`, so it is not required by the production server.

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
npm run lab 14   # Consensus, Quorum Loss & Log Repair
npm run lab 15   # Lease Expiry & Fencing Tokens
npm run lab 16   # Event Sourcing, CQRS & Projection Replay
npm run lab 17   # Snapshot Isolation & Write Skew
npm run lab 18   # Backpressure & Load Shedding
npm run lab 19   # SLO Error Budgets & Multiwindow Burn Rates
npm run lab 20   # Replication Quorums & Read Repair
npm run lab 21   # LSM Trees, Tombstones & Compaction
npm run lab 22   # Two-Phase Commit & Coordinator Recovery
npm run lab 23   # Event-Time Windows, Watermarks & Late Data
```

### 3. Run the Automated Test Suite
Run the complete local validation gate (typecheck, unit/integration tests, and build):
```bash
npm run check
```
The HTTP integration suite starts an ephemeral local server and runs every dashboard module, custom advanced scenarios, order creation/replay, input rejection, metrics, readiness, and WebSocket echo. The local DOM suite tests search, combined filters, paths, completion persistence, deep links, prerequisite navigation, keyboard tabs, result rendering, stale responses, and storage failure using Happy DOM with external resources and network requests disabled/mocked. These DOM tests do not replace visual checks in a real browser. The memory-leak module intentionally emits a `MaxListenersExceededWarning` before cleaning up its listeners.

To include real PostgreSQL rollback, missing-account, and concurrent-transfer tests, provide a **disposable** test database (the tests reset the two seeded lab accounts):
```bash
TEST_DATABASE_URL=postgresql://lab_user:lab_password@localhost:5432/mastery_db npm test
```
PostgreSQL tests are skipped when `TEST_DATABASE_URL` is absent. Live Redis tests are optional too:
```bash
TEST_REDIS_URL=redis://127.0.0.1:6379 npm test
```
Use a disposable Redis instance; tests create uniquely prefixed short-lived values, locks, and a leaderboard. Both test URLs can be set together. Configured PostgreSQL and Redis failure paths also have isolated adapter tests.

To load-test an already-running local server:
```bash
npm run bench:load -- http://127.0.0.1:4000/api/v1/health
```
The external load report labels its available tail percentile as `latencyP97_5`; the in-process benchmark reports p95 and p99 from its own samples.

### 4. Run the Go Companion Concurrency Suite
Measure spawn time and stack memory with 100,000 goroutines alive at once. OS threads are discussed as context; the program does not create or measure 100,000 OS threads:
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
- **Jaeger UI:** `http://localhost:16686` (provisioned for exploration; the lab currently generates local simulated spans and does not export OTLP)

Compose ports are published on loopback only. Compose credentials are local examples. `/api/v1/ready` reports each adapter's mode and returns 503 when a configured service is unreachable. PostgreSQL schema initialization runs before the server accepts requests. Redis connects before live operations; visiting readiness first is unnecessary.

With no URL, each adapter uses the simulator. With `DATABASE_URL` or `REDIS_URL` configured, failed live operations return errors instead of switching to an unrelated in-memory store. PostgreSQL transfers lock both existing accounts in stable order, validate funds, and roll back simulated failures in the live transaction.

Optional environment variables:
- `DATABASE_URL`: PostgreSQL connection string; omitted for the ACID simulator.
- `REDIS_URL`: Redis connection string; omitted for the Redis simulator.
- `JWT_SECRET`: signing key for the token lab. If omitted, a random process-local key is generated; tokens are not portable across restarts.
- `LOG_LEVEL`: Pino verbosity, default `info`.
- `HOST`, `PORT`: listening address and port.

Copy `.env.example` if helpful. The app does not load `.env` automatically; export variables in your shell or use `node --env-file=.env dist/server.js` after building.

Kubernetes manifests require a built image, real service addresses, generated secrets, an ingress controller, and certificate setup. The workflow's canary job prints a deployment simulation; it does not deploy or validate a cluster. Its security-audit step currently permits audit failure. Infrastructure CI behavior has not been changed by this validation pass.

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
- **Transactional Outbox ([`outbox-pattern.ts`](src/03-architecture-distributed/distributed-tx/outbox-pattern.ts)):** Solves the dual-write problem by saving the business record and the outbox event in the same atomic database transaction. Even if the message broker is temporarily offline, pending events remain available for the next relay call in this in-memory simulation. Process restarts still lose simulation state.
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


## API behavior and teaching boundaries

- All 46 dashboard navigation items have runnable handlers. Results return after the experiment completes; there is no SSE stream. `/ws` is a separate echo demonstration.
- `POST /api/experiments/run` requires an `experimentId` string and optional object `params`. Numeric controls are checked on the server (up to 80,000 primes, 100 concurrent tasks, 5,000 requests/keys, or 100,000 serialization iterations). At most two experiments run concurrently; additional runs receive 429 and `Retry-After`.
- `GET /api/v1/orders` accepts `limit` 1–100, a nonnegative `offset`, a valid `status`, or a base64 order-ID `cursor`. Cursor pages seek the first greater key even when filtering excludes the cursor row. The array simulation still pays for filtering; a real database needs an appropriate index.
- `POST /api/v1/orders` requires a nonempty `customerName` (maximum 200 characters) and finite positive `amount`. An optional `Idempotency-Key` replays the original response for the same payload; changed payloads receive 422. The in-memory key cache expires after 60 seconds and does not coordinate replicas.
- Request bodies and WebSocket payloads are limited to 64 KiB. API errors use JSON, correlation IDs are bounded, and unknown paths share a single Prometheus route label.
- SIGINT/SIGTERM start bounded draining, reject new HTTP work with 503, close WebSockets, and release database connections. Cleanup failures produce a nonzero exit.
- The SSRF lab performs static URL/IP checks only. A real HTTP client must validate DNS results, redirects, and the destination at connection time. The token lab revokes refresh-token families on replay; already-issued access JWTs retain their signed lifetime.
- The broker, outbox, CAP, GraphQL batching, and tracing examples are teaching simulations. The broker requeues retries immediately; the retry-backoff module demonstrates delay calculations separately. Redis locking uses one Redis instance with ownership tokens, not the multi-node Redlock algorithm.
- Serialization compares JSON-to-UTF-8 encoding with a minimal protobuf wire encoder; it does not run a gRPC server. Worker lag is measured from timer delays and varies by hardware and scheduler.

### Advanced model boundaries and suggested experiments

The advanced labs are deterministic in-memory models with logical schedules; they do not start a consensus cluster, persist an event store, run PostgreSQL SSI, execute real streams, or install live alert rules. Each result includes its model boundary next to the trace.

- **Consensus:** With 5 members, change reachable voters from 2 to 3. A majority is based on fixed membership even when nodes are unavailable. This scripted Raft-inspired scenario begins with equal committed logs; it does not implement arbitrary leader elections, durable votes, or membership changes. See the [Raft paper](https://raft.github.io/raft.pdf).
- **Fencing:** Compare worker pauses of 999 and 1000 ms against a 1000 ms lease. A newer accepted token fences the stale owner; checking the token must be atomic with the resource write. See [Martin Kleppmann on distributed locking](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html).
- **Event sourcing:** Query after 0–3 projected events, then inspect catch-up and duplicate replay. Checkpoints assume one ordered aggregate stream. Projection writes and checkpoints require atomic persistence in production. See [Microsoft's Event Sourcing pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing).
- **Snapshot isolation:** Compare 2 and 3 on-call doctors. Stable snapshots can still permit write skew across different rows. The comparison validates the complete read set conservatively and retries with fresh state; it is not PostgreSQL's SSI algorithm. See [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html).
- **Backpressure:** Change offered jobs, service capacity, and queue size. Admission precedes service on each of 12 ticks. Deferred demand stays upstream rather than entering a second local queue. See [Node.js stream backpressure](https://nodejs.org/en/learn/modules/backpressuring-in-streams).
- **SLOs:** With a 99.9% SLO, 2% errors produce 20× burn. Set the short-window errors to zero to suppress the fast-burn page while the long window stays elevated. The 14.4× threshold applies to a 1-hour/5-minute pair and a 30-day request-based SLO; the budget-spend estimate assumes constant request volume. Slower-burn policies remain necessary. See the [Google SRE Workbook](https://sre.google/workbook/alerting-on-slos/).
- **Replication quorums:** Compare R=1/W=1 with R=2/W=2 across three fixed replicas. Reads deliberately select stale replicas first; overlapping successful quorums reveal the latest acknowledged write in this single-writer schedule. Read repair updates only responding replicas. An unavailable write is rejected before dispatch in this model; real timed-out writes may partially apply. Quorum overlap alone does not establish linearizability under concurrency. See [Cassandra's Dynamo architecture](https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html).
- **LSM compaction:** Toggle compaction and vary the memtable threshold to compare sorted runs, lookup probes, and logical write work. Deletion markers must survive partial compaction when older data remains outside the merge. The full merge can discard them only after covering all runs with no pending memtable. This model has no disk, WAL, snapshots, compression, or background scheduler, so its counters are not storage benchmarks. See the [RocksDB overview](https://github.com/facebook/rocksdb/wiki/RocksDB-Overview) and [compaction documentation](https://github.com/facebook/rocksdb/wiki/Compaction).
- **Two-phase commit:** Crash the coordinator after prepare, then after its durable commit record. Prepared participants retain locks while the coordinator is unavailable. On recovery, an absent decision aborts in this presumed-abort model, while a recorded decision is replayed idempotently. A no vote prevents commit. The journal is represented in memory; no process or database actually crashes. See [PostgreSQL prepared transactions](https://www.postgresql.org/docs/16/sql-prepare-transaction.html).
- **Stream watermarks:** Compare zero lateness with retained windows that accept late updates. Events enter 10-second half-open windows; the monotonic watermark follows the maximum observed event time minus the lag. Admission uses the previous watermark, emission occurs at the window end, and cleanup occurs at end plus allowed lateness. Updates replace the prior window aggregate rather than adding a second result. A final drain closes remaining windows. This single-input model omits partition coordination, idle sources, checkpoints, and delivery guarantees. See [Flink's window lifecycle](https://nightlies.apache.org/flink/flink-docs-master/docs/dev/datastream/operators/windows/).

Advanced HTTP controls are bounded integers: odd `clusterSize` 3–9, `availableNodes` 1–8 and smaller than the cluster, `pauseMs` 0–20,000, `projectionBatch` 0–3, `onCallDoctors` 2–10, queue rates/capacity 1–100, `sloBasisPoints` 9,000–9,999, and error ratios 0–10,000 basis points (100 bp = 1%). API defaults match the dashboard defaults. Each run constructs fresh state.

Data-systems controls are also bounded integers: `readQuorum`/`writeQuorum` 1–3, `failedReplicas` 0–2, `memtableLimit` 2–6, `compaction` 0–1, `crashPoint` 0–2, `rejectVote` 0–1, and `watermarkLag`/`allowedLateness` 0–20 seconds. Zero values select valid scenarios and are preserved by the API. CLI entries 20–23 use the dashboard defaults.


Event-loop ordering notes follow the [Node.js process documentation](https://nodejs.org/api/process.html#when-to-use-queuemicrotask-vs-processnexttick) and [event-loop guide](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick). The I/O comparison describes ready-event delivery, as documented by [epoll(7)](https://man7.org/linux/man-pages/man7/epoll.7.html) and [epoll_wait(2)](https://man7.org/linux/man-pages/man2/epoll_wait.2.html), without claiming that event copies use mmap or shared memory.

The Docker health probe uses IPv4 loopback to match the container listener. Grafana queries use the exported `backend_lab_` Node.js metric prefix, aggregate histogram buckets before quantiles, and calculate error percentages against total request rates.
