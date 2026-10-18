import { describe, it, expect } from 'vitest';
import { setupCleanArchitectureLab, Money } from '../src/03-architecture-distributed/clean-architecture/clean-architecture.js';
import { MessageBrokerSimulator } from '../src/03-architecture-distributed/event-driven-broker/message-broker.js';
import { TransactionalOutboxService } from '../src/03-architecture-distributed/distributed-tx/outbox-pattern.js';
import { OrderSagaOrchestrator } from '../src/03-architecture-distributed/distributed-tx/saga-pattern.js';
import { CachingEngineLab } from '../src/03-architecture-distributed/caching-strategies/caching-engine.js';
import { CapClusterSimulator } from '../src/03-architecture-distributed/distributed-theory/cap-theorem.js';
import { VectorClock, PNCounter } from '../src/03-architecture-distributed/distributed-theory/eventual-consistency.js';
import { compareModuloVsConsistentHashing } from '../src/03-architecture-distributed/distributed-theory/consistent-hashing.js';
describe('Pillar 3: Software Architecture & Distributed Systems', () => {
    describe('Clean Architecture & Hexagonal Ports/Adapters', () => {
        it('Decouples domain business rules and executes order use case through DI container', async () => {
            const { container, useCase, repo, publisher } = setupCleanArchitectureLab();
            const res = await useCase.execute({ orderId: 'ord_100', customerId: 'cust_abc', amount: 250 });
            expect(res.orderId).toBe('ord_100');
            expect(res.status).toBe('PAID');
            const saved = await repo.findById('ord_100');
            expect(saved?.total.amount).toBe(250);
            expect(publisher.publishedEvents).toHaveLength(1);
            expect(publisher.publishedEvents[0].eventName).toBe('OrderCreated');
        });
        it('Domain value object Money enforces invariants', () => {
            expect(() => new Money(-50)).toThrow('Money amount cannot be negative');
            const m1 = new Money(100, 'USD');
            const m2 = new Money(50, 'USD');
            expect(m1.add(m2).amount).toBe(150);
        });
    });
    describe('Event-Driven Architecture & Message Broker', () => {
        it('Processes messages with ACK, retries on failure, and routes to DLQ on max attempts', async () => {
            const broker = new MessageBrokerSimulator();
            let failureCount = 0;
            broker.subscribe('test-topic', async (msg) => {
                if (msg.payload.shouldFail) {
                    failureCount++;
                    throw new Error('Consumer transient error');
                }
            });
            // 1. Successful message
            broker.publish('test-topic', { shouldFail: false }, 'dedup_1');
            const res1 = await broker.processNext('test-topic');
            expect(res1?.action).toBe('ACK');
            // 2. Poisoned message (fails repeatedly up to maxAttempts=2)
            broker.publish('test-topic', { shouldFail: true }, 'dedup_2', 2);
            const res2 = await broker.processNext('test-topic');
            expect(res2?.action).toBe('RETRY');
            const res3 = await broker.processNext('test-topic');
            expect(res3?.action).toBe('DEAD_LETTER');
            expect(broker.getDlqMessages()).toHaveLength(1);
        });
    });
    describe('Distributed Transactions: Outbox & Saga Patterns', () => {
        it('Transactional Outbox atomicity guarantees event is published even if broker was down initially', async () => {
            const outbox = new TransactionalOutboxService();
            await outbox.createOrderAtomically('ord_99', 'cust_1', 300);
            // Broker is temporarily down
            const relay1 = await outbox.relayPendingEventsToBroker(true);
            expect(relay1.failedCount).toBe(1);
            expect(relay1.pendingCount).toBe(1);
            // Broker recovers
            const relay2 = await outbox.relayPendingEventsToBroker(false);
            expect(relay2.processedCount).toBe(1);
            expect(relay2.pendingCount).toBe(0);
            expect(outbox.getOutboxStatus().brokerReceivedEvents).toBe(1);
        });
        it('Saga orchestrator executes compensating rollback transactions when a step fails', async () => {
            const saga = new OrderSagaOrchestrator();
            // Successful Saga
            const successRun = await saga.executeOrderSaga({
                orderId: 'ord_1',
                customerId: 'c1',
                amount: 150,
                inventoryAvailable: true,
            });
            expect(successRun.sagaStatus).toBe('COMMITTED');
            // Failed Saga: Inventory out of stock
            const failedRun = await saga.executeOrderSaga({
                orderId: 'ord_2',
                customerId: 'c2',
                amount: 200,
                inventoryAvailable: false,
            });
            expect(failedRun.sagaStatus).toBe('ROLLED_BACK');
            const refundStep = failedRun.logs.find((l) => l.action === 'COMPENSATE' && l.service === 'PaymentService');
            expect(refundStep).toBeDefined();
        });
    });
    describe('Caching Strategies: Stampede & Penetration', () => {
        it('Singleflight mutex eliminates Cache Stampede (Thundering Herd) down to exactly 1 DB query', async () => {
            const lab = new CachingEngineLab();
            const withSingleflight = await lab.simulateStampedeWithSingleflight('product_1', 30);
            expect(withSingleflight.dbQueriesFired).toBe(1);
        });
        it('Bloom Filter intercepts cache penetration for non-existent keys', () => {
            const lab = new CachingEngineLab();
            const res = lab.queryWithPenetrationDefense('product_definitely_not_existing_9999');
            expect(res.blockedByBloomFilter).toBe(true);
            expect(res.dbTouched).toBe(false);
        });
    });
    describe('Distributed Systems Theory: CAP, CRDTs & Consistent Hashing', () => {
        it('CAP Theorem CP mode rejects writes during network partition to preserve consistency', () => {
            const cluster = new CapClusterSimulator();
            cluster.setNetworkPartition(true);
            const write = cluster.writeCP('Node-A', 'new_val');
            expect(write.success).toBe(false);
            expect(write.reason).toContain('Write rejected because cluster quorum cannot be reached');
        });
        it('Vector Clocks detect concurrent distributed updates', () => {
            const vc1 = new VectorClock({ 'Node-A': 1 });
            const vc2 = new VectorClock({ 'Node-B': 1 });
            expect(vc1.compare(vc2)).toBe('CONCURRENT');
            vc1.tick('Node-A');
            const vc3 = new VectorClock({ 'Node-A': 1 });
            expect(vc1.compare(vc3)).toBe('AFTER');
        });
        it('CRDT PN-Counter converges monotonically', () => {
            const nodeA = new PNCounter('nodeA');
            const nodeB = new PNCounter('nodeB');
            nodeA.increment(10);
            nodeB.decrement(3);
            nodeA.merge(nodeB);
            nodeB.merge(nodeA);
            expect(nodeA.value()).toBe(7);
            expect(nodeB.value()).toBe(7);
        });
        it('Consistent Hashing ring minimizes key relocation when adding nodes', () => {
            const result = compareModuloVsConsistentHashing(500);
            expect(result.consistentHashingRelocationPercent).toBeLessThan(result.moduloRelocationPercent);
        });
    });
});
