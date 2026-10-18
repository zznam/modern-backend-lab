/**
 * Event Loop Mechanics Demo
 * Demonstrates the precise execution order of Node.js Event Loop phases:
 * 1. Microtask Queue: process.nextTick (highest priority) -> Promise.then / queueMicrotask
 * 2. Macrotask Queue: Timers (setTimeout/setInterval) -> I/O poll -> setImmediate (Check phase)
 */
export async function runEventLoopExperiment() {
    const trace = [];
    const start = Date.now();
    const record = (phase, type, label, explanation) => {
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
    await new Promise((resolve) => {
        // Macrotask: Timers phase
        setTimeout(() => {
            record('Timers Phase', 'macrotask', 'setTimeout(..., 0)', 'Executes callbacks scheduled by setTimeout/setInterval when timer expires.');
        }, 0);
        // Macrotask: Check phase
        setImmediate(() => {
            record('Check Phase', 'macrotask', 'setImmediate(...)', 'Executes in the Check phase right after I/O polling completes.');
            // Resolve experiment after all phases complete
            setTimeout(() => resolve(), 20);
        });
        // Microtask: process.nextTick
        process.nextTick(() => {
            record('Next Tick Queue', 'microtask', 'process.nextTick(...)', 'Runs immediately after the current synchronous operation finishes, before any Promise microtasks or event loop phases.');
        });
        // Microtask: Promise resolution
        Promise.resolve().then(() => {
            record('Promise Microtask Queue', 'microtask', 'Promise.resolve().then(...)', 'Microtasks run after nextTick queue, before the event loop advances to the next phase.');
        });
        // Another Synchronous step
        record('Call Stack', 'sync', 'Synchronous Code Line 2', 'Synchronous execution continues until Call Stack is empty.');
    });
    return {
        trace,
        explanation: {
            'Call Stack': 'Synchronous execution runs to completion before event loop checks any queue.',
            'process.nextTick': 'Not part of libuv loop itself; processed immediately after current tick completes.',
            'Promise Microtasks': 'Drained completely after nextTick and before next macrotask phase.',
            'Timers (setTimeout)': 'Libuv timers min-heap checked when time threshold is reached.',
            'Check (setImmediate)': 'Designed to execute scripts immediately once I/O poll phase completes.',
        },
    };
}
