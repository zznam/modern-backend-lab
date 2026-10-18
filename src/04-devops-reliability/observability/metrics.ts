/**
 * The Three Pillars of Observability - Pillar 2: Metrics
 * Prometheus Registry & Standard RED (Rate, Errors, Duration) Metrics
 */
import client from 'prom-client';

// Create a Registry
export const metricsRegistry = new client.Registry();

// Enable default system metrics (CPU, Memory, Event Loop Lag, GC duration)
client.collectDefaultMetrics({
  register: metricsRegistry,
  prefix: 'backend_lab_',
});

// 1. Counter: Total HTTP Requests
export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});

// 2. Histogram: Request Duration (p50, p95, p99)
export const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [metricsRegistry],
});

// 3. Gauge: Database Pool Active Connections
export const dbPoolActiveConnections = new client.Gauge({
  name: 'db_connection_pool_active',
  help: 'Number of active database connections currently checked out of pool',
  registers: [metricsRegistry],
});

// 4. Counter: Cache Hits & Misses
export const cacheEventsTotal = new client.Counter({
  name: 'cache_events_total',
  help: 'Total cache lookups tagged by hit or miss',
  labelNames: ['result'], // 'hit' | 'miss'
  registers: [metricsRegistry],
});

export async function getPrometheusMetricsText(): Promise<string> {
  return metricsRegistry.metrics();
}
