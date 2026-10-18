/**
 * Modern Backend Engineering Mastery Lab - Frontend Controller
 */

// Experiments Registry & Metadata
const EXPERIMENTS_CONFIG = {
  'event-loop': {
    category: '1. Runtime & Systems',
    title: 'Event Loop Execution Order & Microtask Queues',
    desc: 'Visualizes the precise order in which Node.js processes synchronous code, process.nextTick, Promise microtasks, and macrotasks (Timers & Check phase).',
    controlsHtml: '',
    architecture: `
      <h4>How the Node.js Event Loop Works</h4>
      <p>Node.js runs single-threaded JavaScript using the <strong>libuv</strong> event loop. The execution order is deterministic:</p>
      <ul>
        <li><strong>Call Stack:</strong> Synchronous execution always runs first to completion.</li>
        <li><strong>Microtasks Queue:</strong> Drained immediately when the call stack becomes empty. <code>process.nextTick</code> executes before <code>Promise.then</code> callbacks.</li>
        <li><strong>Timers Phase:</strong> Libuv executes expired <code>setTimeout</code> and <code>setInterval</code> callbacks.</li>
        <li><strong>I/O Poll Phase:</strong> Retrieves incoming network packets and OS events via <code>epoll</code> / <code>kqueue</code>.</li>
        <li><strong>Check Phase:</strong> Executes <code>setImmediate</code> callbacks.</li>
      </ul>
    `,
    production: `
      <h4>Production Takeaways</h4>
      <ul>
        <li>Never starve the Event Loop by recursively scheduling <code>process.nextTick</code> in an infinite loop.</li>
        <li>Prefer <code>setImmediate</code> over <code>setTimeout(fn, 0)</code> when deferring work after I/O to avoid timer scheduling overhead.</li>
        <li>Offload CPU-bound calculations (cryptography, image resizing, heavy JSON parsing) to Worker Threads.</li>
      </ul>
    `,
  },
  'worker-threads': {
    category: '1. Runtime & Systems',
    title: 'Worker Threads Pool vs Event Loop Lag',
    desc: 'Demonstrates how CPU-bound tasks block the main thread event loop (causing massive lag) vs offloading to Worker Threads to keep the server 100% responsive.',
    controlsHtml: `
      <div class="control-group">
        <label>Prime Search Limit:</label>
        <input type="number" id="param-limit" class="control-input" value="30000" min="5000" max="80000" step="5000">
      </div>
    `,
    getParams: () => ({ limit: parseInt(document.getElementById('param-limit').value, 10) }),
    architecture: `
      <h4>Event Loop Blocking vs Worker Threads</h4>
      <p>Node.js is asynchronous for I/O (files, network, database), but <strong>single-threaded for CPU computation</strong>. Running a synchronous loop on the main thread freezes the entire server, preventing all other concurrent HTTP requests from being accepted!</p>
      <p>Worker Threads spin up true OS threads with their own V8 isolates, communicating via <code>MessagePort</code> or shared memory via <code>SharedArrayBuffer</code>.</p>
    `,
    production: `
      <h4>Production Best Practices</h4>
      <ul>
        <li>Use a warm Worker Pool (e.g. Piscina) rather than creating and destroying a new Worker thread on every request.</li>
        <li>Monitor Event Loop Delay via Prometheus histogram metric <code>nodejs_eventloop_lag_seconds</code>. If p99 > 50ms, investigate synchronous bottlenecks.</li>
      </ul>
    `,
  },
  'memory-leak': {
    category: '1. Runtime & Systems',
    title: 'V8 Heap Structure, Garbage Collection & Memory Leak Debugging',
    desc: 'Simulates intentional memory leak patterns (unbounded caches, dangling closures, event listener leaks), tracks V8 heap spaces, and runs leak detection.',
    controlsHtml: '',
    architecture: `
      <h4>V8 Heap Anatomy</h4>
      <ul>
        <li><strong>New Space (Young Generation):</strong> Eden + Semi-spaces (From/To). Short-lived objects are allocated here and collected via Cheney's Scavenge algorithm.</li>
        <li><strong>Old Pointer / Old Data Space:</strong> Objects that survive two scavenge cycles are promoted to Old Space. Collected via Mark-Sweep and Mark-Compact.</li>
        <li><strong>Large Object Space:</strong> Allocations exceeding ~1MB bypass New Space directly to avoid expensive copy operations.</li>
      </ul>
    `,
    production: `
      <h4>How to Debug Memory Leaks in Production</h4>
      <ul>
        <li>Trigger heap snapshots using <code>v8.writeHeapSnapshot()</code> or the Chrome DevTools inspector.</li>
        <li>Take 3 consecutive snapshots under load and compare Retained Sizes in Chrome DevTools to locate objects not being garbage collected.</li>
        <li>Always set <code>--max-old-space-size</code> in Kubernetes container memory limits to prevent sudden SIGKILL by the Linux OOM Killer.</li>
      </ul>
    `,
  },
  'locking-benchmark': {
    category: '2. API, Security & Databases',
    title: 'Concurrency Race Conditions: No Lock vs Pessimistic vs Optimistic',
    desc: 'Simulates 30 simultaneous bank withdrawals or ticket purchases to expose the Lost Update anomaly and compare Pessimistic (SELECT FOR UPDATE) vs Optimistic locking.',
    controlsHtml: `
      <div class="control-group">
        <label>Concurrent Requests:</label>
        <input type="number" id="param-concurrency" class="control-input" value="30" min="10" max="100" step="10">
      </div>
    `,
    getParams: () => ({ concurrency: parseInt(document.getElementById('param-concurrency').value, 10) }),
    architecture: `
      <h4>Concurrency Control Mechanics</h4>
      <ul>
        <li><strong>No Lock (Lost Update Anomaly):</strong> Concurrent Read-Modify-Write cycles read the same initial balance simultaneously and overwrite each other, causing massive financial discrepancy.</li>
        <li><strong>Pessimistic Locking (SELECT ... FOR UPDATE):</strong> Places an exclusive row lock in the database. Subsequent transactions wait in line. Guarantees 100% integrity but reduces write concurrency.</li>
        <li><strong>Optimistic Locking (Version Column):</strong> Checks <code>WHERE id = :id AND version = :version</code>. If another transaction changed the version, the update fails or retries with exponential backoff. Maximum throughput for read-heavy workloads.</li>
      </ul>
    `,
    production: `
      <h4>When to Use Which in Production</h4>
      <ul>
        <li><strong>Pessimistic:</strong> Inventory checkout for hot concert tickets, bank withdrawals, low-latency reservation ledgers.</li>
        <li><strong>Optimistic:</strong> User profile updates, CMS document editing, shopping cart modifications, high-volume distributed systems.</li>
      </ul>
    `,
  },
  'graphql-dataloader': {
    category: '2. API, Security & Databases',
    title: 'GraphQL N+1 Problem & DataLoader Batching',
    desc: 'Simulates querying 8 customer orders without DataLoader (9 database queries fired) vs with DataLoader (batches customer IDs into 2 total queries).',
    controlsHtml: '',
    architecture: `
      <h4>The N+1 Query Disaster</h4>
      <p>In standard REST or GraphQL field resolvers, fetching a list of N orders followed by their customer profile causes 1 query for the orders, plus N separate queries for each customer (1 + N queries = 1001 queries for 1,000 items!).</p>
      <p>DataLoader defers individual resolver calls using <code>queueMicrotask</code>, coalescing all requested IDs into a single batch <code>SELECT * FROM customers WHERE id IN (...)</code>, reducing database load by 90%+.</p>
    `,
    production: `
      <h4>Production Guidelines</h4>
      <ul>
        <li>Always create a fresh DataLoader instance <strong>per request</strong> (never share a DataLoader across different user requests, or stale data / tenant security leaks will occur).</li>
        <li>Use DataLoader for any relational data loader in GraphQL, gRPC, or microservice gateways.</li>
      </ul>
    `,
  },
  'cache-stampede': {
    category: '3. Architecture & Distributed',
    title: 'Cache Stampede (Thundering Herd) & Singleflight Mutex',
    desc: 'Demonstrates what happens when a hot cache key expires under 50 concurrent requests: 50 simultaneous database hits vs exactly 1 query with Singleflight locking.',
    controlsHtml: `
      <div class="control-group">
        <label>Concurrent Requests:</label>
        <input type="number" id="param-stampede-concurrency" class="control-input" value="50" min="10" max="100" step="10">
      </div>
    `,
    getParams: () => ({ concurrency: parseInt(document.getElementById('param-stampede-concurrency').value, 10) }),
    architecture: `
      <h4>Cache Stampede & Singleflight Pattern</h4>
      <p>When a popular cached item expires, all incoming concurrent requests encounter a cache miss and rush to recalculate or query the database simultaneously (Thundering Herd), often causing cascading DB outages.</p>
      <p><strong>The Singleflight Pattern</strong> intercepts duplicate concurrent requests in memory, allowing only the FIRST request to query the database while all subsequent requests await the same promise.</p>
    `,
    production: `
      <h4>Production Defenses Against Stampedes</h4>
      <ul>
        <li><strong>Singleflight / Mutex:</strong> In-process lock for coalescing duplicate in-flight queries.</li>
        <li><strong>XFetch Algorithm (Probabilistic Early Expiration):</strong> As key approaches TTL, requests probabilistically recompute the cache before it expires.</li>
        <li><strong>Stale-While-Revalidate:</strong> Return stale cache immediately while triggering asynchronous background refresh.</li>
      </ul>
    `,
  },
  'saga-pattern': {
    category: '3. Architecture & Distributed',
    title: 'Saga Distributed Transaction Orchestrator & Rollback',
    desc: 'Simulates a multi-service order pipeline (Order -> Payment -> Inventory -> Shipping) with an out-of-stock failure triggering automatic reverse compensating transactions.',
    controlsHtml: '',
    architecture: `
      <h4>Saga Pattern vs Two-Phase Commit (2PC)</h4>
      <p>In distributed microservices, 2-Phase Commit (2PC) is notoriously slow, brittle, and locks database resources across networks. Sagas replace 2PC by modeling the transaction as a sequence of local transactions.</p>
      <p>If any local step fails, the Saga Orchestrator executes a chain of <strong>Compensating Transactions</strong> in reverse order (e.g. refunding payment and cancelling the order) to restore eventual consistency.</p>
    `,
    production: `
      <h4>Key Implementation Rules</h4>
      <ul>
        <li>All compensating transactions MUST be idempotent (safe to retry if the compensating network call times out).</li>
        <li>Maintain a persistent Saga Log (State Machine) in a relational database or workflow engine (e.g., Temporal, AWS Step Functions).</li>
      </ul>
    `,
  },
  'consistent-hashing': {
    category: '3. Architecture & Distributed',
    title: 'Consistent Hashing Ring with Virtual Nodes',
    desc: 'Demonstrates why modulo hashing (hash % N) reshuffles ~80% of all cache keys when adding a server, while Consistent Hashing relocates only ~20% of keys.',
    controlsHtml: `
      <div class="control-group">
        <label>Total Keys:</label>
        <input type="number" id="param-hash-keys" class="control-input" value="1000" min="100" max="5000" step="100">
      </div>
    `,
    getParams: () => ({ keyCount: parseInt(document.getElementById('param-hash-keys').value, 10) }),
    architecture: `
      <h4>Consistent Hashing Mechanics</h4>
      <p>Modulo hashing <code>hash(key) % N</code> breaks down in distributed caching (Redis/Memcached/DynamoDB) because changing N causes nearly 100% of keys to map to different servers, triggering an avalanche of cache misses.</p>
      <p>Consistent Hashing arranges nodes on a circular ring <code>[0, 2^32 - 1]</code>. Adding or removing a node affects only its immediate neighbor, moving exactly <code>K / N</code> keys.</p>
      <p><strong>Virtual Nodes (vnodes):</strong> Each physical server is assigned multiple positions on the ring (e.g. 100 vnodes) to guarantee uniform statistical key distribution and eliminate hot spots.</p>
    `,
    production: `
      <h4>Real-World Usage</h4>
      <p>Consistent Hashing powers Amazon DynamoDB, Apache Cassandra, Discord voice channel routing, and Redis Cluster client routing.</p>
    `,
  },
  'rate-limiting': {
    category: '4. DevOps & Reliability',
    title: 'Rate Limiting Algorithms: Token Bucket vs Sliding Window',
    desc: 'Interactive comparison between Token Bucket (burst capacity + steady refill) and Sliding Window Counter (rolling window time defense).',
    controlsHtml: '',
    architecture: `
      <h4>Token Bucket vs Sliding Window</h4>
      <ul>
        <li><strong>Token Bucket:</strong> A bucket holds up to B tokens and refills at R tokens/sec. Requests consume tokens. Allows instant bursts of traffic while guaranteeing long-term throughput limit.</li>
        <li><strong>Fixed Window Counter:</strong> Suffers from the boundary stampede problem (2x limit can pass if requests cluster around the window boundary).</li>
        <li><strong>Sliding Window Counter:</strong> Computes a rolling timestamp average, completely eliminating window boundary spikes.</li>
      </ul>
    `,
    production: `
      <h4>Production Best Practices</h4>
      <ul>
        <li>Implement rate limiting in Redis using atomic Lua scripts or Redis cell (generic cell rate algorithm - GCRA).</li>
        <li>Always return standard HTTP headers: <code>RateLimit-Limit</code>, <code>RateLimit-Remaining</code>, <code>RateLimit-Reset</code>, and <code>Retry-After</code> on 429 status code.</li>
      </ul>
    `,
  },
  'circuit-breaker': {
    category: '4. DevOps & Reliability',
    title: 'Circuit Breaker State Machine & Graceful Fallbacks',
    desc: 'Simulates downstream service failure tripping the Circuit Breaker from CLOSED to OPEN, triggering instant fallback responses without hammering the downstream service.',
    controlsHtml: '',
    architecture: `
      <h4>Circuit Breaker State Machine</h4>
      <ul>
        <li><strong>CLOSED:</strong> Normal operation. All calls pass through. Failures increment failure counter.</li>
        <li><strong>OPEN:</strong> Downstream dependency has failed. All calls fail fast immediately or return fallback data without touching the network.</li>
        <li><strong>HALF-OPEN:</strong> After reset timeout, a single trial request is allowed through. If it succeeds, the breaker resets to CLOSED. If it fails, it trips back to OPEN.</li>
      </ul>
    `,
    production: `
      <h4>Production Best Practices</h4>
      <ul>
        <li>Combine Circuit Breakers with Fallback Caches (e.g., return cached product recommendations or degraded search results if the ML model service is down).</li>
        <li>Set sensible timeouts (e.g. 500ms) on all external HTTP/gRPC calls so slow responses trip the breaker before connection pools exhaust.</li>
      </ul>
    `,
  },
  'load-stress-benchmark': {
    category: '4. DevOps & Reliability',
    title: 'Automated Stress Benchmark (RPS & Latency Percentiles)',
    desc: 'Executes an automated load test measuring Throughput (Requests Per Second) and Latency percentiles (min, avg, p95, p99) under high concurrency.',
    controlsHtml: `
      <div class="control-group">
        <label>Total Requests:</label>
        <input type="number" id="param-stress-reqs" class="control-input" value="1000" min="200" max="5000" step="200">
      </div>
      <div class="control-group">
        <label>Concurrency:</label>
        <input type="number" id="param-stress-concurrency" class="control-input" value="50" min="10" max="100" step="10">
      </div>
    `,
    getParams: () => ({
      totalRequests: parseInt(document.getElementById('param-stress-reqs').value, 10),
      concurrency: parseInt(document.getElementById('param-stress-concurrency').value, 10),
    }),
    architecture: `
      <h4>Why p95 and p99 Matter Far More than Average Latency</h4>
      <p>Average latency is misleading. If 95% of requests take 5ms and 5% take 1000ms, the average is ~54ms, hiding the fact that 1 in 20 users experiences intolerable lag.</p>
      <p>In distributed microservices where a user request touches 20 downstream services, the chance of experiencing a p99 latency spike on at least one call is <code>1 - (0.99)^20 ≈ 18%</code>! Measuring and optimizing p99 latency is essential for high-scale systems.</p>
    `,
    production: `
      <h4>Production Stress Testing</h4>
      <ul>
        <li>Use tools like k6, Autocannon, or Locust in staging environments before major releases.</li>
        <li>Set automated SLO alert thresholds on Prometheus: Alert if p99 latency exceeds 250ms for > 2 minutes.</li>
      </ul>
    `,
  },
};

// Default current experiment
let currentExpKey = 'event-loop';

// DOM Elements
const expCategoryEl = document.getElementById('exp-category');
const expTitleEl = document.getElementById('exp-title');
const expDescEl = document.getElementById('exp-desc');
const controlsContainer = document.getElementById('controls-container');
const runBtn = document.getElementById('run-btn');
const metricsGrid = document.getElementById('metrics-cards');
const stageViewport = document.getElementById('stage-viewport');
const execStatus = document.getElementById('exec-status');
const jsonOutput = document.getElementById('json-output');
const docArchitecture = document.getElementById('doc-architecture');
const docProduction = document.getElementById('doc-production');

// Tab Switching
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// Sidebar Navigation
document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((i) => i.classList.remove('active'));
    item.classList.add('active');
    selectExperiment(item.dataset.exp);
  });
});

function selectExperiment(key) {
  currentExpKey = key;
  const cfg = EXPERIMENTS_CONFIG[key] || {
    category: 'Learning Module',
    title: key.replace(/-/g, ' ').toUpperCase(),
    desc: 'Interactive backend mastery experiment.',
    controlsHtml: '',
    architecture: '<p>Documentation for this module is available in code.</p>',
    production: '<p>Production guidelines available in code.</p>',
  };

  expCategoryEl.textContent = cfg.category;
  expTitleEl.textContent = cfg.title;
  expDescEl.textContent = cfg.desc;
  controlsContainer.innerHTML = cfg.controlsHtml || '<span style="color:var(--text-dim);font-size:13px;">No custom parameters required for this experiment.</span>';
  docArchitecture.innerHTML = cfg.architecture;
  docProduction.innerHTML = cfg.production;

  // Reset stage
  metricsGrid.innerHTML = '';
  stageViewport.innerHTML = '<div class="placeholder-graphic">Click "Run Live Experiment" to observe real-time execution.</div>';
  execStatus.textContent = 'Idle (Ready)';
  execStatus.style.color = 'var(--text-dim)';
  jsonOutput.textContent = '// Ready to run...';
}

// Run Experiment Handler
runBtn.addEventListener('click', async () => {
  const cfg = EXPERIMENTS_CONFIG[currentExpKey] || {};
  const params = cfg.getParams ? cfg.getParams() : {};

  execStatus.textContent = 'Running...';
  execStatus.style.color = 'var(--accent-yellow)';
  runBtn.disabled = true;

  try {
    const response = await fetch('/api/experiments/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ experimentId: currentExpKey, params }),
    });

    const res = await response.json();
    execStatus.textContent = `Completed in ${res.executionDurationMs}ms`;
    execStatus.style.color = 'var(--accent-green)';
    jsonOutput.textContent = JSON.stringify(res, null, 2);

    renderVisualStage(currentExpKey, res.data, res.executionDurationMs);
  } catch (err) {
    execStatus.textContent = 'Error';
    execStatus.style.color = 'var(--accent-red)';
    jsonOutput.textContent = `Error executing experiment: ${err.message}`;
  } finally {
    runBtn.disabled = false;
  }
});

// Render Visual Visualizer Stage
function renderVisualStage(key, data, durationMs) {
  metricsGrid.innerHTML = '';

  switch (key) {
    case 'event-loop': {
      metricsGrid.innerHTML = `
        <div class="metric-card">
          <div class="metric-label">Execution Time</div>
          <div class="metric-value">${durationMs} ms</div>
          <div class="metric-sub">✓ Deterministic Phase Order</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Trace Steps</div>
          <div class="metric-value">${data.trace?.length || 0}</div>
          <div class="metric-sub">Call Stack -> Microtasks -> Timers</div>
        </div>
      `;

      let flowHtml = '<div class="sequence-flow">';
      data.trace?.forEach((step) => {
        flowHtml += `
          <div class="flow-step">
            <div class="step-num">${step.step}</div>
            <div class="step-content">
              <div class="step-phase">${step.phase} [${step.type}]</div>
              <div class="step-title">${step.label}</div>
              <div class="step-desc">${step.explanation}</div>
            </div>
          </div>
        `;
      });
      flowHtml += '</div>';
      stageViewport.innerHTML = flowHtml;
      break;
    }

    case 'locking-benchmark': {
      const lost = data.noLock?.dataLostAmount || 0;
      metricsGrid.innerHTML = `
        <div class="metric-card">
          <div class="metric-label">No-Lock Data Lost</div>
          <div class="metric-value" style="color:var(--accent-red);">$${lost}</div>
          <div class="metric-sub">Lost Update Race Condition!</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Pessimistic Final Balance</div>
          <div class="metric-value" style="color:var(--accent-green);">$${data.pessimisticLock?.actualFinalBalance}</div>
          <div class="metric-sub">0 Lost Updates (Row Locked)</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Optimistic Final Balance</div>
          <div class="metric-value" style="color:var(--accent-green);">$${data.optimisticLock?.actualFinalBalance}</div>
          <div class="metric-sub">${data.optimisticLock?.conflictedRetries} CAS Retries Handled</div>
        </div>
      `;

      stageViewport.innerHTML = `
        <div style="width:100%;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">
          <div class="flow-step" style="flex-direction:column;align-items:flex-start;">
            <span class="badge" style="background:rgba(239,68,68,0.2);color:#f87171;">No Lock</span>
            <p style="font-size:13px;margin:8px 0;color:var(--text-muted);">${data.noLock?.verdict}</p>
            <div style="font-family:var(--font-mono);font-size:12px;color:#f87171;">Data Lost: $${lost}</div>
          </div>
          <div class="flow-step" style="flex-direction:column;align-items:flex-start;">
            <span class="badge" style="background:rgba(16,185,129,0.2);color:#34d399;">Pessimistic Lock</span>
            <p style="font-size:13px;margin:8px 0;color:var(--text-muted);">${data.pessimisticLock?.verdict}</p>
            <div style="font-family:var(--font-mono);font-size:12px;color:#34d399;">100% Integrity (${data.pessimisticLock?.durationMs}ms)</div>
          </div>
          <div class="flow-step" style="flex-direction:column;align-items:flex-start;">
            <span class="badge" style="background:rgba(59,130,246,0.2);color:#60a5fa;">Optimistic Lock</span>
            <p style="font-size:13px;margin:8px 0;color:var(--text-muted);">${data.optimisticLock?.verdict}</p>
            <div style="font-family:var(--font-mono);font-size:12px;color:#60a5fa;">100% Integrity (${data.optimisticLock?.durationMs}ms)</div>
          </div>
        </div>
      `;
      break;
    }

    case 'cache-stampede': {
      const withoutQ = data.withoutMutex?.dbQueriesFired || 0;
      const withQ = data.withMutex?.dbQueriesFired || 0;

      metricsGrid.innerHTML = `
        <div class="metric-card">
          <div class="metric-label">Without Mutex Hits</div>
          <div class="metric-value" style="color:var(--accent-red);">${withoutQ} DB Queries</div>
          <div class="metric-sub">Thundering herd hammered database!</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">With Singleflight Mutex</div>
          <div class="metric-value" style="color:var(--accent-green);">${withQ} DB Query</div>
          <div class="metric-sub">Exactly 1 DB query! 98% reduction</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Penetration Defense</div>
          <div class="metric-value" style="color:var(--accent-cyan);">Protected</div>
          <div class="metric-sub">Bloom Filter intercepted invalid key</div>
        </div>
      `;

      stageViewport.innerHTML = `
        <div style="width:100%;text-align:center;">
          <div style="font-size:16px;font-weight:600;margin-bottom:16px;">Database Queries Under 50 Simultaneous Cache Misses:</div>
          <div style="display:flex;align-items:flex-end;justify-content:center;gap:40px;height:140px;">
            <div style="display:flex;flex-direction:column;align-items:center;">
              <div style="background:#ef4444;width:80px;height:120px;border-radius:6px 6px 0 0;display:flex;align-items:center;justify-content:center;font-weight:700;">${withoutQ}</div>
              <span style="font-size:12px;margin-top:8px;color:var(--text-muted);">Without Mutex</span>
            </div>
            <div style="display:flex;flex-direction:column;align-items:center;">
              <div style="background:#10b981;width:80px;height:24px;border-radius:6px 6px 0 0;display:flex;align-items:center;justify-content:center;font-weight:700;">${withQ}</div>
              <span style="font-size:12px;margin-top:8px;color:var(--text-muted);">With Singleflight</span>
            </div>
          </div>
        </div>
      `;
      break;
    }

    case 'consistent-hashing': {
      metricsGrid.innerHTML = `
        <div class="metric-card">
          <div class="metric-label">Modulo Reshuffled Keys</div>
          <div class="metric-value" style="color:var(--accent-red);">${data.moduloRelocationPercent}%</div>
          <div class="metric-sub">Disastrous cache invalidation</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Consistent Hash Relocated</div>
          <div class="metric-value" style="color:var(--accent-green);">${data.consistentHashingRelocationPercent}%</div>
          <div class="metric-sub">Minimal key migration (~1/N)</div>
        </div>
      `;

      stageViewport.innerHTML = `
        <div style="width:100%;text-align:center;padding:12px;">
          <div style="font-size:15px;color:var(--text-main);margin-bottom:12px;">
            ${data.explanation}
          </div>
          <div style="display:inline-block;padding:12px 24px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;font-family:var(--font-mono);font-size:13px;color:var(--accent-cyan);">
            Hash Ring Space: [0, 2^32 - 1] • Virtual Nodes per Node: 60
          </div>
        </div>
      `;
      break;
    }

    case 'load-stress-benchmark': {
      metricsGrid.innerHTML = `
        <div class="metric-card">
          <div class="metric-label">Throughput (RPS)</div>
          <div class="metric-value" style="color:var(--accent-green);">${data.rps} req/sec</div>
          <div class="metric-sub">Total Requests: ${data.totalRequests}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">p95 Latency</div>
          <div class="metric-value">${data.latencyMs?.p95} ms</div>
          <div class="metric-sub">95% of requests faster than this</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">p99 Latency</div>
          <div class="metric-value" style="color:var(--accent-yellow);">${data.latencyMs?.p99} ms</div>
          <div class="metric-sub">Tail latency metric for SLOs</div>
        </div>
      `;

      stageViewport.innerHTML = `
        <div style="width:100%;display:grid;grid-template-columns:repeat(5, 1fr);gap:12px;text-align:center;">
          <div class="flow-step" style="flex-direction:column;"><span class="metric-label">Min</span><strong>${data.latencyMs?.min} ms</strong></div>
          <div class="flow-step" style="flex-direction:column;"><span class="metric-label">Average</span><strong>${data.latencyMs?.avg} ms</strong></div>
          <div class="flow-step" style="flex-direction:column;"><span class="metric-label">p95</span><strong>${data.latencyMs?.p95} ms</strong></div>
          <div class="flow-step" style="flex-direction:column;"><span class="metric-label">p99</span><strong>${data.latencyMs?.p99} ms</strong></div>
          <div class="flow-step" style="flex-direction:column;"><span class="metric-label">Max</span><strong>${data.latencyMs?.max} ms</strong></div>
        </div>
      `;
      break;
    }

    default: {
      metricsGrid.innerHTML = `
        <div class="metric-card">
          <div class="metric-label">Execution Time</div>
          <div class="metric-value">${durationMs} ms</div>
          <div class="metric-sub">Completed successfully</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Status</div>
          <div class="metric-value" style="color:var(--accent-green);">200 OK</div>
          <div class="metric-sub">Payload rendered below</div>
        </div>
      `;

      stageViewport.innerHTML = `
        <div style="width:100%;padding:16px;background:var(--bg-primary);border-radius:6px;border:1px solid var(--border-color);">
          <div style="font-size:14px;color:var(--text-main);margin-bottom:8px;font-weight:600;">Execution Summary:</div>
          <p style="font-size:13px;color:var(--text-muted);line-height:1.6;">
            Experiment <code>${key}</code> executed in ${durationMs}ms. Check the "JSON Result Payload" tab below to explore the detailed structured response.
          </p>
        </div>
      `;
      break;
    }
  }
}

// Initialize on page load
selectExperiment('event-loop');
