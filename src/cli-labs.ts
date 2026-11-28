/** Dashboard lab ids accepted by `npm run lab <id>`, mapped to the CLI menu numbers. */
export const CLI_LAB_IDS: Readonly<Record<string, string>> = Object.freeze({
  'event-loop': '1',
  'worker-threads': '2',
  'memory-leak': '3',
  'raw-tcp-udp': '4',
  'dns-resolution': '5',
  'locking-benchmark': '6',
  'graphql-dataloader': '7',
  'grpc-protobuf': '8',
  'cache-stampede': '9',
  'saga-pattern': '10',
  'consistent-hashing': '11',
  'load-stress-benchmark': '12',
  observability: '13',
  'consensus-quorum': '14',
  'fencing-tokens': '15',
  'event-sourcing': '16',
  'snapshot-isolation': '17',
  backpressure: '18',
  'slo-burn-rate': '19',
  'replication-quorums': '20',
  'lsm-compaction': '21',
  'two-phase-commit': '22',
  'stream-watermarks': '23',
  'merkle-anti-entropy': '24',
});

/**
 * Turns a CLI argument into a menu number: numbers pass through, dashboard ids map to their
 * number (case-insensitive), and anything else returns null.
 */
export function resolveLabChoice(argument: string): string | null {
  const value = argument.trim().toLowerCase();
  if (/^\d+$/.test(value)) return value;
  return Object.hasOwn(CLI_LAB_IDS, value) ? CLI_LAB_IDS[value] : null;
}
