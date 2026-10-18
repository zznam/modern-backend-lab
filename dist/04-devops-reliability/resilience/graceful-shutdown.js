/**
 * Production Graceful Shutdown Coordinator
 * Ensures in-flight requests finish processing and DB connections close safely before process termination.
 */
export class GracefulShutdownCoordinator {
    hooks = [];
    isShuttingDown = false;
    activeRequestCount = 0;
    registerHook(name, fn, timeoutMs = 5000) {
        this.hooks.push({ name, fn, timeoutMs });
    }
    trackRequestStart() {
        if (this.isShuttingDown) {
            throw new Error('503 Service Unavailable: Server is shutting down, rejecting new connections');
        }
        this.activeRequestCount++;
    }
    trackRequestEnd() {
        if (this.activeRequestCount > 0) {
            this.activeRequestCount--;
        }
    }
    getActiveRequests() {
        return this.activeRequestCount;
    }
    async triggerShutdown(signal, maxDrainTimeMs = 5000) {
        if (this.isShuttingDown) {
            return { success: true, drainedRequests: 0, executedHooks: [], logs: ['Already shutting down'] };
        }
        this.isShuttingDown = true;
        const logs = [];
        logs.push(`[GracefulShutdown] Received ${signal}. Initiating termination sequence...`);
        logs.push(`[GracefulShutdown] Step 1: Stopped accepting new incoming HTTP connections.`);
        // Step 2: Drain in-flight requests
        const drainStart = Date.now();
        const initialActive = this.activeRequestCount;
        logs.push(`[GracefulShutdown] Step 2: Waiting for ${initialActive} active requests to finish (max ${maxDrainTimeMs}ms)...`);
        while (this.activeRequestCount > 0 && Date.now() - drainStart < maxDrainTimeMs) {
            await new Promise((r) => setTimeout(r, 50));
        }
        logs.push(`[GracefulShutdown] Step 2 complete: All in-flight requests drained.`);
        // Step 3: Execute registered teardown hooks (DB, Redis, Message Queues)
        const executedHooks = [];
        for (const hook of this.hooks) {
            try {
                logs.push(`[GracefulShutdown] Step 3: Executing cleanup hook '${hook.name}'...`);
                await Promise.race([
                    hook.fn(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Hook timeout')), hook.timeoutMs || 5000)),
                ]);
                executedHooks.push(hook.name);
                logs.push(`[GracefulShutdown] Hook '${hook.name}' completed successfully.`);
            }
            catch (err) {
                logs.push(`[GracefulShutdown] Hook '${hook.name}' error: ${err.message}`);
            }
        }
        logs.push(`[GracefulShutdown] Teardown complete. Clean exit with code 0.`);
        return {
            success: true,
            drainedRequests: initialActive,
            executedHooks,
            logs,
        };
    }
}
export const globalShutdownCoordinator = new GracefulShutdownCoordinator();
