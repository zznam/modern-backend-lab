/**
 * Event Loop Mechanics Demo
 * Records observed execution order; ESM and microtask context can change nextTick/Promise ordering:
 * 1. Microtask Queue: process.nextTick (highest priority) -> Promise.then / queueMicrotask
 * 2. Macrotask Queue: Timers (setTimeout/setInterval) -> I/O poll -> setImmediate (Check phase)
 */

export interface EventLoopTraceStep {
  step: number;
  phase: string;
  type: 'microtask' | 'macrotask' | 'sync' | 'io';
  label: string;
  timestamp: number;
  explanation: string;
}

export async function runEventLoopExperiment(): Promise<{
  trace: EventLoopTraceStep[];
  explanation: Record<string, string>;
}> {
  const trace: EventLoopTraceStep[] = [];
  const start = Date.now();

  const record = (
    phase: string,
    type: 'microtask' | 'macrotask' | 'sync' | 'io',
    label: string,
    explanation: string
  ) => {
    trace.push({
      step: trace.length + 1,
      phase,
      type,
      label,
      timestamp: Date.now() - start,
      explanation,
    });
  };

  // 1. Synchronous Execution
  record('Call Stack', 'sync', 'Synchronous Code Line 1', 'Main script execution phase. Always executes first on Call Stack.');

  await new Promise<void>((resolve) => {
    // Macrotask: Timers phase
    setTimeout(() => {
      record(
        'Timers Phase',
        'macrotask',
        'setTimeout(..., 0)',
        'Executes callbacks scheduled by setTimeout/setInterval when timer expires.'
      );
    }, 0);

    // Macrotask: Check phase
    setImmediate(() => {
      record(
        'Check Phase',
        'macrotask',
        'setImmediate(...)',
        'Executes in the Check phase right after I/O polling completes.'
      );
      // Resolve experiment after all phases complete
      setTimeout(() => resolve(), 20);
    });

    // Microtask: process.nextTick
    process.nextTick(() => {
      record(
        'Next Tick Queue',
        'microtask',
        'process.nextTick(...)',
        'Runs when Node drains the nextTick queue. Ordinary callbacks drain this before Promise microtasks; ESM evaluation or an existing microtask can change their relative order.'
      );
    });

    // Microtask: Promise resolution
    Promise.resolve().then(() => {
      record(
        'Promise Microtask Queue',
        'microtask',
        'Promise.resolve().then(...)',
        'Runs at the Promise microtask checkpoint before the next event-loop phase. Its order relative to nextTick depends on the calling context.'
      );
    });

    // Another Synchronous step
    record('Call Stack', 'sync', 'Synchronous Code Line 2', 'Synchronous execution continues until Call Stack is empty.');
  });

  return {
    trace,
    explanation: {
      'Call Stack': 'Synchronous execution runs to completion before event loop checks any queue.',
      'process.nextTick': 'Not part of libuv loop itself; processed immediately after current tick completes.',
      'Promise Microtasks': 'Drained at microtask checkpoints; ESM evaluation itself runs in the microtask queue.',
      'Timers (setTimeout)': 'Libuv timers min-heap checked when time threshold is reached.',
      'Ordering': 'Timers and immediates have no universal ordering outside an I/O callback; this trace reports the actual run.',
      'Check (setImmediate)': 'Designed to execute scripts immediately once I/O poll phase completes.',
    },
  };
}
