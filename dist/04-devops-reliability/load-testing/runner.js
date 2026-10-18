/**
 * Automated Load & Stress Testing Runner (Autocannon / k6 style)
 * Measures Throughput (RPS), Latency (p50, p95, p99), and Error Rates under load.
 */
import autocannon from 'autocannon';
export async function runLoadBenchmark(url = 'http://127.0.0.1:4000/api/v1/health', durationSeconds = 5, connections = 20) {
    return new Promise((resolve, reject) => {
        const instance = autocannon({
            url,
            connections,
            duration: durationSeconds,
            pipelining: 1,
        }, (err, result) => {
            if (err)
                return reject(err);
            resolve({
                url,
                durationSeconds: result.duration,
                connections: result.connections,
                requestsTotal: result.requests.total,
                throughputRps: Math.round(result.requests.average),
                latencyP50: result.latency.p50,
                latencyP95: result.latency.p97_5,
                latencyP99: result.latency.p99,
                errorsTotal: result.errors,
                timeoutsTotal: result.timeouts,
            });
        });
        autocannon.track(instance, { renderProgressBar: false });
    });
}
// In-Process load simulation when HTTP server is not yet running
export async function runInProcessStressBenchmark(taskFn, totalRequests = 1000, concurrency = 50) {
    const latencies = [];
    const start = performance.now();
    let index = 0;
    const workers = Array.from({ length: concurrency }).map(async () => {
        while (index < totalRequests) {
            index++;
            const reqStart = performance.now();
            await taskFn();
            latencies.push(performance.now() - reqStart);
        }
    });
    await Promise.all(workers);
    const totalDuration = performance.now() - start;
    latencies.sort((a, b) => a - b);
    const p95Idx = Math.floor(latencies.length * 0.95);
    const p99Idx = Math.floor(latencies.length * 0.99);
    return {
        totalRequests,
        concurrency,
        durationMs: Math.round(totalDuration),
        rps: Math.round((totalRequests / (totalDuration / 1000)) * 10) / 10,
        latencyMs: {
            min: Math.round(latencies[0] * 100) / 100,
            avg: Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) * 100) / 100,
            p95: Math.round(latencies[p95Idx] * 100) / 100,
            p99: Math.round(latencies[p99Idx] * 100) / 100,
            max: Math.round(latencies[latencies.length - 1] * 100) / 100,
        },
    };
}
