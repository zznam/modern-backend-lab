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
      <p>Node.js runs single-threaded JavaScript using the <strong>libuv</strong> event loop. The trace records the observed execution order:</p>
      <ul>
        <li><strong>Call Stack:</strong> Synchronous execution always runs first to completion.</li>
        <li><strong>Microtasks Queue:</strong> Drained at runtime checkpoints after synchronous work. <code>process.nextTick</code> usually runs before Promise callbacks after ordinary callbacks. ESM evaluation and calls inside an existing microtask can produce a different observed order.</li>
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
    desc: 'Compare simultaneous database hits when a hot cache key expires with a single shared query using Singleflight locking. Choose the number of concurrent requests below.',
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

// Every navigation item has learning material, including the original labs.
const navItems = [...document.querySelectorAll('.nav-item')];
for (const item of navItems) {
  const key = item.dataset.exp;
  const guide = TOPIC_GUIDES[key];
  const advanced = ADVANCED_TOPICS[key];
  EXPERIMENTS_CONFIG[key] = {
    category: item.closest('.nav-section').querySelector('.section-title').textContent,
    title: item.textContent.trim(),
    desc: guide?.[2],
    level: guide?.[0] || 'advanced',
    prerequisites: guide?.[1] || [],
    objective: guide?.[2],
    controlsHtml: '',
    architecture: `<h4>Mechanics to observe</h4><p>${guide?.[3] || ''}</p>`,
    production: `<h4>Production considerations</h4><p>${guide?.[4] || ''}</p>`,
    challenge: 'Before running, predict the result. Inspect the payload, explain the mechanism, and identify one boundary of this teaching model.',
    ...EXPERIMENTS_CONFIG[key],
    ...advanced,
  };
}

const STORAGE_KEY = 'backend-lab-learning-v1';
let savedLearning = {};
try {
  const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) savedLearning = parsed;
} catch { /* A blocked or corrupt store must not prevent learning. */ }
const completedTopics = new Set(Array.isArray(savedLearning.completed)
  ? savedLearning.completed.filter(key => navItems.some(item => item.dataset.exp === key)) : []);

// Default current experiment
let currentExpKey = 'event-loop';
let selectionVersion = 0;
let activeRun = null;
// Successful result snapshots live only in this tab; learning progress is separate.
const previousRuns = new Map();

// DOM Elements
const expCategoryEl = document.getElementById('exp-category');
const expTitleEl = document.getElementById('exp-title');
const expDescEl = document.getElementById('exp-desc');
const controlsContainer = document.getElementById('controls-container');
const scenarioContainer = document.getElementById('scenario-container');
const runBtn = document.getElementById('run-btn');
const metricsGrid = document.getElementById('metrics-cards');
const stageViewport = document.getElementById('stage-viewport');
const execStatus = document.getElementById('exec-status');
const jsonOutput = document.getElementById('json-output');
const docArchitecture = document.getElementById('doc-architecture');
const docProduction = document.getElementById('doc-production');
const pathSelect = document.getElementById('learning-path');
const levelSelect = document.getElementById('topic-level');
const statusSelect = document.getElementById('topic-status');
const searchInput = document.getElementById('topic-search');
const completeBtn = document.getElementById('mark-complete');
const nextBtn = document.getElementById('next-topic');

const journey = new LearningJourney({
  topics: EXPERIMENTS_CONFIG, paths: LEARNING_PATHS, stored: savedLearning.journey,
  completed: completedTopics,
  onChange: () => saveLearning(),
  onTopic: key => {
    pathSelect.value = levelSelect.value = statusSelect.value = 'all';
    searchInput.value = '';
    selectExperiment(key);
    document.getElementById('exp-title').focus();
  },
  onPath: (id, key) => {
    pathSelect.value = id;
    levelSelect.value = statusSelect.value = 'all';
    searchInput.value = '';
    selectExperiment(key);
    document.getElementById('exp-title').focus();
  },
});

const questEngine = new QuestEngine({
  topics: EXPERIMENTS_CONFIG, stored: savedLearning.quests, journey, completed: completedTopics,
});
journey.quest = questEngine;
const questHub = new QuestHub({
  engine: questEngine,
  onChange: () => { updateCurriculum(); saveLearning(); },
  onTopic: key => {
    if (!Object.hasOwn(EXPERIMENTS_CONFIG, key)) return;
    pathSelect.value = levelSelect.value = statusSelect.value = 'all';
    searchInput.value = '';
    selectExperiment(key);
    document.getElementById('exp-title').focus();
  },
});
journey.onQuestRender = () => { questHub.render(); renderQuestTools(); };

function renderQuestTools() {
  const favorite = questEngine.state.favorites.includes(currentExpKey);
  const queued = questEngine.state.queue.includes(currentExpKey);
  const favoriteButton = document.getElementById('quest-lab-favorite');
  favoriteButton.setAttribute('aria-pressed', String(favorite));
  favoriteButton.textContent = favorite ? '★ Favorite lab' : '☆ Favorite lab';
  const queueButton = document.getElementById('quest-lab-queue');
  queueButton.setAttribute('aria-pressed', String(queued));
  queueButton.textContent = queued ? 'Remove from practice queue' : 'Add to practice queue';
  const campaign = questEngine.state.activeCampaign && questEngine.campaignProgress(questEngine.state.activeCampaign);
  const sprint = questEngine.state.sprint;
  const parts = [];
  if (campaign) parts.push(`${campaign.title}: ${campaign.value} / ${campaign.max} labs`);
  if (sprint?.started === questEngine.dateKey() && ['active', 'paused'].includes(sprint.status)) parts.push(`Focus sprint (${sprint.status}): ${sprint.topics.length} / ${sprint.target} labs`);
  document.getElementById('quest-run-tracker').hidden = !parts.length;
  document.getElementById('quest-run-status').textContent = parts.join(' · ');
}
document.getElementById('quest-lab-favorite').addEventListener('click', () => {
  questEngine.toggleFavorite(currentExpKey);
  journey.render(); saveLearning();
  document.getElementById('quest-lab-feedback').textContent = questEngine.state.favorites.includes(currentExpKey) ? 'Lab added to favorites.' : 'Lab removed from favorites.';
});
document.getElementById('quest-lab-queue').addEventListener('click', () => {
  if (questEngine.state.queue.includes(currentExpKey)) questEngine.dequeue(currentExpKey);
  else questEngine.enqueue(currentExpKey);
  journey.render(); saveLearning();
  document.getElementById('quest-lab-feedback').textContent = questEngine.state.queue.includes(currentExpKey) ? 'Lab added to your practice queue.' : 'Lab removed from your practice queue.';
});
document.getElementById('quest-lab-reflect').addEventListener('click', () => {
  questHub.open('practice', currentExpKey);
  location.hash = 'journey';
  showJourney(false);
  document.getElementById('quest-hub-title')?.focus();
});

function showJourney(focus = true) {
  resetRunDisplay();
  document.getElementById('experiment-view').hidden = true;
  document.getElementById('journey-view').hidden = false;
  document.getElementById('journey-link').setAttribute('aria-current', 'page');
  document.body.classList.add('show-journey');
  document.title = 'Your learning journey | Backend Lab';
  journey.render();
  if (focus) document.getElementById('journey-title').focus();
}
document.getElementById('journey-resume').addEventListener('click', () => {
  selectExperiment(currentExpKey);
  document.getElementById('exp-title').focus();
});

function pathTopics() {
  return LEARNING_PATHS[pathSelect.value]?.topics || navItems.map(item => item.dataset.exp);
}

function saveLearning() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ completed: [...completedTopics], lastTopic: currentExpKey, path: pathSelect.value, journey: journey.state, quests: questEngine.state }));
  } catch {
    document.querySelector('.local-note').textContent = 'Session only';
    document.getElementById('journey-storage').textContent = 'Storage unavailable. Progress lasts only for this session.';
  }
}

function updateCurriculum() {
  const topics = pathTopics();
  const done = topics.filter(key => completedTopics.has(key)).length;
  const progress = document.getElementById('learning-progress');
  progress.max = topics.length;
  progress.value = done;
  document.getElementById('progress-label').textContent = `${done} of ${topics.length} completed`;
  document.getElementById('topic-total').textContent = `${navItems.length} labs`;
  const path = LEARNING_PATHS[pathSelect.value];
  document.getElementById('path-description').textContent = path
    ? `${path.label}: ${topics.length} labs in a recommended sequence. Use Next topic to continue.`
    : 'Explore freely or choose a guided sequence.';
  const query = searchInput.value.trim().toLowerCase();
  let visible = 0;
  for (const item of navItems) {
    const key = item.dataset.exp;
    const cfg = EXPERIMENTS_CONFIG[key];
    const matches = topics.includes(key)
      && (levelSelect.value === 'all' || cfg.level === levelSelect.value)
      && (statusSelect.value === 'all' || completedTopics.has(key) === (statusSelect.value === 'completed'))
      && `${cfg.title} ${cfg.desc} ${cfg.category} ${cfg.objective} ${cfg.architecture}`.toLowerCase().includes(query);
    item.hidden = !matches;
    item.classList.toggle('completed', completedTopics.has(key));
    item.setAttribute('aria-label', `${cfg.title}${completedTopics.has(key) ? ', completed' : ''}`);
    if (matches) visible++;
  }
  document.querySelectorAll('.nav-section').forEach(section => {
    section.hidden = ![...section.querySelectorAll('.nav-item')].some(item => !item.hidden);
  });
  document.getElementById('no-topics').hidden = visible > 0;
  document.getElementById('filter-count').textContent = `${visible} of ${topics.length} topics shown`;
  completeBtn.setAttribute('aria-pressed', String(completedTopics.has(currentExpKey)));
  completeBtn.textContent = completedTopics.has(currentExpKey) ? '✓ Completed · undo' : 'Mark complete';
  const currentIndex = topics.indexOf(currentExpKey);
  const next = currentIndex < 0 ? topics[0] : topics[currentIndex + 1];
  nextBtn.disabled = !next;
  nextBtn.textContent = next ? 'Next topic →' : 'Path finished';
  nextBtn.dataset.next = next || '';
  journey.render();
}

[pathSelect, levelSelect, statusSelect].forEach(select => select.addEventListener('change', () => {
  updateCurriculum(); saveLearning();
}));
searchInput.addEventListener('input', updateCurriculum);
document.getElementById('clear-filters').addEventListener('click', () => {
  searchInput.value = '';
  pathSelect.value = levelSelect.value = statusSelect.value = 'all';
  updateCurriculum(); saveLearning();
});
completeBtn.addEventListener('click', () => {
  if (completedTopics.has(currentExpKey)) completedTopics.delete(currentExpKey);
  else completedTopics.add(currentExpKey);
  updateCurriculum(); saveLearning();
});
nextBtn.addEventListener('click', () => {
  if (nextBtn.dataset.next) selectExperiment(nextBtn.dataset.next);
});
document.getElementById('prerequisites').addEventListener('click', event => {
  const link = event.target.closest('[data-topic]');
  if (link) selectExperiment(link.dataset.topic);
});
document.getElementById('copy-link').addEventListener('click', async () => {
  const feedback = document.getElementById('link-feedback');
  try {
    await navigator.clipboard.writeText(location.href);
    feedback.textContent = 'Link copied';
  } catch { feedback.textContent = 'Copy the topic URL from the address bar.'; }
});

function hashTopic() {
  try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; }
}
window.addEventListener('hashchange', () => {
  const key = hashTopic();
  if (key === 'journey') showJourney();
  else if (navItems.some(item => item.dataset.exp === key) && (key !== currentExpKey || !document.getElementById('journey-view').hidden)) selectExperiment(key);
  else if (!key) selectExperiment(currentExpKey);
});

// Tab Switching
const tabButtons = [...document.querySelectorAll('.tab-btn')];
document.querySelector('.tab-bar').setAttribute('role', 'tablist');
document.querySelector('.tab-bar').setAttribute('aria-label', 'Experiment details');
tabButtons.forEach((btn, index) => {
  const panel = document.getElementById(`tab-${btn.dataset.tab}`);
  btn.id = `tab-button-${btn.dataset.tab}`;
  btn.setAttribute('role', 'tab');
  btn.setAttribute('aria-controls', panel.id);
  btn.setAttribute('aria-selected', String(index === 0));
  btn.tabIndex = index === 0 ? 0 : -1;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', btn.id);
  panel.tabIndex = 0;
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => {
      b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); b.tabIndex = -1;
    });
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    btn.tabIndex = 0;
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
  btn.addEventListener('keydown', event => {
    const offsets = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: tabButtons.length - 1 - index };
    if (!(event.key in offsets)) return;
    event.preventDefault();
    const target = tabButtons[(index + offsets[event.key] + tabButtons.length) % tabButtons.length];
    target.click(); target.focus();
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

function selectExperiment(key, updateHash = true) {
  if (!navItems.some(item => item.dataset.exp === key)) return;
  resetRunDisplay();
  document.getElementById('experiment-view').hidden = false;
  document.getElementById('journey-view').hidden = true;
  document.getElementById('journey-link').removeAttribute('aria-current');
  document.body.classList.remove('show-journey');
  document.querySelectorAll('.nav-item').forEach(item => {
    const selected = item.dataset.exp === key;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  currentExpKey = key;
  const cfg = EXPERIMENTS_CONFIG[key];
  if (updateHash && hashTopic() !== key) location.hash = key;
  document.title = `${cfg.title} | Backend Lab`;

  expCategoryEl.textContent = cfg.category;
  expTitleEl.textContent = cfg.title;
  expDescEl.textContent = cfg.desc;
  document.getElementById('exp-level').textContent = cfg.level;
  document.getElementById('learning-objective').textContent = cfg.objective;
  document.getElementById('prerequisites').innerHTML = cfg.prerequisites.length
    ? '<span>Builds on:</span> ' + cfg.prerequisites.map(topic => `<button class="topic-link" data-topic="${topic}">${escapeHtml(EXPERIMENTS_CONFIG[topic].title)}</button>`).join('')
    : '<span>No prerequisites · start here</span>';
  document.getElementById('link-feedback').textContent = '';
  document.getElementById('quest-lab-feedback').textContent = '';
  controlsContainer.innerHTML = cfg.controlsHtml || '<span style="color:var(--text-dim);font-size:13px;">No custom parameters required for this experiment.</span>';
  controlsContainer.querySelectorAll('.control-group').forEach(group => {
    const input = group.querySelector('input, select');
    const label = group.querySelector('label');
    if (input && label) label.htmlFor = input.id;
  });
  if (key === 'consensus-quorum') {
    const cluster = document.getElementById('param-clusterSize');
    const voters = document.getElementById('param-availableNodes');
    const boundVoters = () => {
      voters.max = Number(cluster.value) - 1;
      if (Number(voters.value) > Number(voters.max)) voters.value = voters.max;
    };
    cluster.addEventListener('change', boundVoters);
    boundVoters();
  }
  scenarioContainer.hidden = !cfg.scenarios;
  scenarioContainer.innerHTML = cfg.scenarios
    ? '<div class="scenario-heading"><h3>Explore a scenario</h3><span>Apply settings, predict, then run.</span></div><div class="scenario-buttons">'
      + cfg.scenarios.map((scenario, index) => `<button type="button" class="secondary-btn" data-scenario="${index}" aria-pressed="false">${escapeHtml(scenario.label)}</button>`).join('')
      + '</div><p id="scenario-expectation" role="status" aria-live="polite"></p>'
    : '';
  updateScenarioSelection();
  docArchitecture.innerHTML = cfg.architecture;
  docProduction.innerHTML = cfg.production;
  document.getElementById('doc-challenge').innerHTML = `<h4>Try it yourself</h4><p>${escapeHtml(cfg.challenge)}</p>`
    + (cfg.source ? `<p>Implementation: <code>${escapeHtml(cfg.source)}</code></p>` : '')
    + (cfg.reference ? `<p>Read more: <a href="${cfg.reference[1]}" target="_blank" rel="noopener noreferrer">${escapeHtml(cfg.reference[0])}</a></p>` : '');
  updateCurriculum();
  saveLearning();

}

function resetRunDisplay(message = 'Predict the outcome, then run the experiment to inspect its results.') {
  selectionVersion++;
  activeRun?.controller.abort();
  activeRun = null;
  runBtn.disabled = false;
  stageViewport.setAttribute('aria-busy', 'false');
  metricsGrid.innerHTML = '';
  stageViewport.innerHTML = `<div class="placeholder-graphic">${escapeHtml(message)}</div>`;
  execStatus.textContent = 'Idle (Ready)';
  execStatus.style.color = 'var(--text-dim)';
  jsonOutput.textContent = '// Ready to run...';
}

function updateScenarioSelection() {
  const cfg = EXPERIMENTS_CONFIG[currentExpKey];
  if (!cfg.scenarios) return;
  const valid = [...controlsContainer.querySelectorAll('input, select')].every(input => input.value.trim() !== '' && input.validity.valid);
  const params = valid ? cfg.getParams() : {};
  const selected = valid ? cfg.scenarios.findIndex(scenario => Object.entries(scenario.params).every(([key, value]) => params[key] === value)) : -1;
  scenarioContainer.querySelectorAll('[data-scenario]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.scenario) === selected)));
  document.getElementById('scenario-expectation').textContent = !valid
    ? 'Some settings are missing or invalid. Enter valid values for all settings before running the experiment.'
    : selected < 0
      ? 'Custom settings. Predict the outcome, then run to test your explanation.'
      : cfg.scenarios[selected].expectation;
}

scenarioContainer.addEventListener('click', event => {
  const button = event.target.closest('[data-scenario]');
  if (!button) return;
  const scenario = EXPERIMENTS_CONFIG[currentExpKey].scenarios[Number(button.dataset.scenario)];
  for (const [key, value] of Object.entries(scenario.params)) document.getElementById(`param-${key}`).value = String(value);
  resetRunDisplay('Scenario settings applied. Predict the outcome, then run the experiment.');
  updateScenarioSelection();
});

['input', 'change'].forEach(type => controlsContainer.addEventListener(type, event => {
  if (!event.target.matches('input, select')) return;
  resetRunDisplay('Settings changed. Run the experiment to see results for these settings.');
  updateScenarioSelection();
}));

// Run Experiment Handler
runBtn.addEventListener('click', async () => {
  const key = currentExpKey;
  const version = selectionVersion;
  const cfg = EXPERIMENTS_CONFIG[key] || {};
  const inputs = [...controlsContainer.querySelectorAll('input, select')];
  if (inputs.some(input => !input.reportValidity())) return;
  const params = cfg.getParams ? cfg.getParams() : {};
  const settings = inputs.map(input => ({
    key: input.id,
    label: input.closest('.control-group')?.querySelector('label')?.textContent || input.id,
    value: input.tagName === 'SELECT' ? input.selectedOptions[0]?.textContent : input.value,
  }));
  const run = { controller: new AbortController() };
  activeRun = run;

  metricsGrid.innerHTML = '';
  stageViewport.innerHTML = '<div class="placeholder-graphic">Running the experiment with the selected settings…</div>';
  jsonOutput.textContent = '// Waiting for this run...';
  execStatus.textContent = 'Running...';
  execStatus.style.color = 'var(--accent-yellow)';
  runBtn.disabled = true;
  stageViewport.setAttribute('aria-busy', 'true');

  try {
    const response = await fetch('/api/experiments/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ experimentId: key, params }),
      signal: run.controller.signal,
    });

    const res = await response.json();
    if (version !== selectionVersion || activeRun !== run) return;
    if (!response.ok) throw new Error(res.error || `Request failed (${response.status})`);
    execStatus.textContent = `Completed in ${res.executionDurationMs}ms`;
    execStatus.style.color = 'var(--accent-green)';
    jsonOutput.textContent = JSON.stringify(res, null, 2);

    renderVisualStage(key, res.data, res.executionDurationMs);
    if (ADVANCED_TOPICS[key]) {
      const snapshot = { settings, metrics: res.data.metrics.map(metric => ({ label: metric.label, value: metric.value })) };
      const comparison = document.createElement('section');
      comparison.className = 'run-comparison';
      comparison.setAttribute('aria-label', 'Run comparison');
      comparison.innerHTML = renderRunComparison(previousRuns.get(key), snapshot);
      stageViewport.querySelector('.result-summary').after(comparison);
      previousRuns.set(key, snapshot);
    }
    journey.recordRun(key);
  } catch (err) {
    if (version !== selectionVersion || activeRun !== run) return;
    metricsGrid.innerHTML = '';
    stageViewport.textContent = 'The experiment could not complete. See the error below.';
    execStatus.textContent = 'Error';
    execStatus.style.color = 'var(--accent-red)';
    jsonOutput.textContent = `Error executing experiment: ${err.message}`;
  } finally {
    if (activeRun === run) {
      activeRun = null;
      runBtn.disabled = false;
      stageViewport.setAttribute('aria-busy', 'false');
    }
  }
});

function renderRunComparison(previous, current) {
  const note = '<p class="comparison-note">Successful runs of this topic only. Kept in this tab; cleared on reload.</p>';
  const row = (label, before, after) => `<tr${previous && before !== after ? ' class="comparison-changed"' : ''}><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(before ?? '—')}</td><td>${escapeHtml(after)}</td></tr>`;
  const settings = current.settings.map(setting => row(setting.label, previous?.settings.find(item => item.key === setting.key)?.value, setting.value)).join('');
  const metrics = current.metrics.map(metric => row(metric.label, previous?.metrics.find(item => item.label === metric.label)?.value, metric.value)).join('');
  return `<h4>${previous ? 'Compare your runs' : 'Your first run'}</h4>${note}<table><caption>${previous ? 'Changed values are highlighted. Compare the parameters and outcomes.' : 'Run another scenario to compare its parameters and outcomes here.'}</caption><thead><tr><th scope="col">Parameter / metric</th><th scope="col">Previous</th><th scope="col">Current</th></tr></thead><tbody>${settings}</tbody><tbody>${metrics}</tbody></table>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

// Render Visual Visualizer Stage
function renderVisualStage(key, data, durationMs) {
  metricsGrid.innerHTML = '';

  if (ADVANCED_TOPICS[key]) {
    metricsGrid.innerHTML = data.metrics.map(metric => `<div class="metric-card"><div class="metric-label">${escapeHtml(metric.label)}</div><div class="metric-value">${escapeHtml(metric.value)}</div><div class="metric-sub">${escapeHtml(metric.hint)}</div></div>`).join('');
    stageViewport.innerHTML = `<div class="advanced-result"><p class="result-summary">${escapeHtml(data.summary)}</p><ol class="sequence-flow trace-list">${data.steps.map((step, index) => `<li class="flow-step trace-${['ok', 'warning', 'blocked'].includes(step.state) ? step.state : 'ok'}"><span class="step-num">${index + 1}</span><div class="step-content"><div class="step-phase">${escapeHtml(step.state)}</div><div class="step-title">${escapeHtml(step.title)}</div><p class="step-desc">${escapeHtml(step.detail)}</p></div></li>`).join('')}</ol><p class="model-note"><strong>Model boundary:</strong> ${escapeHtml(data.model)}</p></div>`;
    return;
  }

  switch (key) {
    case 'event-loop': {
      metricsGrid.innerHTML = `
        <div class="metric-card">
          <div class="metric-label">Execution Time</div>
          <div class="metric-value">${durationMs} ms</div>
          <div class="metric-sub">✓ Observed Phase Order</div>
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
              <div class="step-phase">${escapeHtml(step.phase)} [${escapeHtml(step.type)}]</div>
              <div class="step-title">${escapeHtml(step.label)}</div>
              <div class="step-desc">${escapeHtml(step.explanation)}</div>
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
          <div class="metric-sub">Exactly 1 DB query! ${withoutQ ? Math.round((1 - withQ / withoutQ) * 100) : 0}% reduction</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Penetration Defense</div>
          <div class="metric-value" style="color:var(--accent-cyan);">Protected</div>
          <div class="metric-sub">Bloom Filter intercepted invalid key</div>
        </div>
      `;

      stageViewport.innerHTML = `
        <div style="width:100%;text-align:center;">
          <div style="font-size:16px;font-weight:600;margin-bottom:16px;">Database Queries Under ${withoutQ} Simultaneous Cache Misses:</div>
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

// A valid link wins over the last locally viewed topic.
pathSelect.value = Object.hasOwn(LEARNING_PATHS, savedLearning.path) ? savedLearning.path : 'all';
const linkedTopic = hashTopic();
const initialTopic = navItems.some(item => item.dataset.exp === linkedTopic) ? linkedTopic
  : navItems.some(item => item.dataset.exp === savedLearning.lastTopic) ? savedLearning.lastTopic : 'event-loop';
selectExperiment(initialTopic, linkedTopic !== 'journey');
if (linkedTopic === 'journey') showJourney(false);
// Refresh date-based quests after returning to a tab or crossing midnight.
window.addEventListener('focus', () => journey.render());
document.addEventListener('visibilitychange', () => { if (!document.hidden) journey.render(); });
setInterval(() => { if (!document.hidden) journey.render(); }, 60000);
