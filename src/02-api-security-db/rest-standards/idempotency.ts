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

export interface IdempotencyRecord {
  key: string;
  requestHash: string;
  status: 'PROCESSING' | 'COMPLETED';
  statusCode?: number;
  responseBody?: any;
  createdAt: number;
  expiresAt: number;
}

export class IdempotencyStore {
  private records = new Map<string, IdempotencyRecord>();
  private defaultTtlMs = 60 * 1000; // 60 seconds TTL

  public hashPayload(payload: any): string {
    return createHash('sha256').update(JSON.stringify(payload || {})).digest('hex');
  }

  public acquireOrCheck(
    key: string,
    payload: any
  ): { action: 'PROCEED' } | { action: 'RETURN_CACHED'; record: IdempotencyRecord } | { action: 'CONFLICT_IN_FLIGHT' } {
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

  public saveResult(key: string, statusCode: number, responseBody: any): void {
    const record = this.records.get(key);
    if (record) {
      record.status = 'COMPLETED';
      record.statusCode = statusCode;
      record.responseBody = responseBody;
    }
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, record] of this.records.entries()) {
      if (record.expiresAt <= now) {
        this.records.delete(key);
      }
    }
  }

  public clear(): void {
    this.records.clear();
  }
}

export const globalIdempotencyStore = new IdempotencyStore();
