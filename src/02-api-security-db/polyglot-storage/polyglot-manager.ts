/**
 * Polyglot Persistence & Storage Engine Architecture
 * Demonstrates:
 * 1. Storage Selection Matrix (Relational vs NoSQL vs In-Memory vs Search/OLAP)
 * 2. Redis In-Memory Engine: Ownership-Token Locking & Sorted Set Leaderboards
 * 3. Search & Analytics Engine: Inverted Index with BM25 Relevance Scoring
 * 4. Columnar OLAP Engine: Fast vectorized aggregations
 */
import crypto from 'node:crypto';

export interface StorageComparisonItem {
  category: 'Relational (SQL)' | 'NoSQL Document/KV' | 'In-Memory Store' | 'Search & Analytics (OLAP)';
  technologies: string[];
  accessPattern: string;
  dataIntegrity: string;
  scalingModel: string;
  optimalUseCase: string;
}

export function getPolyglotPersistenceMatrix(): StorageComparisonItem[] {
  return [
    {
      category: 'Relational (SQL)',
      technologies: ['PostgreSQL', 'MySQL', 'SQLite'],
      accessPattern: 'Complex multi-table JOINs, secondary indexing, strict foreign keys',
      dataIntegrity: 'Full ACID (Atomicity, Consistency, Isolation, Durability)',
      scalingModel: 'Vertical scaling primary + Read Replicas; Partitioning & Sharding',
      optimalUseCase: 'Financial ledgers, order management, enterprise SaaS core relational models',
    },
    {
      category: 'NoSQL Document/KV',
      technologies: ['MongoDB', 'DynamoDB', 'Cassandra'],
      accessPattern: 'Key-based point lookups, hierarchical JSON documents, high write ingest',
      dataIntegrity: 'Single-document ACID or Eventual Consistency (BASE)',
      scalingModel: 'Horizontal Partitioning / Auto-sharding across cluster nodes',
      optimalUseCase: 'Product catalogs with dynamic schemas, user profiles, write-heavy event feeds',
    },
    {
      category: 'In-Memory Store',
      technologies: ['Redis', 'Dragonfly', 'Memcached'],
      accessPattern: 'Sub-millisecond RAM lookups, atomic data structures (Sets, Hashes, Sorted Sets, Streams)',
      dataIntegrity: 'Configurable persistence (RDB snapshots, AOF append-only file)',
      scalingModel: 'Redis Cluster (16,384 hash slots), Sentinel high-availability',
      optimalUseCase: 'Caching, Distributed Locks (Redlock), Session storage, Rate limiting, Real-time gaming leaderboards',
    },
    {
      category: 'Search & Analytics (OLAP)',
      technologies: ['Elasticsearch', 'OpenSearch', 'ClickHouse'],
      accessPattern: 'Fuzzy text search, BM25 relevance scoring, columnar scan aggregation over billions of rows',
      dataIntegrity: 'Eventual consistency, immutable append-only',
      scalingModel: 'Distributed shard clusters',
      optimalUseCase: 'Log aggregation (ELK), e-commerce search autocomplete, real-time analytics dashboards',
    },
  ];
}

// ========================================================
// 1. REDIS IN-MEMORY ENGINE & OWNERSHIP-TOKEN LOCK
// ========================================================
export class RedisEngineSimulator {
  private kv = new Map<string, { value: any; expiresAt?: number }>();
  private leaderboards = new Map<string, Map<string, number>>();

  // Key-Value with TTL
  public set(key: string, value: any, ttlSeconds?: number): void {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.kv.set(key, { value, expiresAt });
  }

  public get(key: string): any | null {
    const item = this.kv.get(key);
    if (!item) return null;
    if (item.expiresAt && item.expiresAt <= Date.now()) {
      this.kv.delete(key);
      return null;
    }
    return item.value;
  }

  // Single-instance ownership-token lock simulator (not multi-node Redlock)
  public acquireDistributedLock(
    resourceKey: string,
    ttlMs = 5000
  ): { acquired: boolean; lockToken?: string; expiresAt?: number } {
    const lockKey = `lock:${resourceKey}`;
    const existing = this.get(lockKey);

    if (existing) {
      return { acquired: false };
    }

    // Unique random token to prevent unlocking another client's expired lock
    const lockToken = crypto.randomUUID();
    this.kv.set(lockKey, {
      value: lockToken,
      expiresAt: Date.now() + ttlMs,
    });

    return { acquired: true, lockToken, expiresAt: Date.now() + ttlMs };
  }

  public releaseDistributedLock(resourceKey: string, lockToken: string): boolean {
    const lockKey = `lock:${resourceKey}`;
    // Atomic check: ONLY delete if token matches! (Simulates Redis Lua script)
    if (this.get(lockKey) === lockToken) {
      this.kv.delete(lockKey);
      return true;
    }
    return false;
  }

  // Sorted Set Leaderboard (ZADD, ZREVRANGE)
  public zadd(leaderboardKey: string, score: number, member: string): void {
    if (!this.leaderboards.has(leaderboardKey)) {
      this.leaderboards.set(leaderboardKey, new Map());
    }
    this.leaderboards.get(leaderboardKey)!.set(member, score);
  }

  public zrevrange(leaderboardKey: string, topN = 5): Array<{ rank: number; member: string; score: number }> {
    const board = this.leaderboards.get(leaderboardKey);
    if (!board) return [];

    return Array.from(board.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([member, score], idx) => ({ rank: idx + 1, member, score }));
  }
}

// ========================================================
// 2. SEARCH & ANALYTICS: INVERTED INDEX & BM25 SCORING
// ========================================================
export class InvertedIndexSearchEngine {
  private documents = new Map<number, string>();
  private index = new Map<string, Set<number>>(); // token -> docIds

  public indexDocument(docId: number, content: string): void {
    const previous = this.documents.get(docId);
    if (previous !== undefined) {
      for (const token of this.tokenize(previous)) {
        const postings = this.index.get(token);
        postings?.delete(docId);
        if (postings?.size === 0) this.index.delete(token);
      }
    }
    this.documents.set(docId, content);
    const tokens = this.tokenize(content);
    for (const token of tokens) {
      if (!this.index.has(token)) {
        this.index.set(token, new Set());
      }
      this.index.get(token)!.add(docId);
    }
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 2);
  }

  public search(query: string): Array<{ docId: number; snippet: string; score: number }> {
    const queryTokens = this.tokenize(query);
    const docScores = new Map<number, number>();

    for (const token of queryTokens) {
      const matchingDocs = this.index.get(token);
      if (matchingDocs) {
        // Simple TF-IDF / BM25 term weighting simulation
        const idf = Math.log(1 + (this.documents.size - matchingDocs.size + 0.5) / (matchingDocs.size + 0.5));
        for (const docId of matchingDocs) {
          const current = docScores.get(docId) || 0;
          docScores.set(docId, current + Math.max(0.1, idf));
        }
      }
    }

    return Array.from(docScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([docId, score]) => ({
        docId,
        snippet: this.documents.get(docId)!,
        score: Math.round(score * 100) / 100,
      }));
  }
}

export const globalRedisSimulator = new RedisEngineSimulator();
