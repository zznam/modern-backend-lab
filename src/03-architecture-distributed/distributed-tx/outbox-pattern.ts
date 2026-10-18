/**
 * Distributed Transactions: Transactional Outbox Pattern
 * Solves the Dual-Write Problem (Atomicity between Database and Message Broker).
 */
import crypto from 'node:crypto';

export interface OutboxRecord {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: any;
  status: 'PENDING' | 'PUBLISHED';
  createdAt: number;
  publishedAt?: number;
}

export class TransactionalOutboxService {
  private databaseOrders = new Map<string, any>();
  private outboxTable: OutboxRecord[] = [];
  private brokerPublishedEvents: any[] = [];

  // ATOMIC DATABASE TRANSACTION:
  // Order write + Outbox insert happen within the exact same DB transaction!
  public async createOrderAtomically(orderId: string, customerId: string, amount: number): Promise<void> {
    const orderRecord = { id: orderId, customerId, amount, status: 'CREATED', createdAt: Date.now() };
    const outboxRecord: OutboxRecord = {
      id: `outbox_${crypto.randomUUID()}`,
      aggregateType: 'Order',
      aggregateId: orderId,
      eventType: 'OrderCreated',
      payload: { orderId, customerId, amount },
      status: 'PENDING',
      createdAt: Date.now(),
    };

    // Simulated DB Transaction BEGIN
    this.databaseOrders.set(orderId, orderRecord);
    this.outboxTable.push(outboxRecord);
    // Simulated DB Transaction COMMIT
  }

  // BACKGROUND RELAY WORKER (Polling Publisher / CDC Debezium simulation)
  public async relayPendingEventsToBroker(simulateBrokerDown = false): Promise<{
    processedCount: number;
    failedCount: number;
    pendingCount: number;
  }> {
    const pending = this.outboxTable.filter((r) => r.status === 'PENDING');
    let processed = 0;
    let failed = 0;

    for (const record of pending) {
      if (simulateBrokerDown) {
        // Broker is down! DB record remains safe in PENDING status
        failed++;
        continue;
      }

      // Publish to Message Broker (e.g. Kafka / RabbitMQ)
      this.brokerPublishedEvents.push({
        topic: 'order-events',
        key: record.aggregateId,
        event: record.eventType,
        data: record.payload,
      });

      // Mark outbox entry as PUBLISHED
      record.status = 'PUBLISHED';
      record.publishedAt = Date.now();
      processed++;
    }

    return {
      processedCount: processed,
      failedCount: failed,
      pendingCount: this.outboxTable.filter((r) => r.status === 'PENDING').length,
    };
  }

  public getOutboxStatus(): {
    totalRecords: number;
    pending: number;
    published: number;
    brokerReceivedEvents: number;
  } {
    return {
      totalRecords: this.outboxTable.length,
      pending: this.outboxTable.filter((r) => r.status === 'PENDING').length,
      published: this.outboxTable.filter((r) => r.status === 'PUBLISHED').length,
      brokerReceivedEvents: this.brokerPublishedEvents.length,
    };
  }
}
