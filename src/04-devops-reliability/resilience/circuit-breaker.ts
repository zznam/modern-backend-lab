/**
 * Resiliency: Circuit Breaker Pattern (Netflix Hystrix / Resilience4j style)
 * Prevents cascading system failures by tripping open when downstream dependencies fail.
 *
 * States:
 * - CLOSED: Normal operation. All calls pass through. Failures increment counter.
 * - OPEN: Downstream is down. All calls fail fast immediately or execute fallback without touching dependency.
 * - HALF_OPEN: Probe state after reset timeout. Allows 1 trial call through to test downstream health.
 */

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private probeInFlight = false;
  private generation = 0;
  private successCount = 0;
  private lastFailureTimestamp = 0;

  constructor(
    private failureThreshold = 3,
    private resetTimeoutMs = 3000,
    private halfOpenSuccessThreshold = 2
  ) {}

  public getState(): CircuitBreakerState {
    // If OPEN and reset timeout has elapsed, transition to HALF_OPEN
    if (this.state === 'OPEN' && Date.now() - this.lastFailureTimestamp >= this.resetTimeoutMs) {
      this.state = 'HALF_OPEN';
      this.generation++;
      this.successCount = 0;
    }
    return this.state;
  }

  public async execute<T>(action: () => Promise<T>, fallback?: () => Promise<T>): Promise<{ result: T; fromFallback: boolean }> {
    const currentState = this.getState();

    if (currentState === 'OPEN' || (currentState === 'HALF_OPEN' && this.probeInFlight)) {
      if (fallback) {
        const fbResult = await fallback();
        return { result: fbResult, fromFallback: true };
      }
      throw new Error('503 Service Unavailable: Circuit Breaker is OPEN or a recovery probe is in flight (Fast Fail)');
    }

    const generation = this.generation;
    const isProbe = currentState === 'HALF_OPEN';
    if (isProbe) this.probeInFlight = true;
    try {
      const result = await action();
      if (generation === this.generation) this.recordSuccess();
      return { result, fromFallback: false };
    } catch (err) {
      if (generation === this.generation) this.recordFailure();
      if (fallback) {
        const fbResult = await fallback();
        return { result: fbResult, fromFallback: true };
      }
      throw err;
    } finally {
      if (isProbe) this.probeInFlight = false;
    }
  }

  private recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.halfOpenSuccessThreshold) {
        // Recovery confirmed: Reset to CLOSED
        this.state = 'CLOSED';
        this.generation++;
        this.failureCount = 0;
      }
    } else {
      this.failureCount = 0;
    }
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTimestamp = Date.now();

    if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.generation++;
    }
  }

  public tripOpen(): void {
    this.state = 'OPEN';
    this.generation++;
    this.lastFailureTimestamp = Date.now();
  }

  public reset(): void {
    this.state = 'CLOSED';
    this.generation++;
    this.probeInFlight = false;
    this.failureCount = 0;
    this.successCount = 0;
  }
}
