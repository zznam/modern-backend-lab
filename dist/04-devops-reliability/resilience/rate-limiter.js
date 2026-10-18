/**
 * Resiliency & Fault Tolerance: Rate Limiting Algorithms
 * Demonstrates:
 * 1. Token Bucket Algorithm (Supports smooth traffic with burst capacity)
 * 2. Sliding Window Counter Algorithm (Prevents boundary stampedes of fixed windows)
 */
// ========================================================
// 1. TOKEN BUCKET ALGORITHM
// ========================================================
export class TokenBucketRateLimiter {
    capacity;
    refillRatePerSec;
    tokens;
    lastRefillTimestamp;
    constructor(capacity, refillRatePerSec) {
        this.capacity = capacity;
        this.refillRatePerSec = refillRatePerSec;
        this.tokens = capacity;
        this.lastRefillTimestamp = Date.now();
    }
    refill() {
        const now = Date.now();
        const elapsedSeconds = (now - this.lastRefillTimestamp) / 1000;
        const tokensToAdd = elapsedSeconds * this.refillRatePerSec;
        this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
        this.lastRefillTimestamp = now;
    }
    allowRequest(tokensRequired = 1) {
        this.refill();
        if (this.tokens >= tokensRequired) {
            this.tokens -= tokensRequired;
            return { allowed: true, remainingTokens: Math.floor(this.tokens) };
        }
        return { allowed: false, remainingTokens: Math.floor(this.tokens) };
    }
}
// ========================================================
// 2. SLIDING WINDOW LOG / COUNTER ALGORITHM
// ========================================================
export class SlidingWindowRateLimiter {
    windowSizeMs;
    maxRequests;
    requestTimestamps = new Map(); // clientId -> timestamps[]
    constructor(windowSizeMs = 60000, maxRequests = 100) {
        this.windowSizeMs = windowSizeMs;
        this.maxRequests = maxRequests;
    }
    allowRequest(clientId) {
        const now = Date.now();
        const windowStart = now - this.windowSizeMs;
        let timestamps = this.requestTimestamps.get(clientId) || [];
        // Evict timestamps older than sliding window
        timestamps = timestamps.filter((t) => t > windowStart);
        if (timestamps.length < this.maxRequests) {
            timestamps.push(now);
            this.requestTimestamps.set(clientId, timestamps);
            return {
                allowed: true,
                currentCount: timestamps.length,
                limit: this.maxRequests,
                resetInSeconds: Math.ceil((timestamps[0] + this.windowSizeMs - now) / 1000),
            };
        }
        this.requestTimestamps.set(clientId, timestamps);
        return {
            allowed: false,
            currentCount: timestamps.length,
            limit: this.maxRequests,
            resetInSeconds: Math.ceil((timestamps[0] + this.windowSizeMs - now) / 1000),
        };
    }
}
