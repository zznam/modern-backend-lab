/**
 * Memory Management, Garbage Collection & Leak Debugging Lab
 * Demonstrates V8 heap structure, GC mechanisms (Scavenge vs Mark-Sweep-Compact),
 * and intentional memory leaks with live detection tools.
 */
import v8 from 'node:v8';
import { EventEmitter } from 'node:events';

export interface MemoryReport {
  rssMb: number;
  heapTotalMb: number;
  heapUsedMb: number;
  externalMb: number;
  heapLimitMb: number;
  v8Spaces: Array<{ spaceName: string; sizeMb: number; usedMb: number; availableMb: number }>;
}

export class MemoryDiagnostics {
  public static getReport(): MemoryReport {
    const mem = process.memoryUsage();
    const v8Stats = v8.getHeapStatistics();
    const v8Spaces = v8.getHeapSpaceStatistics().map((s) => ({
      spaceName: s.space_name,
      sizeMb: Math.round((s.space_size / 1024 / 1024) * 100) / 100,
      usedMb: Math.round((s.space_used_size / 1024 / 1024) * 100) / 100,
      availableMb: Math.round((s.space_available_size / 1024 / 1024) * 100) / 100,
    }));

    return {
      rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
      heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
      heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
      externalMb: Math.round((mem.external / 1024 / 1024) * 100) / 100,
      heapLimitMb: Math.round((v8Stats.heap_size_limit / 1024 / 1024) * 100) / 100,
      v8Spaces,
    };
  }

  public static forceGC(): boolean {
    if (global.gc) {
      global.gc();
      return true;
    }
    return false;
  }
}

// Leak Scenario Store
const leakyCache = new Map<string, any>();
const leakyEmitter = new EventEmitter();
let unusedClosureRoot: any = null;

export class MemoryLeakSimulator {
  // Pattern 1: Unbounded In-Memory Cache (no LRU, no TTL)
  public static simulateUnboundedCacheLeak(items: number = 5000): { added: number; cacheSize: number } {
    for (let i = 0; i < items; i++) {
      const key = `user_session_${Date.now()}_${Math.random()}`;
      // Allocate ~1KB payload per item
      leakyCache.set(key, {
        payload: 'X'.repeat(1024),
        timestamp: Date.now(),
        metadata: { ip: '192.168.1.1', agent: 'Mozilla/5.0' },
      });
    }
    return { added: items, cacheSize: leakyCache.size };
  }

  // Pattern 2: Dangling Event Listener (holding closure reference to big context)
  public static simulateEventListenerLeak(listeners: number = 2000): number {
    for (let i = 0; i < listeners; i++) {
      const largeContext = new Array(1000).fill('dangling_context_leak');
      leakyEmitter.on('user_action', () => {
        // Closure retains largeContext indefinitely
        if (largeContext.length < 0) console.log('unreachable');
      });
    }
    return leakyEmitter.listenerCount('user_action');
  }

  // Pattern 3: Closure Scope Retention (The Meteor "Star Leak" pattern)
  public static simulateClosureScopeLeak(iterations: number = 1000): void {
    for (let i = 0; i < iterations; i++) {
      const originalRoot = unusedClosureRoot;
      const unused = () => {
        if (originalRoot) console.log('held');
      };
      unusedClosureRoot = {
        longStr: new Array(2000).join('*'),
        someMethod: () => {
          // Because unused shares the parent lexical scope with someMethod,
          // originalRoot is kept in memory!
          return 'hello';
        },
      };
    }
  }

  public static clearLeaks(): void {
    leakyCache.clear();
    leakyEmitter.removeAllListeners();
    unusedClosureRoot = null;
    MemoryDiagnostics.forceGC();
  }
}

export async function runMemoryLeakExperiment(): Promise<{
  baseline: MemoryReport;
  afterLeaks: MemoryReport;
  afterCleanup: MemoryReport;
  analysis: {
    heapGrowthMb: number;
    retainedObjects: string;
    v8HeapExplanation: string;
  };
}> {
  MemoryDiagnostics.forceGC();
  const baseline = MemoryDiagnostics.getReport();

  // Trigger leaks
  MemoryLeakSimulator.simulateUnboundedCacheLeak(3000);
  MemoryLeakSimulator.simulateEventListenerLeak(1500);
  MemoryLeakSimulator.simulateClosureScopeLeak(1000);

  const afterLeaks = MemoryDiagnostics.getReport();

  // Cleanup
  MemoryLeakSimulator.clearLeaks();
  const afterCleanup = MemoryDiagnostics.getReport();

  return {
    baseline,
    afterLeaks,
    afterCleanup,
    analysis: {
      heapGrowthMb: Math.round((afterLeaks.heapUsedMb - baseline.heapUsedMb) * 100) / 100,
      retainedObjects: 'Simulated 3,000 un-evicted cache keys, 1,500 dangling closures, and 1,000 chained scope objects.',
      v8HeapExplanation:
        'V8 organizes heap into New Space (Semi-space From & To for Young objects via Cheney Scavenge) and Old Space (Mark-Sweep & Mark-Compact for survived Long-lived objects). Leaked objects survive scavenge cycles and get promoted to Old Space, causing steadily increasing RSS and eventually OOM crashes.',
    },
  };
}
