/* Local learning adventures. Scenarios connect existing labs; they do not deploy services. */
const QUEST_CAMPAIGNS = [
  {
    id: 'runtime-foundations', title: 'Runtime field guide', level: 'foundation',
    description: 'Predict callback order, choose a bounded data structure, and identify the signals that reveal a busy service.',
    topics: ['event-loop', 'data-structures', 'observability'], xp: 80, coins: 10,
  },
  {
    id: 'network-dispatch', title: 'Follow the first packet', level: 'foundation',
    description: 'Trace a name lookup, compare stream and datagram transport, and explain which protocol fits the conversation.',
    topics: ['dns-resolution', 'raw-tcp-udp', 'protocols'], xp: 80, coins: 10,
  },
  {
    id: 'latency-detectives', title: 'The latency investigation', level: 'intermediate',
    description: 'Investigate a slow service through CPU isolation, retained memory, operating-system limits, and measured tail latency.',
    topics: ['worker-threads', 'memory-leak', 'os-fundamentals', 'load-stress-benchmark'], xp: 110, coins: 15,
  },
  {
    id: 'secure-boundary', title: 'Guard the service boundary', level: 'intermediate',
    description: 'Connect key exchange, refresh-token replay, contextual authorization, and application defenses without treating a demo as a security audit.',
    topics: ['tls-handshake', 'auth-jwt-rotation', 'abac-authorization', 'owasp-lab'], xp: 110, coins: 15,
  },
  {
    id: 'efficient-api', title: 'The efficient API workshop', level: 'intermediate',
    description: 'Build a performance explanation from stable pagination, resolver batching, wire encoding, and index-aware access patterns.',
    topics: ['rest-pagination', 'graphql-dataloader', 'grpc-protobuf', 'db-tuning'], xp: 110, coins: 15,
  },
  {
    id: 'checkout-rescue', title: 'Rescue the checkout', level: 'intermediate',
    description: 'Follow a retried order through duplicate protection, concurrent updates, reliable event publication, and compensating business actions.',
    topics: ['idempotency', 'locking-benchmark', 'outbox-pattern', 'saga-pattern'], xp: 130, coins: 20,
  },
  {
    id: 'delivery-guarantees', title: 'Keep the work moving', level: 'intermediate',
    description: 'Investigate message retries, storage responsibilities, hot-key pressure, and key placement as demand shifts between workers.',
    topics: ['message-broker', 'polyglot-persistence', 'cache-stampede', 'consistent-hashing'], xp: 130, coins: 20,
  },
  {
    id: 'incident-response', title: 'The dependency outage drill', level: 'intermediate',
    description: 'Route traffic, bound demand, stop calls to a failing dependency, and compare retry schedules before proposing recovery.',
    topics: ['load-balancer', 'rate-limiting', 'circuit-breaker', 'retry-backoff'], xp: 130, coins: 20,
  },
  {
    id: 'partition-boundary', title: 'Across the partition', level: 'advanced',
    description: 'Choose service boundaries, inspect partition trade-offs, trace converging replicas, and test which versions a quorum can observe.',
    topics: ['system-patterns', 'cap-theorem', 'eventual-consistency', 'replication-quorums'], xp: 150, coins: 25,
  },
  {
    id: 'durable-record', title: 'Reconstruct the durable record', level: 'advanced',
    description: 'Separate domain rules from storage, replay events, compact versioned records, and recover a coordinator decision in the teaching models.',
    topics: ['clean-architecture', 'event-sourcing', 'lsm-compaction', 'two-phase-commit'], xp: 150, coins: 25,
  },
  {
    id: 'safe-concurrency', title: 'Who may commit?', level: 'advanced',
    description: 'Compare transaction guarantees, majority acknowledgement, stale-owner rejection, and write-skew prevention under concurrency.',
    topics: ['acid-transactions', 'consensus-quorum', 'fencing-tokens', 'snapshot-isolation'], xp: 180, coins: 30,
  },
  {
    id: 'streaming-operator', title: 'Operate the event stream', level: 'advanced',
    description: 'Balance queue capacity and late arrivals, interpret error-budget consumption, and connect the findings to rollout and health concepts.',
    topics: ['backpressure', 'stream-watermarks', 'slo-burn-rate', 'devops-k8s'], xp: 180, coins: 30,
  },
];

/* Answers follow the repository's teaching models and their stated limits. */
const QUEST_QUIZZES = [
  {
    id: 'bloom-membership', topic: 'data-structures',
    question: 'A Bloom filter says a key may be present. What should a caller do before treating the record as existing?',
    options: ['Assume the record definitely exists', 'Check the authoritative data store', 'Delete the filter because it is broken', 'Treat the response as proof that the key is absent'],
    answer: 1,
    explanation: 'A Bloom filter can produce false positives. A positive result is a reason to check storage, not proof that a record exists.',
  },
  {
    id: 'tcp-framing', topic: 'raw-tcp-udp',
    question: 'Why does a TCP application need its own message framing?',
    options: ['TCP preserves bytes in order but does not preserve application message boundaries', 'TCP guarantees that every write arrives as one read', 'TCP delivers only unordered datagrams', 'TCP encrypts all payloads automatically'],
    answer: 0,
    explanation: 'TCP exposes an ordered byte stream. A receiver may observe partial or combined writes, so the application must define how messages begin and end.',
  },
  {
    id: 'idempotency-payload', topic: 'idempotency',
    question: 'A client reuses an idempotency key with a different request payload. What is the safe response in this lab?',
    options: ['Create another order with the same key', 'Overwrite the old fingerprint silently', 'Reject the conflicting reuse', 'Ignore every request that has a payload'],
    answer: 2,
    explanation: 'The request fingerprint binds the key to its original payload. Rejecting a conflicting payload prevents one key from ambiguously naming two different operations.',
  },
  {
    id: 'loader-scope', topic: 'graphql-dataloader',
    question: 'What is the safe default scope for a DataLoader that caches authorization-sensitive results?',
    options: ['One cache shared by every user forever', 'One cache for every process on the network', 'One cache keyed only by table name', 'One request and its authorization context'],
    answer: 3,
    explanation: 'Request-scoped loaders batch repeated lookups while avoiding cross-user cache leakage. Cached results must respect the authorization context of the request.',
  },
  {
    id: 'outbox-duplicates', topic: 'outbox-pattern',
    question: 'A relay publishes an outbox event and crashes before marking it sent. What must the consumer be prepared for?',
    options: ['The event being delivered again', 'The database automatically undoing the broker publish', 'Every future event being guaranteed unique', 'The relay no longer needing recovery'],
    answer: 0,
    explanation: 'The business write and outbox record share a transaction, but publication can be repeated during recovery. Consumers need idempotent effects; an outbox alone does not guarantee exactly-once delivery.',
  },
  {
    id: 'saga-compensation', topic: 'saga-pattern',
    question: 'A later saga step fails after earlier business actions succeeded. What does compensation represent?',
    options: ['A database rollback spanning all services', 'A business action that counteracts an earlier completed step', 'Proof that no side effects were ever visible', 'A guarantee that the compensation cannot fail'],
    answer: 1,
    explanation: 'The lab compensates completed steps in reverse order. Compensation is a separate business operation, such as a refund, and needs its own retry and idempotency behavior.',
  },
  {
    id: 'breaker-probe', topic: 'circuit-breaker',
    question: 'Why does a circuit breaker enter a half-open state after its recovery wait?',
    options: ['To retry every queued request at once', 'To permanently disable the dependency', 'To allow a limited probe before deciding whether to resume normal calls', 'To turn all validation failures into successes'],
    answer: 2,
    explanation: 'Half-open permits a controlled recovery probe. A successful probe can close the breaker; a failure can reopen it. Deadlines and bounded queues remain separate concerns.',
  },
  {
    id: 'replica-overlap', topic: 'replication-quorums',
    question: 'In the fixed three-replica model, which read/write pair forces a read to overlap an acknowledged write?',
    options: ['R = 1, W = 1', 'R = 1, W = 2', 'R = 2, W = 1', 'R = 2, W = 2'],
    answer: 3,
    explanation: 'With three replicas, R + W > 3 forces overlap. R = 2 and W = 2 satisfy that condition. This single-writer teaching model does not establish a complete linearizability protocol.',
  },
  {
    id: 'fencing-enforcement', topic: 'fencing-tokens',
    question: 'Worker B writes with token 2, then paused worker A resumes with token 1. Where must the stale write be rejected?',
    options: ['At the protected resource, using its highest accepted token', 'Only in worker A, which may still believe it owns the lease', 'Only in a log viewer after the overwrite', 'Nowhere; lease expiry automatically stops a paused process'],
    answer: 0,
    explanation: 'FencedResource remembers its highest token and rejects a lower token. A lease timeout does not stop an old process from resuming; the resource must enforce the token check.',
  },
  {
    id: 'lsm-tombstone', topic: 'lsm-compaction',
    question: 'Why must a deletion tombstone remain when older runs containing the value are still outside a compaction?',
    options: ['To guarantee that every read is constant time', 'To stop an older value from appearing again', 'To make the deleted value permanently readable', 'To eliminate the need for version ordering'],
    answer: 1,
    explanation: 'A tombstone masks older values. Dropping it while an older value remains can resurrect deleted data. This lab can drop tombstones during its full merge because it includes every run and has no old snapshots.',
  },
  {
    id: 'two-phase-recovery', topic: 'two-phase-commit',
    question: 'The coordinator durably records commit, then crashes before notifying prepared participants. What must recovery do in this lab?',
    options: ['Forget the decision and choose randomly', 'Abort because a timeout always means abort', 'Replay the durable commit decision to the participants', 'Ask each prepared participant to independently choose a different result'],
    answer: 2,
    explanation: 'A durable commit decision must survive the crash. Recovery replays that decision. A prepared participant cannot infer abort merely from a timeout.',
  },
  {
    id: 'quorum-majority', topic: 'consensus-quorum',
    question: 'In the scripted five-node quorum lab, how many distinct votes are required to elect the replacement leader?',
    options: ['One', 'Two', 'All five', 'Three'],
    answer: 3,
    explanation: 'A majority of five is three. The isolated old leader cannot commit its unacknowledged suffix. The script illustrates quorum behavior; it is not a complete Raft implementation.',
  },
];

const QUEST_SHOP = [
  { id: 'theme-cyan', label: 'Lagoon cyan', type: 'theme', cost: 20, value: 'cyan' },
  { id: 'theme-amber', label: 'Signal amber', type: 'theme', cost: 25, value: 'amber' },
  { id: 'theme-violet', label: 'Orbit violet', type: 'theme', cost: 30, value: 'violet' },
  { id: 'title-debugger', label: 'Debugger title', type: 'title', cost: 15, value: 'Debugger' },
  { id: 'title-explorer', label: 'Explorer title', type: 'title', cost: 20, value: 'Explorer' },
  { id: 'title-architect', label: 'Architect title', type: 'title', cost: 35, value: 'Architect' },
  { id: 'title-guardian', label: 'Guardian title', type: 'title', cost: 40, value: 'Guardian' },
];
