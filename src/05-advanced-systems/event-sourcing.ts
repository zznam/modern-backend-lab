import { boundedInteger, type LabResult } from './lab-result.js';

export interface LedgerEvent { version: number; delta: number }

/** A single aggregate stream with optimistic append and ordered projection checkpoints. */
export class EventLedger {
  private events: LedgerEvent[] = [];
  append(expectedVersion: number, delta: number): LedgerEvent {
    if (expectedVersion !== this.events.length) throw new Error('Version conflict: reload the aggregate before retrying');
    if (!Number.isSafeInteger(delta)) throw new RangeError('delta must be a safe integer');
    const event = { version: this.events.length + 1, delta };
    this.events.push(event);
    return { ...event };
  }
  read(): LedgerEvent[] { return this.events.map(event => ({ ...event })); }
}

export class BalanceProjection {
  checkpoint = 0;
  balance = 0;
  apply(event: LedgerEvent): boolean {
    if (event.version <= this.checkpoint) return false;
    if (event.version !== this.checkpoint + 1) throw new Error('Projection gap: replay missing versions first');
    this.balance += event.delta;
    this.checkpoint = event.version;
    return true;
  }
}

export function runEventSourcingLab(projectionBatch = 2) {
  boundedInteger(projectionBatch, 'projectionBatch', 0, 3);
  const ledger = new EventLedger();
  ledger.append(0, 100);
  ledger.append(1, 50);
  ledger.append(2, -20);
  let conflictRejected = false;
  try { ledger.append(1, 999); } catch { conflictRejected = true; }
  const events = ledger.read();
  const projection = new BalanceProjection();
  events.slice(0, projectionBatch).forEach(event => projection.apply(event));
  const lagging = { balance: projection.balance, checkpoint: projection.checkpoint };
  events.forEach(event => projection.apply(event));
  const duplicateApplications = events.filter(event => projection.apply(event)).length;
  const rebuilt = new BalanceProjection();
  events.forEach(event => rebuilt.apply(event));
  return {
    model: 'One in-memory aggregate stream and ordered read model; no persistent log, broker, schema evolution, or external side effects.',
    summary: 'Commands append facts with an expected version. The query model can lag, then catch up and rebuild without counting duplicate delivery twice.',
    metrics: [
      { label: 'Authoritative balance', value: rebuilt.balance, hint: 'Fold of +100, +50, −20 events' },
      { label: 'Projection lag', value: events.length - lagging.checkpoint, hint: `Read balance before catch-up: ${lagging.balance}` },
      { label: 'Duplicate effects', value: duplicateApplications, hint: 'Ordered version checkpoint prevents replay effects' },
    ],
    steps: [
      { title: 'Append three events', detail: 'Optimistic expected-version checks protect the aggregate stream.', state: 'ok' },
      { title: 'Reject stale command', detail: 'A writer expecting version 1 cannot append after version 3.', state: 'blocked' },
      { title: 'Query before catch-up', detail: `The projection has applied ${lagging.checkpoint}/3 events and returns ${lagging.balance}.`, state: lagging.checkpoint < 3 ? 'warning' : 'ok' },
      { title: 'Catch up, redeliver, rebuild', detail: `Live projection and fresh rebuild both return ${rebuilt.balance}; replay adds ${duplicateApplications} effects.`, state: 'ok' },
    ], events, lagging, conflictRejected, duplicateApplications,
    caughtUp: { balance: projection.balance, checkpoint: projection.checkpoint }, rebuiltBalance: rebuilt.balance,
  } satisfies LabResult & Record<string, unknown>;
}
