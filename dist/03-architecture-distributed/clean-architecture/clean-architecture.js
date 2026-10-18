/**
 * Clean Architecture & Hexagonal Architecture (Ports & Adapters) with DDD
 *
 * Layers:
 * 1. Domain Layer: Pure Enterprise Business Rules (Entities, Value Objects, Domain Events). Zero framework dependencies.
 * 2. Application Layer: Use Cases & Ports (Input/Output boundary interfaces, DTOs).
 * 3. Infrastructure Layer: Adapters (Database, Payment Gateways, Message Broker).
 * 4. Presentation Layer: Controllers (REST, GraphQL, CLI).
 *
 * Dependency Rule: Inner layers NEVER know anything about outer layers!
 */
// ========================================================
// 1. DOMAIN LAYER (Entities & Value Objects)
// ========================================================
export class Money {
    amount;
    currency;
    constructor(amount, currency = 'USD') {
        if (amount < 0)
            throw new Error('Money amount cannot be negative');
        this.amount = Math.round(amount * 100) / 100;
        this.currency = currency;
    }
    add(other) {
        if (this.currency !== other.currency)
            throw new Error('Cannot add different currencies');
        return new Money(this.amount + other.amount, this.currency);
    }
}
export class OrderCreatedEvent {
    aggregateId;
    total;
    eventName = 'OrderCreated';
    occurredOn = new Date();
    constructor(aggregateId, total) {
        this.aggregateId = aggregateId;
        this.total = total;
    }
}
export class OrderAggregate {
    id;
    customerId;
    total;
    status;
    _domainEvents = [];
    constructor(id, customerId, total, status = 'DRAFT') {
        this.id = id;
        this.customerId = customerId;
        this.total = total;
        this.status = status;
    }
    markAsPaid() {
        if (this.status !== 'DRAFT') {
            throw new Error(`Cannot pay an order with status ${this.status}`);
        }
        this.status = 'PAID';
        this._domainEvents.push(new OrderCreatedEvent(this.id, this.total));
    }
    pullDomainEvents() {
        const events = [...this._domainEvents];
        this._domainEvents = [];
        return events;
    }
}
// Use Case (Application Service)
export class CreateAndPayOrderUseCase {
    orderRepo;
    paymentGateway;
    eventPublisher;
    constructor(orderRepo, paymentGateway, eventPublisher) {
        this.orderRepo = orderRepo;
        this.paymentGateway = paymentGateway;
        this.eventPublisher = eventPublisher;
    }
    async execute(command) {
        // 1. Instantiate Domain Entity
        const money = new Money(command.amount);
        const order = new OrderAggregate(command.orderId, command.customerId, money);
        // 2. Interact with Payment Gateway Port
        const payment = await this.paymentGateway.charge(money, command.customerId);
        if (!payment.success) {
            throw new Error('Payment charge failed');
        }
        // 3. Update domain state
        order.markAsPaid();
        // 4. Persist via Repository Port
        await this.orderRepo.save(order);
        // 5. Dispatch domain events via Event Publisher Port
        for (const evt of order.pullDomainEvents()) {
            await this.eventPublisher.publish(evt);
        }
        return {
            orderId: order.id,
            status: order.status,
            paymentId: payment.paymentId,
        };
    }
}
// ========================================================
// 3. INFRASTRUCTURE LAYER (Adapters)
// ========================================================
export class InMemoryOrderRepositoryAdapter {
    store = new Map();
    async save(order) {
        this.store.set(order.id, order);
    }
    async findById(id) {
        return this.store.get(id) || null;
    }
}
export class StripePaymentGatewayAdapter {
    async charge(amount, customerId) {
        // In real life, calls Stripe SDK. In lab, returns mock transaction ID
        return {
            paymentId: `ch_${Date.now()}_stripe_success`,
            success: true,
        };
    }
}
export class EventBrokerPublisherAdapter {
    publishedEvents = [];
    async publish(event) {
        this.publishedEvents.push(event);
    }
}
// ========================================================
// 4. DEPENDENCY INJECTION CONTAINER (IoC)
// ========================================================
export class DiContainer {
    services = new Map();
    register(key, instance) {
        this.services.set(key, instance);
    }
    resolve(key) {
        const service = this.services.get(key);
        if (!service)
            throw new Error(`Service not registered: ${key}`);
        return service;
    }
}
export function setupCleanArchitectureLab() {
    const container = new DiContainer();
    const repo = new InMemoryOrderRepositoryAdapter();
    const payment = new StripePaymentGatewayAdapter();
    const publisher = new EventBrokerPublisherAdapter();
    container.register('OrderRepo', repo);
    container.register('PaymentGateway', payment);
    container.register('EventPublisher', publisher);
    const useCase = new CreateAndPayOrderUseCase(repo, payment, publisher);
    container.register('CreateAndPayOrderUseCase', useCase);
    return { container, useCase, repo, publisher };
}
