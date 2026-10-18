import { describe, it, expect } from 'vitest';
import { TokenBucketRateLimiter, SlidingWindowRateLimiter } from '../src/04-devops-reliability/resilience/rate-limiter.js';
import { CircuitBreaker } from '../src/04-devops-reliability/resilience/circuit-breaker.js';
import { RetryStrategies } from '../src/04-devops-reliability/resilience/retry-backoff.js';
import { GracefulShutdownCoordinator } from '../src/04-devops-reliability/resilience/graceful-shutdown.js';
import { ContractVerifier } from '../src/04-devops-reliability/testing/contract-testing.js';
import { DistributedTracer } from '../src/04-devops-reliability/observability/tracer.js';
import { runInProcessStressBenchmark } from '../src/04-devops-reliability/load-testing/runner.ts';

describe('Pillar 4: Testing, Operations, Reliability & Observability', () => {
  describe('Resilience & Rate Limiting', () => {
    it('Token Bucket allows bursts and rejects requests when tokens are exhausted', () => {
      const tb = new TokenBucketRateLimiter(5, 1);
      expect(tb.allowRequest(3).allowed).toBe(true);
      expect(tb.allowRequest(2).allowed).toBe(true);
      expect(tb.allowRequest(1).allowed).toBe(false); // Exhausted
    });

    it('Sliding Window rate limiter enforces rolling window constraints', () => {
      const limiter = new SlidingWindowRateLimiter(1000, 3);
      const client = '192.168.1.100';
      expect(limiter.allowRequest(client).allowed).toBe(true);
      expect(limiter.allowRequest(client).allowed).toBe(true);
      expect(limiter.allowRequest(client).allowed).toBe(true);
      expect(limiter.allowRequest(client).allowed).toBe(false); // Exceeded 3 requests/window
    });

    it('Circuit Breaker transitions CLOSED -> OPEN -> HALF_OPEN -> CLOSED and executes fallback', async () => {
      const cb = new CircuitBreaker(2, 50, 1); // 2 failures to open, 50ms reset timeout

      const failingCall = async () => {
        throw new Error('Service down');
      };
      const fallbackCall = async () => 'fallback_cached_data';

      // 1st failure
      const r1 = await cb.execute(failingCall, fallbackCall);
      expect(r1.fromFallback).toBe(true);
      expect(cb.getState()).toBe('CLOSED');

      // 2nd failure -> Trips OPEN
      const r2 = await cb.execute(failingCall, fallbackCall);
      expect(r2.fromFallback).toBe(true);
      expect(cb.getState()).toBe('OPEN');

      // Wait for reset timeout
      await new Promise((r) => setTimeout(r, 60));
      expect(cb.getState()).toBe('HALF_OPEN');

      // Trial request succeeds in HALF_OPEN -> Transitions back to CLOSED
      const healthyCall = async () => 'healthy_data';
      const r3 = await cb.execute(healthyCall);
      expect(r3.result).toBe('healthy_data');
      expect(cb.getState()).toBe('CLOSED');
    });

    it('Exponential backoff with full jitter distributes retry intervals', () => {
      const sim = RetryStrategies.simulate50ClientsRetrying();
      expect(sim.jitteredTimestamps).toHaveLength(10);
      expect(sim.naiveTimestamps.every((t) => t === sim.naiveTimestamps[0])).toBe(true);
    });

    it('Graceful shutdown drains active requests and executes cleanup hooks', async () => {
      const coordinator = new GracefulShutdownCoordinator();
      let hookExecuted = false;

      coordinator.registerHook('TestTeardown', async () => {
        hookExecuted = true;
      });

      coordinator.trackRequestStart();
      expect(coordinator.getActiveRequests()).toBe(1);

      // Simulate async request completion
      setTimeout(() => {
        coordinator.trackRequestEnd();
      }, 50);

      const res = await coordinator.triggerShutdown('MANUAL', 500);
      expect(res.success).toBe(true);
      expect(hookExecuted).toBe(true);
    });
  });

  describe('Contract Testing & Distributed Tracing', () => {
    it('Contract Verifier validates status and schema field types', () => {
      const contract = {
        consumer: 'FrontendMobileApp',
        provider: 'OrderService',
        endpoint: '/api/v1/orders/123',
        method: 'GET',
        expectedResponse: {
          status: 200,
          requiredFields: {
            id: 'string' as const,
            amount: 'number' as const,
            status: 'string' as const,
          },
        },
      };

      const validResponse = {
        status: 200,
        body: { id: 'ord_123', amount: 99.5, status: 'COMPLETED' },
      };
      expect(ContractVerifier.verifyContract(contract, validResponse).passed).toBe(true);

      const invalidResponse = {
        status: 200,
        body: { id: 'ord_123', amount: 'not_a_number', status: 'COMPLETED' },
      };
      expect(ContractVerifier.verifyContract(contract, invalidResponse).passed).toBe(false);
    });

    it('Distributed Tracer generates W3C traceparent header and spans waterfall', () => {
      const trace = DistributedTracer.simulateDistributedOrderTrace();
      expect(trace.traceId).toBeDefined();
      expect(trace.w3cHeader).toContain('00-');
      expect(trace.spans.length).toBe(5);

      const parsed = DistributedTracer.parseTraceparent(trace.w3cHeader);
      expect(parsed?.traceId).toBe(trace.traceId);
    });

    it('Runs in-process stress benchmark measuring RPS and latency percentiles', async () => {
      const bench = await runInProcessStressBenchmark(async () => {
        // Fast in-memory work
        Math.sqrt(1234567);
      }, 200, 10);

      expect(bench.totalRequests).toBe(200);
      expect(bench.rps).toBeGreaterThan(100);
      expect(bench.latencyMs.p95).toBeDefined();
    });
  });
});
