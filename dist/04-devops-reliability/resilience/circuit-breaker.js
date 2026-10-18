/**
 * Resiliency: Circuit Breaker Pattern (Netflix Hystrix / Resilience4j style)
 * Prevents cascading system failures by tripping open when downstream dependencies fail.
 *
 * States:
 * - CLOSED: Normal operation. All calls pass through. Failures increment counter.
 * - OPEN: Downstream is down. All calls fail fast immediately or execute fallback without touching dependency.
 * - HALF_OPEN: Probe state after reset timeout. Allows 1 trial call through to test downstream health.
 */
export class CircuitBreaker {
    failureThreshold;
    resetTimeoutMs;
    halfOpenSuccessThreshold;
    state = 'CLOSED';
    failureCount = 0;
    successCount = 0;
    lastFailureTimestamp = 0;
    constructor(failureThreshold = 3, resetTimeoutMs = 3000, halfOpenSuccessThreshold = 2) {
        this.failureThreshold = failureThreshold;
        this.resetTimeoutMs = resetTimeoutMs;
        this.halfOpenSuccessThreshold = halfOpenSuccessThreshold;
    }
    getState() {
        // If OPEN and reset timeout has elapsed, transition to HALF_OPEN
        if (this.state === 'OPEN' && Date.now() - this.lastFailureTimestamp >= this.resetTimeoutMs) {
            this.state = 'HALF_OPEN';
            this.successCount = 0;
        }
        return this.state;
    }
    async execute(action, fallback) {
        const currentState = this.getState();
        if (currentState === 'OPEN') {
            if (fallback) {
                const fbResult = await fallback();
                return { result: fbResult, fromFallback: true };
            }
            throw new Error('503 Service Unavailable: Circuit Breaker is OPEN (Fast Fail)');
        }
        try {
            const result = await action();
            this.recordSuccess();
            return { result, fromFallback: false };
        }
        catch (err) {
            this.recordFailure();
            if (fallback) {
                const fbResult = await fallback();
                return { result: fbResult, fromFallback: true };
            }
            throw err;
        }
    }
    recordSuccess() {
        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            if (this.successCount >= this.halfOpenSuccessThreshold) {
                // Recovery confirmed: Reset to CLOSED
                this.state = 'CLOSED';
                this.failureCount = 0;
            }
        }
        else {
            this.failureCount = 0;
        }
    }
    recordFailure() {
        this.failureCount++;
        this.lastFailureTimestamp = Date.now();
        if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
            this.state = 'OPEN';
        }
    }
    tripOpen() {
        this.state = 'OPEN';
        this.lastFailureTimestamp = Date.now();
    }
    reset() {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
    }
}
