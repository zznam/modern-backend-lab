/**
 * Caching Strategies & Pitfalls Lab
 * Demonstrates:
 * 1. Patterns: Cache-Aside, Write-Through, Write-Behind
 * 2. Pitfalls: Cache Stampede (Thundering Herd), Cache Penetration, Cache Breakdown
 * 3. Defenses: Singleflight Mutex, XFetch Probabilistic Expiration, Bloom Filter
 */
import { BloomFilter } from '../../01-runtime-systems/data-structures/data-structures.js';

export class CachingEngineLab {
  private cache = new Map<string, { value: any; expiresAt: number }>();
  private database = new Map<string, any>();
  private inFlightSingleflight = new Map<string, Promise<any>>();
  private bloomFilter = new BloomFilter(1000, 0.01);

  public dbQueryCount = 0;

  constructor() {
    this.seedDatabase();
  }

  private seedDatabase(): void {
    for (let i = 1; i <= 50; i++) {
      const key = `product_${i}`;
      this.database.set(key, { id: i, name: `MacBook Pro M${i}`, price: 1999 + i * 50 });
      this.bloomFilter.add(key);
    }
  }

  // ========================================================
  // 1. CACHE-ASIDE PATTERN
  // ========================================================
  public async getCacheAside(key: string, ttlSeconds = 10): Promise<{ source: 'CACHE' | 'DB'; data: any }> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return { source: 'CACHE', data: cached.value };
    }

    // Cache Miss -> Query DB
    this.dbQueryCount++;
    await new Promise((r) => setTimeout(r, 10)); // DB latency
    const dbData = this.database.get(key);

    if (dbData) {
      this.cache.set(key, { value: dbData, expiresAt: Date.now() + ttlSeconds * 1000 });
    }

    return { source: 'DB', data: dbData };
  }

  // ========================================================
  // 2. CACHE STAMPEDE (THUNDERING HERD) SIMULATION
  // ========================================================
  // Scenario A: Without Mutex / Singleflight (The Disaster)
  public async simulateStampedeWithoutMutex(
    hotKey = 'product_1',
    concurrentRequests = 100
  ): Promise<{ dbQueriesFired: number; durationMs: number }> {
    // Force cache key to be expired
    this.cache.delete(hotKey);
    const initialDbCount = this.dbQueryCount;
    const start = performance.now();

    // 100 simultaneous requests fire when key expires
    const promises = Array.from({ length: concurrentRequests }).map(() => this.getCacheAside(hotKey));
    await Promise.all(promises);

    const duration = performance.now() - start;
    const dbQueriesFired = this.dbQueryCount - initialDbCount;

    return {
      dbQueriesFired,
      durationMs: Math.round(duration * 100) / 100,
    };
  }

  // Scenario B: With Singleflight / Mutex (The Optimal Defense)
  public async getWithSingleflightMutex(hotKey: string, ttlSeconds = 10): Promise<{ source: 'CACHE' | 'DB'; data: any }> {
    const cached = this.cache.get(hotKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { source: 'CACHE', data: cached.value };
    }

    // If another request is ALREADY fetching this key from DB, join its promise!
    if (this.inFlightSingleflight.has(hotKey)) {
      const data = await this.inFlightSingleflight.get(hotKey)!;
      return { source: 'DB', data };
    }

    // First request: Create singleflight promise
    const fetchPromise = (async () => {
      this.dbQueryCount++;
      await new Promise((r) => setTimeout(r, 10)); // Simulated DB latency
      const dbData = this.database.get(hotKey);
      if (dbData) {
        this.cache.set(hotKey, { value: dbData, expiresAt: Date.now() + ttlSeconds * 1000 });
      }
      return dbData;
    })();

    this.inFlightSingleflight.set(hotKey, fetchPromise);

    try {
      const data = await fetchPromise;
      return { source: 'DB', data };
    } finally {
      this.inFlightSingleflight.delete(hotKey);
    }
  }

  public async simulateStampedeWithSingleflight(
    hotKey = 'product_1',
    concurrentRequests = 100
  ): Promise<{ dbQueriesFired: number; durationMs: number }> {
    this.cache.delete(hotKey);
    const initialDbCount = this.dbQueryCount;
    const start = performance.now();

    const promises = Array.from({ length: concurrentRequests }).map(() => this.getWithSingleflightMutex(hotKey));
    await Promise.all(promises);

    const duration = performance.now() - start;
    const dbQueriesFired = this.dbQueryCount - initialDbCount;

    return {
      dbQueriesFired,
      durationMs: Math.round(duration * 100) / 100,
    };
  }

  // ========================================================
  // 3. CACHE PENETRATION DEFENSE (Bloom Filter)
  // ========================================================
  public queryWithPenetrationDefense(nonExistentKey: string): {
    blockedByBloomFilter: boolean;
    dbTouched: boolean;
    reason: string;
  } {
    // 1. Check Bloom Filter
    if (!this.bloomFilter.test(nonExistentKey)) {
      return {
        blockedByBloomFilter: true,
        dbTouched: false,
        reason: 'Bloom Filter proved key does not exist with 100% certainty. DB query bypassed!',
      };
    }

    // If bloom filter returned true (or false positive), query DB
    this.dbQueryCount++;
    return {
      blockedByBloomFilter: false,
      dbTouched: true,
      reason: 'Key passed Bloom filter test, checking DB...',
    };
  }
}
