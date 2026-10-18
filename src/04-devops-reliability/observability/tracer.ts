/**
 * The Three Pillars of Observability - Pillar 3: Distributed Tracing
 * OpenTelemetry / Jaeger W3C TraceContext propagator & waterfall span visualizer.
 */
import crypto from 'node:crypto';

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  service: string;
  startTime: number;
  durationMs: number;
  attributes: Record<string, any>;
  status: 'OK' | 'ERROR';
}

export class DistributedTracer {
  public static generateTraceId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  public static generateSpanId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  // W3C TraceContext: format `00-${traceId}-${spanId}-01`
  public static createTraceparent(traceId: string, spanId: string): string {
    return `00-${traceId}-${spanId}-01`;
  }

  public static parseTraceparent(header: string): { traceId: string; parentSpanId: string } | null {
    const parts = header.split('-');
    if (parts.length < 4 || parts[0] !== '00') return null;
    return {
      traceId: parts[1],
      parentSpanId: parts[2],
    };
  }

  // Simulates a full distributed request lifecycle across 4 microservices
  public static simulateDistributedOrderTrace(): {
    traceId: string;
    w3cHeader: string;
    spans: TraceSpan[];
    totalDurationMs: number;
  } {
    const traceId = this.generateTraceId();
    const rootSpanId = this.generateSpanId();
    const baseTime = Date.now();

    const spans: TraceSpan[] = [];

    // 1. Root Ingress Gateway Span
    spans.push({
      traceId,
      spanId: rootSpanId,
      name: 'HTTP POST /api/v1/orders',
      service: 'api-gateway',
      startTime: baseTime,
      durationMs: 85,
      attributes: { 'http.status_code': 201, 'http.method': 'POST', 'client.ip': '203.0.113.19' },
      status: 'OK',
    });

    // 2. Auth Service Verification Span
    const authSpanId = this.generateSpanId();
    spans.push({
      traceId,
      spanId: authSpanId,
      parentSpanId: rootSpanId,
      name: 'JWT Verification & RBAC Check',
      service: 'auth-service',
      startTime: baseTime + 2,
      durationMs: 12,
      attributes: { 'user.id': 'usr_99182', 'auth.algorithm': 'RS256' },
      status: 'OK',
    });

    // 3. Database Transaction Span (Order Service)
    const dbSpanId = this.generateSpanId();
    spans.push({
      traceId,
      spanId: dbSpanId,
      parentSpanId: rootSpanId,
      name: 'SQL: BEGIN; INSERT INTO orders; INSERT INTO outbox; COMMIT;',
      service: 'order-db-primary',
      startTime: baseTime + 18,
      durationMs: 28,
      attributes: { 'db.system': 'postgresql', 'db.statement': 'INSERT INTO orders ...', 'db.pool.wait_ms': 0.8 },
      status: 'OK',
    });

    // 4. Redis Cache Invalidation Span
    const cacheSpanId = this.generateSpanId();
    spans.push({
      traceId,
      spanId: cacheSpanId,
      parentSpanId: rootSpanId,
      name: 'Redis: DEL customer:usr_99182:active_orders',
      service: 'redis-cache-cluster',
      startTime: baseTime + 50,
      durationMs: 4,
      attributes: { 'redis.cmd': 'DEL', 'db.instance': 'cache-node-01' },
      status: 'OK',
    });

    // 5. Message Broker Event Publish Span
    const brokerSpanId = this.generateSpanId();
    spans.push({
      traceId,
      spanId: brokerSpanId,
      parentSpanId: rootSpanId,
      name: 'Kafka: PRODUCE topic:order-events',
      service: 'kafka-broker',
      startTime: baseTime + 58,
      durationMs: 15,
      attributes: { 'messaging.system': 'kafka', 'messaging.destination': 'order-events', 'messaging.partition': 2 },
      status: 'OK',
    });

    return {
      traceId,
      w3cHeader: this.createTraceparent(traceId, rootSpanId),
      spans,
      totalDurationMs: 85,
    };
  }
}
