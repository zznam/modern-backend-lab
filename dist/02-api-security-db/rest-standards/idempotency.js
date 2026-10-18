/**
 * Idempotency Engine (Critical for Payments, Orders & Financial Systems)
 * Prevents duplicate processing from network timeouts, retry loops, or accidental double-submits.
 *
 * Mechanics:
 * 1. Checks `Idempotency-Key` header.
 * 2. If key exists in state 'PROCESSING': returns 409 Conflict (Concurrent in-flight duplicate).
 * 3. If key exists in state 'COMPLETED': returns cached original response with `X-Cache: IDEMPOTENT-HIT`.
 * 4. Otherwise: acquires atomic lock with TTL, executes operation, and caches response.
 */
import { createHash } from 'node:crypto';
export class IdempotencyStore {
    records = new Map();
    defaultTtlMs = 60 * 1000; // 60 seconds TTL
    hashPayload(payload) {
        return createHash('sha256').update(JSON.stringify(payload || {})).digest('hex');
    }
    acquireOrCheck(key, payload) {
        this.evictExpired();
        const existing = this.records.get(key);
        if (!existing) {
            // First time seeing this key: Mark as PROCESSING
            this.records.set(key, {
                key,
                requestHash: this.hashPayload(payload),
                status: 'PROCESSING',
                createdAt: Date.now(),
                expiresAt: Date.now() + this.defaultTtlMs,
            });
            return { action: 'PROCEED' };
        }
        if (existing.status === 'PROCESSING') {
            return { action: 'CONFLICT_IN_FLIGHT' };
        }
        // Status is COMPLETED: Verify payload hash matches
        const currentHash = this.hashPayload(payload);
        if (existing.requestHash !== currentHash) {
            throw new Error('422 Unprocessable: Idempotency key reused with different request payload!');
        }
        return { action: 'RETURN_CACHED', record: existing };
    }
    saveResult(key, statusCode, responseBody) {
        const record = this.records.get(key);
        if (record) {
            record.status = 'COMPLETED';
            record.statusCode = statusCode;
            record.responseBody = responseBody;
        }
    }
    evictExpired() {
        const now = Date.now();
        for (const [key, record] of this.records.entries()) {
            if (record.expiresAt <= now) {
                this.records.delete(key);
            }
        }
    }
    clear() {
        this.records.clear();
    }
}
export const globalIdempotencyStore = new IdempotencyStore();
