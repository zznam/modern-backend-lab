/**
 * Database Performance Tuning: Indexes, Execution Plans, Connection Pooling & Sharding
 */

export interface IndexTypeSpec {
  type: 'B-Tree' | 'Hash' | 'GIN' | 'GiST' | 'BRIN';
  timeComplexity: string;
  supportsRangeQueries: boolean;
  supportsSorting: boolean;
  bestUseCases: string[];
  underlyingStructure: string;
}

export function getIndexTypesComparison(): IndexTypeSpec[] {
  return [
    {
      type: 'B-Tree',
      timeComplexity: 'O(log N)',
      supportsRangeQueries: true,
      supportsSorting: true,
      bestUseCases: ['Primary keys', 'Foreign keys', 'Timestamps (WHERE date BETWEEN ...)', 'ORDER BY clauses'],
      underlyingStructure: 'Self-balancing multi-way search tree with sorted leaves connected via linked list.',
    },
    {
      type: 'Hash',
      timeComplexity: 'O(1)',
      supportsRangeQueries: false,
      supportsSorting: false,
      bestUseCases: ['Exact equality lookups (WHERE email = ?)', 'Unique token checks'],
      underlyingStructure: 'Hash table mapping hash code to bucket of tuple pointers.',
    },
    {
      type: 'GIN',
      timeComplexity: 'O(log N) per key element',
      supportsRangeQueries: false,
      supportsSorting: false,
      bestUseCases: ['JSONB field containment (data @> \'{"role": "admin"}\')', 'Full-text search', 'Array columns'],
      underlyingStructure: 'Generalized Inverted Index mapping every internal value to an array of heap pointers.',
    },
    {
      type: 'GiST',
      timeComplexity: 'O(log N)',
      supportsRangeQueries: true,
      supportsSorting: false,
      bestUseCases: ['Geographic points (PostGIS ST_DWithin)', 'Geometric overlap (shapes, bounding boxes)', 'Trigram fuzzy text search'],
      underlyingStructure: 'Generalized Search Tree with user-defined hierarchical bounding predicates.',
    },
    {
      type: 'BRIN',
      timeComplexity: 'O(N) within block range',
      supportsRangeQueries: true,
      supportsSorting: false,
      bestUseCases: ['Huge append-only tables (100M+ rows) naturally sorted by timestamp or auto-incrementing ID'],
      underlyingStructure: 'Block Range Index storing only minimum and maximum values per 128-page disk block (uses < 1% of B-Tree RAM).',
    },
  ];
}

export interface ExplainPlanAnalysis {
  scanType: 'Seq Scan' | 'Index Scan' | 'Index Only Scan' | 'Bitmap Heap Scan';
  estimatedCost: string;
  actualDurationMs: number;
  bufferHits: number;
  bufferReads: number;
  cacheHitRatioPercent: number;
  recommendation: string;
}

export function analyzeExecutionPlan(query: string, hasIndex: boolean, rowCount = 1000000): ExplainPlanAnalysis {
  if (!hasIndex) {
    return {
      scanType: 'Seq Scan',
      estimatedCost: '0.00..18450.00',
      actualDurationMs: 420.5,
      bufferHits: 120,
      bufferReads: 8450,
      cacheHitRatioPercent: 1.4,
      recommendation:
        'CRITICAL BOTTLENECK: Full Sequential Scan on 1M rows! Disk I/O bound. Add a composite B-Tree index on (tenant_id, created_at DESC).',
    };
  }

  return {
    scanType: 'Index Only Scan',
    estimatedCost: '0.42..8.45',
    actualDurationMs: 0.12,
    bufferHits: 4,
    bufferReads: 0,
    cacheHitRatioPercent: 100.0,
    recommendation:
      'OPTIMAL: Index Only Scan satisfied query directly from RAM buffer cache without touching the underlying heap table pages!',
  };
}

// Connection Pool Sizing Simulator
export function calculateOptimalConnectionPool(cpuCores: number, diskIsSsd: boolean): {
  formula: string;
  recommendedPoolSize: number;
  explanation: string;
} {
  // PostgreSQL official & HikariCP formula: connections = ((cpu_cores * 2) + effective_spindle_count)
  const spindleCount = diskIsSsd ? 1 : 4;
  const recommended = cpuCores * 2 + spindleCount;

  return {
    formula: `connections = ((cores * 2) + disk_spindle_count)`,
    recommendedPoolSize: recommended,
    explanation:
      'Counterintuitively, setting connection pools to 100+ on an 8-core CPU SLOWS DOWN throughput by causing severe CPU context switching, disk head thrashing, and OS thread contention. A tight pool of 17-20 connections produces maximum possible RPS.',
  };
}
