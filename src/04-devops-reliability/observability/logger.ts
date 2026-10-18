/**
 * The Three Pillars of Observability - Pillar 1: Logging
 * Structured JSON Logging with Pino & Correlation / Trace ID Propagation.
 */
import pino from 'pino';
import { AsyncLocalStorage } from 'node:async_hooks';

// AsyncLocalStorage propagates Trace / Correlation IDs across asynchronous execution boundaries
export const traceStorage = new AsyncLocalStorage<{ correlationId: string; userId?: string }>();

export const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: 'modern-backend-lab',
    env: process.env.NODE_ENV || 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export class ContextLogger {
  public static info(msg: string, extra?: Record<string, any>): void {
    const store = traceStorage.getStore();
    baseLogger.info({ ...extra, correlationId: store?.correlationId, userId: store?.userId }, msg);
  }

  public static warn(msg: string, extra?: Record<string, any>): void {
    const store = traceStorage.getStore();
    baseLogger.warn({ ...extra, correlationId: store?.correlationId, userId: store?.userId }, msg);
  }

  public static error(msg: string, error?: any, extra?: Record<string, any>): void {
    const store = traceStorage.getStore();
    baseLogger.error(
      {
        ...extra,
        correlationId: store?.correlationId,
        userId: store?.userId,
        err: error ? { message: error.message, stack: error.stack } : undefined,
      },
      msg
    );
  }
}
