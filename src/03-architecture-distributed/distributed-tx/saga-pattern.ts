/**
 * Saga Pattern for Distributed Transactions (Orchestration vs Choreography)
 * Maintains eventual consistency across distributed microservices without 2-Phase Commit (2PC).
 */

export interface SagaStepLog {
  step: string;
  action: 'EXECUTE' | 'COMPENSATE';
  service: string;
  status: 'SUCCESS' | 'FAILED';
  details: string;
  timestamp: number;
}

export class OrderSagaOrchestrator {
  public logs: SagaStepLog[] = [];

  private record(
    step: string,
    action: 'EXECUTE' | 'COMPENSATE',
    service: string,
    status: 'SUCCESS' | 'FAILED',
    details: string
  ): void {
    this.logs.push({ step, action, service, status, details, timestamp: Date.now() });
  }

  public async executeOrderSaga(params: {
    orderId: string;
    customerId: string;
    amount: number;
    inventoryAvailable: boolean;
  }): Promise<{ sagaStatus: 'COMMITTED' | 'ROLLED_BACK'; logs: SagaStepLog[]; failureReason?: string }> {
    this.logs = [];

    // Step 1: Order Service - Create Order in PENDING state
    this.record('1. Create Order', 'EXECUTE', 'OrderService', 'SUCCESS', `Order ${params.orderId} initialized in PENDING state`);

    // Step 2: Payment Service - Authorize & Charge Card
    this.record('2. Process Payment', 'EXECUTE', 'PaymentService', 'SUCCESS', `Charged $${params.amount} from customer ${params.customerId}`);

    // Step 3: Inventory Service - Reserve Stock
    if (!params.inventoryAvailable) {
      this.record('3. Reserve Inventory', 'EXECUTE', 'InventoryService', 'FAILED', 'Insufficient stock: Item out of inventory!');

      // ==========================================
      // TRIGGER COMPENSATING TRANSACTIONS (ROLLBACK)
      // ==========================================
      // Compensate Step 2: Payment Service Refund
      this.record('Compensate: Refund Payment', 'COMPENSATE', 'PaymentService', 'SUCCESS', `Refunded $${params.amount} back to customer ${params.customerId}`);

      // Compensate Step 1: Order Service Cancel
      this.record('Compensate: Cancel Order', 'COMPENSATE', 'OrderService', 'SUCCESS', `Order ${params.orderId} marked as CANCELLED`);

      return {
        sagaStatus: 'ROLLED_BACK',
        logs: this.logs,
        failureReason: 'Inventory reservation failed. Compensating transactions executed to restore consistency.',
      };
    }

    // Inventory reservation succeeded
    this.record('3. Reserve Inventory', 'EXECUTE', 'InventoryService', 'SUCCESS', 'Stock allocated and reserved');

    // Step 4: Shipping Service - Create Shipment
    this.record('4. Create Shipment', 'EXECUTE', 'ShippingService', 'SUCCESS', 'Courier pickup ticket created');

    // Finalize Order
    this.record('5. Complete Order', 'EXECUTE', 'OrderService', 'SUCCESS', `Order ${params.orderId} marked as COMPLETED`);

    return {
      sagaStatus: 'COMMITTED',
      logs: this.logs,
    };
  }
}
