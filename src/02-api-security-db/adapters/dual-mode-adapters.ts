/**
 * Dual-Mode Database & Cache Adapters
 * Provides seamless dual-mode execution:
 * 1. Real PostgreSQL (via 'pg' Pool) when DATABASE_URL is set; uses an in-memory ACID store only when unconfigured.
 * 2. Real Redis (via 'ioredis') when REDIS_URL is set; uses an in-memory Redis simulator only when unconfigured.
 */
import pg from 'pg';
import { Redis } from 'ioredis';
import crypto from 'node:crypto';
import { RedisEngineSimulator } from '../polyglot-storage/polyglot-manager.js';
import { AcidSimulator } from '../rdbms-acid/acid-transactions.js';

export interface AdapterHealthStatus {
  service: 'PostgreSQL' | 'Redis';
  mode: 'LIVE_DATABASE' | 'IN_MEMORY_FALLBACK';
  status: 'CONNECTED' | 'DISCONNECTED' | 'FALLBACK_READY';
  endpoint?: string;
  latencyMs?: number;
  error?: string;
}

function safeEndpoint(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch { return 'invalid-endpoint'; }
}

// Expected teaching outcomes are returned as rollback results. SQL/connection
// failures must still reject so callers cannot report an unavailable lab as run.
class TransferRejectedError extends Error {}

// ========================================================
// 1. DUAL-MODE POSTGRESQL ADAPTER
// ========================================================
export class DualModePostgresAdapter {
  private pool: pg.Pool | null = null;
  private inMemoryFallback: AcidSimulator;
  private databaseUrl?: string;
  private isConnected = false;
  private schemaReady = false;

  constructor(databaseUrl?: string) {
    this.databaseUrl = databaseUrl || process.env.DATABASE_URL;
    this.inMemoryFallback = new AcidSimulator();

    if (this.databaseUrl) {
      try {
        this.pool = new pg.Pool({
          connectionString: this.databaseUrl,
          connectionTimeoutMillis: 3000,
          query_timeout: 3000,
          statement_timeout: 3000,
          max: 10,
        });

        // Suppress unhandled error events on idle clients
        this.pool.on('error', (err) => {
          this.isConnected = false;
        });
      } catch (err) {
        this.pool = null;
      }
    }
  }

  public getMode(): 'LIVE_DATABASE' | 'IN_MEMORY_FALLBACK' {
    return this.databaseUrl ? 'LIVE_DATABASE' : 'IN_MEMORY_FALLBACK';
  }

  public async initSchema(): Promise<void> {
    if (!this.pool) return;

    try {
      const client = await this.pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS accounts (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(50) NOT NULL,
            balance NUMERIC NOT NULL,
            version INT NOT NULL DEFAULT 1
          );
        `);
        // Concurrent app replicas may initialize the same database.
        await client.query(`
          INSERT INTO accounts (id, name, balance, version) VALUES
            ('acc_alice', 'Alice', 1000, 1), ('acc_bob', 'Bob', 500, 1)
          ON CONFLICT (id) DO NOTHING;
        `);
        this.isConnected = true;
        this.schemaReady = true;
      } finally {
        client.release();
      }
    } catch {
      this.isConnected = false;
      this.schemaReady = false;
    }
  }

  public async query(text: string, params: any[] = []): Promise<pg.QueryResult<any> | { rows: any[]; rowCount: number }> {
    if (this.pool) {
      try {
        const result = await this.pool.query(text, params);
        this.isConnected = true;
        return result;
      } catch (err) {
        this.isConnected = false;
        throw err;
      }
    }
    if (this.databaseUrl) throw new Error('PostgreSQL is configured but unavailable');

    // In-memory simulation fallback
    return {
      rows: [
        this.inMemoryFallback.getAccount('acc_alice'),
        this.inMemoryFallback.getAccount('acc_bob'),
      ].filter(Boolean),
      rowCount: 2,
    };
  }

  public async executeAtomicTransfer(
    fromId: string,
    toId: string,
    amount: number,
    simulateCrashAtStep = 0
  ): Promise<{ success: boolean; rolledBack: boolean; balances: Record<string, number>; reason: string; mode: string }> {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be finite and positive');
    if (fromId === toId) throw new Error('Sender and recipient must differ');
    if (this.pool) {
      const client = await this.pool.connect();
      let committed = false;
      let discardConnection = false;
      try {
        await client.query('BEGIN');
        // Lock both accounts in stable order to avoid reciprocal-transfer deadlocks.
        const accounts = await client.query('SELECT id, balance FROM accounts WHERE id IN ($1, $2) ORDER BY id FOR UPDATE', [fromId, toId]);
        const from = accounts.rows.find(row => row.id === fromId);
        const to = accounts.rows.find(row => row.id === toId);
        if (!from || !to) throw new TransferRejectedError('Account not found');
        if (Number(from.balance) < amount) throw new TransferRejectedError('Insufficient funds');
        await client.query('UPDATE accounts SET balance = balance - $1, version = version + 1 WHERE id = $2', [amount, fromId]);
        if (simulateCrashAtStep === 1) throw new TransferRejectedError('Simulated crash after debit');
        await client.query('UPDATE accounts SET balance = balance + $1, version = version + 1 WHERE id = $2', [amount, toId]);
        if (simulateCrashAtStep === 2) throw new TransferRejectedError('Simulated crash after credit');
        const finalBalances = await client.query('SELECT id, balance FROM accounts WHERE id IN ($1, $2)', [fromId, toId]);
        await client.query('COMMIT');
        committed = true;
        this.isConnected = true;
        return { success: true, rolledBack: false,
          balances: Object.fromEntries(finalBalances.rows.map(row => [row.id, Number(row.balance)])),
          reason: 'PostgreSQL ACID transaction committed with ordered row locks.', mode: 'LIVE_DATABASE' };
      } catch (err) {
        // Never execute a second transfer against unrelated in-memory data after a live failure.
        if (!committed) {
          try { await client.query('ROLLBACK'); }
          catch (rollbackError) {
            discardConnection = true;
            this.isConnected = false;
            throw rollbackError;
          }
        }
        if (!(err instanceof TransferRejectedError)) {
          this.isConnected = false;
          throw err;
        }
        return { success: false, rolledBack: !committed, balances: {},
          reason: `PostgreSQL transaction failed: ${err instanceof Error ? err.message : String(err)}`, mode: 'LIVE_DATABASE' };
      } finally {
        client.release(discardConnection);
      }
    }
    if (this.databaseUrl) throw new Error('PostgreSQL is configured but unavailable');

    // In-Memory Fallback
    const simResult = await this.inMemoryFallback.executeAtomicTransfer(fromId, toId, amount, simulateCrashAtStep);
    return {
      ...simResult,
      mode: 'IN_MEMORY_FALLBACK',
    };
  }

  public async healthCheck(): Promise<AdapterHealthStatus> {
    const endpoint = this.databaseUrl ? safeEndpoint(this.databaseUrl) : undefined;

    if (!this.databaseUrl) {
      return {
        service: 'PostgreSQL',
        mode: 'IN_MEMORY_FALLBACK',
        status: 'FALLBACK_READY',
        endpoint: 'in-memory://acid-simulator',
      };
    }

    const start = performance.now();
    try {
      if (!this.pool) throw new Error('PostgreSQL client is unavailable');
      if (!this.schemaReady) await this.initSchema();
      if (!this.schemaReady) throw new Error('PostgreSQL schema initialization is incomplete');
      await this.pool.query('SELECT 1 FROM accounts LIMIT 1');
      this.isConnected = true;
      return {
        service: 'PostgreSQL',
        mode: 'LIVE_DATABASE',
        status: 'CONNECTED',
        endpoint,
        latencyMs: Math.round((performance.now() - start) * 100) / 100,
      };
    } catch (err: any) {
      this.isConnected = false;
      return {
        service: 'PostgreSQL',
        mode: 'LIVE_DATABASE',
        status: 'DISCONNECTED',
        endpoint,
        error: 'Configured service is unavailable',
      };
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
    }
  }
}

// ========================================================
// 2. DUAL-MODE REDIS ADAPTER
// ========================================================
export class DualModeRedisAdapter {
  private client: Redis | null = null;
  private inMemoryFallback: RedisEngineSimulator;
  private redisUrl?: string;
  private connectionPromise: Promise<boolean> | null = null;
  private isConnected = false;

  constructor(redisUrl?: string) {
    this.redisUrl = redisUrl || process.env.REDIS_URL;
    this.inMemoryFallback = new RedisEngineSimulator();

    if (this.redisUrl) {
      try {
        this.client = new Redis(this.redisUrl, {
          lazyConnect: true,
          connectTimeout: 2000,
          commandTimeout: 2000,
          maxRetriesPerRequest: 1,
          retryStrategy: () => null, // Do not spam retries on reconnect
        });

        this.client.on('ready', () => {
          this.isConnected = true;
        });

        this.client.on('error', () => {
          this.isConnected = false;
        });
      } catch {
        this.client = null;
      }
    }
  }

  public getMode(): 'LIVE_DATABASE' | 'IN_MEMORY_FALLBACK' {
    return this.redisUrl ? 'LIVE_DATABASE' : 'IN_MEMORY_FALLBACK';
  }

  public async connect(): Promise<boolean> {
    if (!this.client) return false;
    if (this.client.status === 'ready') return true;
    if (this.connectionPromise) return this.connectionPromise;
    this.connectionPromise = (async () => {
      try {
        await this.client!.connect();
        this.isConnected = true;
        return true;
      } catch {
        this.isConnected = false;
        return false;
      }
    })();
    try { return await this.connectionPromise; }
    finally { this.connectionPromise = null; }
  }

  private async requireConnection(): Promise<void> {
    if (!await this.connect()) throw new Error('Redis is configured but unavailable');
  }

  public async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined && (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0)) throw new Error('TTL must be a positive integer in seconds');
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('Value must be JSON serializable');

    if (this.client) {
      try {
        await this.requireConnection();
        if (ttlSeconds !== undefined) {
          await this.client.set(key, serialized, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, serialized);
        }
        return;
      } catch (err) {
        this.isConnected = false;
        throw err;
      }
    }
    if (this.redisUrl) throw new Error('Redis is configured but unavailable');

    this.inMemoryFallback.set(key, JSON.parse(serialized), ttlSeconds);
  }

  public async get(key: string): Promise<any | null> {
    if (this.client) {
      try {
        await this.requireConnection();
        const raw = await this.client.get(key);
        if (raw === null) return null;
        try {
          return JSON.parse(raw);
        } catch {
          return raw;
        }
      } catch (err) {
        this.isConnected = false;
        throw err;
      }
    }
    if (this.redisUrl) throw new Error('Redis is configured but unavailable');

    return this.inMemoryFallback.get(key);
  }

  public async acquireDistributedLock(
    resourceKey: string,
    ttlMs = 5000
  ): Promise<{ acquired: boolean; lockToken?: string; expiresAt?: number; mode: string }> {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('Lock TTL must be positive');
    const lockKey = `lock:${resourceKey}`;
    const lockToken = crypto.randomUUID();

    if (this.client) {
      try {
        await this.requireConnection();
        // Single-instance lock via SET NX PX
        const result = await this.client.set(lockKey, lockToken, 'PX', ttlMs, 'NX');
        if (result === 'OK') {
          return {
            acquired: true,
            lockToken,
            expiresAt: Date.now() + ttlMs,
            mode: 'LIVE_DATABASE',
          };
        }
        return { acquired: false, mode: 'LIVE_DATABASE' };
      } catch (err) {
        this.isConnected = false;
        throw err;
      }
    }
    if (this.redisUrl) throw new Error('Redis is configured but unavailable');

    const sim = this.inMemoryFallback.acquireDistributedLock(resourceKey, ttlMs);
    return {
      ...sim,
      mode: 'IN_MEMORY_FALLBACK',
    };
  }

  public async releaseDistributedLock(resourceKey: string, lockToken: string): Promise<{ released: boolean; mode: string }> {
    const lockKey = `lock:${resourceKey}`;

    if (this.client) {
      try {
        await this.requireConnection();
        // Atomic release via Lua script (check token before DEL)
        const luaScript = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        const res = await this.client.eval(luaScript, 1, lockKey, lockToken);
        return { released: res === 1, mode: 'LIVE_DATABASE' };
      } catch (err) {
        this.isConnected = false;
        throw err;
      }
    }
    if (this.redisUrl) throw new Error('Redis is configured but unavailable');

    const simReleased = this.inMemoryFallback.releaseDistributedLock(resourceKey, lockToken);
    return { released: simReleased, mode: 'IN_MEMORY_FALLBACK' };
  }

  public async zadd(leaderboardKey: string, score: number, member: string): Promise<void> {
    if (this.client) {
      try {
        await this.requireConnection();
        await this.client.zadd(leaderboardKey, score, member);
        return;
      } catch (err) {
        this.isConnected = false;
        throw err;
      }
    }
    if (this.redisUrl) throw new Error('Redis is configured but unavailable');

    this.inMemoryFallback.zadd(leaderboardKey, score, member);
  }

  public async zrevrange(
    leaderboardKey: string,
    topN = 5
  ): Promise<Array<{ rank: number; member: string; score: number }>> {
    if (!Number.isInteger(topN) || topN < 0) throw new Error('topN must be a nonnegative integer');
    if (topN === 0) return [];
    if (this.client) {
      try {
        await this.requireConnection();
        const raw = await this.client.zrevrange(leaderboardKey, 0, topN - 1, 'WITHSCORES');
        const results: Array<{ rank: number; member: string; score: number }> = [];
        for (let i = 0; i < raw.length; i += 2) {
          results.push({
            rank: i / 2 + 1,
            member: raw[i],
            score: parseFloat(raw[i + 1]),
          });
        }
        return results;
      } catch (err) {
        this.isConnected = false;
        throw err;
      }
    }
    if (this.redisUrl) throw new Error('Redis is configured but unavailable');

    return this.inMemoryFallback.zrevrange(leaderboardKey, topN);
  }

  public async healthCheck(): Promise<AdapterHealthStatus> {
    if (!this.redisUrl) {
      return {
        service: 'Redis',
        mode: 'IN_MEMORY_FALLBACK',
        status: 'FALLBACK_READY',
        endpoint: 'in-memory://redis-simulator',
      };
    }

    const start = performance.now();
    try {
      await this.requireConnection();
      await this.client!.ping();
      this.isConnected = true;
      return {
        service: 'Redis',
        mode: 'LIVE_DATABASE',
        status: 'CONNECTED',
        endpoint: safeEndpoint(this.redisUrl),
        latencyMs: Math.round((performance.now() - start) * 100) / 100,
      };
    } catch (err: any) {
      this.isConnected = false;
      return {
        service: 'Redis',
        mode: 'LIVE_DATABASE',
        status: 'DISCONNECTED',
        endpoint: safeEndpoint(this.redisUrl),
        error: 'Configured service is unavailable',
      };
    }
  }

  public async close(): Promise<void> {
    if (this.client) {
      try {
        this.client.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      this.isConnected = false;
    }
  }
}

// Global Singletons with environment awareness
export const globalPostgresAdapter = new DualModePostgresAdapter();
export const globalRedisAdapter = new DualModeRedisAdapter();
