/**
 * Worker Threads & Concurrency Lab
 * Demonstrates CPU-bound event loop blocking vs Worker Thread Pool offloading.
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

// Heavy CPU computation: calculates primes up to N
export function computePrimesSync(limit: number): number[] {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 80000) throw new RangeError('Prime count must be between 1 and 80000');
  const primes: number[] = [];
  for (let i = 2; primes.length < limit; i++) {
    let isPrime = true;
    for (let j = 2; j * j <= i; j++) {
      if (i % j === 0) {
        isPrime = false;
        break;
      }
    }
    if (isPrime) primes.push(i);
  }
  return primes;
}

// Worker thread execution entry point
if (!isMainThread && parentPort) {
  const { limit } = workerData;
  const start = performance.now();
  const primes = computePrimesSync(limit);
  const duration = performance.now() - start;
  parentPort.postMessage({ primeCount: primes.length, largest: primes[primes.length - 1], duration });
}

// Measure Event Loop Delay while executing a task
export async function measureEventLoopLag(durationMs: number): Promise<number> {
  return new Promise((resolve) => {
    const start = performance.now();
    const interval = 10;
    let maxLag = 0;
    let checks = 0;
    let prev = start;

    const timer = setInterval(() => {
      const now = performance.now();
      const delay = now - prev - interval;
      if (delay > maxLag) maxLag = delay;
      prev = now;
      checks++;

      if (now - start >= durationMs) {
        clearInterval(timer);
        resolve(Math.round(maxLag * 100) / 100);
      }
    }, interval);
  });
}

// Offload CPU-bound task to Worker Thread
export function runInWorkerThread(limit: number): Promise<{ primeCount: number; largest: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const currentFilePath = fileURLToPath(import.meta.url);
    const worker = new Worker(currentFilePath, {
      workerData: { limit },
    });

    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
}

export async function compareSyncVsWorkerConcurrency(limit: number = 25000): Promise<{
  syncRun: { durationMs: number; eventLoopLagMs: number; blockedHeartbeats: number };
  workerRun: { durationMs: number; eventLoopLagMs: number; blockedHeartbeats: number };
  verdict: string;
}> {
  // Scenario A: Synchronous on Main Thread
  let syncLag = 0;
  const heartbeatLag = 10;
  let heartbeatsDuringSync = 0;
  const syncTimer = setInterval(() => {
    heartbeatsDuringSync++;
  }, heartbeatLag);

  const syncStart = performance.now();
  computePrimesSync(limit);
  const syncDuration = performance.now() - syncStart;
  clearInterval(syncTimer);
  // During heavy sync CPU work, the interval couldn't fire, so heartbeats will be 0 or close to 0!
  syncLag = Math.max(0, Math.round(syncDuration));

  // Scenario B: Worker Thread
  let heartbeatsDuringWorker = 0;
  let previousTick = performance.now();
  let workerLag = 0;
  const workerTimer = setInterval(() => {
    const now = performance.now();
    workerLag = Math.max(workerLag, now - previousTick - heartbeatLag);
    previousTick = now;
    heartbeatsDuringWorker++;
  }, heartbeatLag);

  const workerStart = performance.now();
  let workerDuration: number;
  try {
    await runInWorkerThread(limit);
    workerDuration = performance.now() - workerStart;
  } finally { clearInterval(workerTimer); }

  return {
    syncRun: {
      durationMs: Math.round(syncDuration),
      eventLoopLagMs: syncLag,
      blockedHeartbeats: heartbeatsDuringSync,
    },
    workerRun: {
      durationMs: Math.round(workerDuration),
      eventLoopLagMs: Math.round(workerLag * 100) / 100,
      blockedHeartbeats: heartbeatsDuringWorker,
    },
    verdict: `Sync execution stalled the Event Loop for ${Math.round(syncDuration)}ms (0 heartbeats fired!). Worker Thread ran parallel with ${Math.round(workerLag * 100) / 100}ms measured maximum timer lag (${heartbeatsDuringWorker} responsive ticks).`,
  };
}
