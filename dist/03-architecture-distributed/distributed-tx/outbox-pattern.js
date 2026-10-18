/**
 * Distributed Transactions: Transactional Outbox Pattern
 * Solves the Dual-Write Problem (Atomicity between Database and Message Broker).
 */
import crypto from 'node:crypto';
export class TransactionalOutboxService {
    databaseOrders = new Map();
    outboxTable = [];
    brokerPublishedEvents = [];
    // ATOMIC DATABASE TRANSACTION:
    // Order write + Outbox insert happen within the exact same DB transaction!
    async createOrderAtomically(orderId, customerId, amount) {
        const orderRecord = { id: orderId, customerId, amount, status: 'CREATED', createdAt: Date.now() };
        const outboxRecord = {
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
    async relayPendingEventsToBroker(simulateBrokerDown = false) {
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
    getOutboxStatus() {
        return {
            totalRecords: this.outboxTable.length,
            pending: this.outboxTable.filter((r) => r.status === 'PENDING').length,
            published: this.outboxTable.filter((r) => r.status === 'PUBLISHED').length,
            brokerReceivedEvents: this.brokerPublishedEvents.length,
        };
    }
}
