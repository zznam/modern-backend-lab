/**
 * Production Graceful Shutdown Coordinator
 * Ensures in-flight requests finish processing and DB connections close safely before process termination.
 */

export interface ShutdownHook {
  name: string;
  fn: () => Promise<void>;
  timeoutMs?: number;
}

export class GracefulShutdownCoordinator {
  private hooks: ShutdownHook[] = [];
  private isShuttingDown = false;
  private activeRequestCount = 0;

  public registerHook(name: string, fn: () => Promise<void>, timeoutMs = 5000): void {
    this.hooks.push({ name, fn, timeoutMs });
  }

  public trackRequestStart(): void {
    if (this.isShuttingDown) {
      throw new Error('503 Service Unavailable: Server is shutting down, rejecting new connections');
    }
    this.activeRequestCount++;
  }

  public trackRequestEnd(): void {
    if (this.activeRequestCount > 0) {
      this.activeRequestCount--;
    }
  }

  public isDraining(): boolean {
    return this.isShuttingDown;
  }

  public getActiveRequests(): number {
    return this.activeRequestCount;
  }

  public async triggerShutdown(signal: 'SIGTERM' | 'SIGINT' | 'MANUAL', maxDrainTimeMs = 5000): Promise<{
    success: boolean;
    drainedRequests: number;
    executedHooks: string[];
    logs: string[];
  }> {
    if (this.isShuttingDown) {
      return { success: true, drainedRequests: 0, executedHooks: [], logs: ['Already shutting down'] };
    }

    this.isShuttingDown = true;
    const logs: string[] = [];
    logs.push(`[GracefulShutdown] Received ${signal}. Initiating termination sequence...`);
    logs.push(`[GracefulShutdown] Step 1: Stopped accepting new incoming HTTP connections.`);

    // Step 2: Drain in-flight requests
    const drainStart = Date.now();
    const initialActive = this.activeRequestCount;
    logs.push(`[GracefulShutdown] Step 2: Waiting for ${initialActive} active requests to finish (max ${maxDrainTimeMs}ms)...`);

    while (this.activeRequestCount > 0 && Date.now() - drainStart < maxDrainTimeMs) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const drainedRequests = initialActive - this.activeRequestCount;
    let success = this.activeRequestCount === 0;
    logs.push(success ? '[GracefulShutdown] All in-flight requests drained.' : `[GracefulShutdown] Drain timeout: ${this.activeRequestCount} requests still active.`);

    // Step 3: Execute registered teardown hooks (DB, Redis, Message Queues)
    const executedHooks: string[] = [];
    for (const hook of this.hooks) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        logs.push(`[GracefulShutdown] Step 3: Executing cleanup hook '${hook.name}'...`);
        await Promise.race([
          hook.fn(),
          new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Hook timeout')), hook.timeoutMs ?? 5000); }),
        ]);
        executedHooks.push(hook.name);
        logs.push(`[GracefulShutdown] Hook '${hook.name}' completed successfully.`);
      } catch (err: any) {
        success = false;
        logs.push(`[GracefulShutdown] Hook '${hook.name}' error: ${err.message}`);
      } finally {
        clearTimeout(timeout);
      }
    }

    logs.push(`[GracefulShutdown] Teardown complete. Cleanup sequence finished.`);
    return {
      success,
      drainedRequests,
      executedHooks,
      logs,
    };
  }
}

export const globalShutdownCoordinator = new GracefulShutdownCoordinator();
