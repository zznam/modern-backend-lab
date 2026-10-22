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
  readonly amount: number;
  readonly currency: string;

  constructor(amount: number, currency: string = 'USD') {
    if (!Number.isFinite(amount)) throw new Error('Money amount must be finite');
    if (amount < 0) throw new Error('Money amount cannot be negative');
    this.amount = Math.round(amount * 100) / 100;
    this.currency = currency;
  }

  public add(other: Money): Money {
    if (this.currency !== other.currency) throw new Error('Cannot add different currencies');
    return new Money(this.amount + other.amount, this.currency);
  }
}

export interface DomainEvent {
  eventName: string;
  occurredOn: Date;
  aggregateId: string;
}

export class OrderCreatedEvent implements DomainEvent {
  eventName = 'OrderCreated';
  occurredOn = new Date();
  constructor(public aggregateId: string, public total: Money) {}
}

export class OrderAggregate {
  private _domainEvents: DomainEvent[] = [];

  constructor(
    public readonly id: string,
    public readonly customerId: string,
    public total: Money,
    public status: 'DRAFT' | 'PAID' | 'SHIPPED' | 'CANCELLED' = 'DRAFT'
  ) {}

  public markAsPaid(): void {
    if (this.status !== 'DRAFT') {
      throw new Error(`Cannot pay an order with status ${this.status}`);
    }
    this.status = 'PAID';
    this._domainEvents.push(new OrderCreatedEvent(this.id, this.total));
  }

  public pullDomainEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }
}

// ========================================================
// 2. APPLICATION LAYER (Ports & Use Cases)
// ========================================================
// Ports (Interfaces that Infrastructure must implement)
export interface OrderRepositoryPort {
  save(order: OrderAggregate): Promise<void>;
  findById(id: string): Promise<OrderAggregate | null>;
}

export interface PaymentGatewayPort {
  charge(amount: Money, customerId: string): Promise<{ paymentId: string; success: boolean }>;
}

export interface EventPublisherPort {
  publish(event: DomainEvent): Promise<void>;
}

// Input DTO
export interface CreateOrderCommand {
  orderId: string;
  customerId: string;
  amount: number;
}

// Use Case (Application Service)
export class CreateAndPayOrderUseCase {
  constructor(
    private orderRepo: OrderRepositoryPort,
    private paymentGateway: PaymentGatewayPort,
    private eventPublisher: EventPublisherPort
  ) {}

  public async execute(command: CreateOrderCommand): Promise<{ orderId: string; status: string; paymentId: string }> {
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
export class InMemoryOrderRepositoryAdapter implements OrderRepositoryPort {
  private store = new Map<string, OrderAggregate>();

  public async save(order: OrderAggregate): Promise<void> {
    this.store.set(order.id, order);
  }

  public async findById(id: string): Promise<OrderAggregate | null> {
    return this.store.get(id) || null;
  }
}

export class StripePaymentGatewayAdapter implements PaymentGatewayPort {
  public async charge(amount: Money, customerId: string): Promise<{ paymentId: string; success: boolean }> {
    // In real life, calls Stripe SDK. In lab, returns mock transaction ID
    return {
      paymentId: `ch_${Date.now()}_stripe_success`,
      success: true,
    };
  }
}

export class EventBrokerPublisherAdapter implements EventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  public async publish(event: DomainEvent): Promise<void> {
    this.publishedEvents.push(event);
  }
}

// ========================================================
// 4. DEPENDENCY INJECTION CONTAINER (IoC)
// ========================================================
export class DiContainer {
  private services = new Map<string, any>();

  public register<T>(key: string, instance: T): void {
    this.services.set(key, instance);
  }

  public resolve<T>(key: string): T {
    const service = this.services.get(key);
    if (!service) throw new Error(`Service not registered: ${key}`);
    return service as T;
  }
}

export function setupCleanArchitectureLab(): {
  container: DiContainer;
  useCase: CreateAndPayOrderUseCase;
  repo: InMemoryOrderRepositoryAdapter;
  publisher: EventBrokerPublisherAdapter;
} {
  const container = new DiContainer();

  const repo = new InMemoryOrderRepositoryAdapter();
  const payment = new StripePaymentGatewayAdapter();
  const publisher = new EventBrokerPublisherAdapter();

  container.register<OrderRepositoryPort>('OrderRepo', repo);
  container.register<PaymentGatewayPort>('PaymentGateway', payment);
  container.register<EventPublisherPort>('EventPublisher', publisher);

  const useCase = new CreateAndPayOrderUseCase(repo, payment, publisher);
  container.register('CreateAndPayOrderUseCase', useCase);

  return { container, useCase, repo, publisher };
}
