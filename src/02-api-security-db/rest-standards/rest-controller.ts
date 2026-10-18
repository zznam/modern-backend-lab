/**
 * RESTful API Standards, Pagination (Cursor vs Offset), Filtering, Versioning & Modeling
 */
import { globalIdempotencyStore } from './idempotency.js';

export interface OrderItem {
  id: string;
  orderNumber: number;
  customerName: string;
  amount: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
}

// In-Memory Simulated Database Table with 10,000 indexed records
export class OrderDatabase {
  private orders: OrderItem[] = [];

  constructor() {
    this.seed(10000);
  }

  private seed(count: number): void {
    const statuses: Array<OrderItem['status']> = ['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED'];
    const baseTime = Date.now() - count * 1000;

    for (let i = 1; i <= count; i++) {
      this.orders.push({
        id: `ord_${i.toString().padStart(6, '0')}`,
        orderNumber: i,
        customerName: `Customer ${i}`,
        amount: Math.round((10 + (i % 500) * 1.5) * 100) / 100,
        status: statuses[i % statuses.length],
        createdAt: new Date(baseTime + i * 1000).toISOString(),
      });
    }
  }

  // 1. Offset-based Pagination: LIMIT & OFFSET
  // Problem: As offset grows (e.g. OFFSET 50000), DB must scan and discard 50,000 rows!
  public getWithOffsetPagination(
    offset: number,
    limit: number,
    filterStatus?: string
  ): {
    data: OrderItem[];
    pagination: { offset: number; limit: number; total: number; hasMore: boolean };
    scanComplexity: string;
  } {
    let dataset = this.orders;
    if (filterStatus) {
      dataset = dataset.filter((o) => o.status === filterStatus);
    }

    const total = dataset.length;
    const data = dataset.slice(offset, offset + limit);

    return {
      data,
      pagination: {
        offset,
        limit,
        total,
        hasMore: offset + limit < total,
      },
      scanComplexity: `Scanned & discarded ${offset} rows to retrieve ${data.length} rows (O(N) cost in relational DBs).`,
    };
  }

  // 2. Keyset / Cursor-based Pagination: WHERE id > cursor LIMIT limit
  // Benefit: O(1) B-Tree indexed seek directly to cursor row, stable against insertions/deletions!
  public getWithCursorPagination(
    cursor: string | null,
    limit: number,
    filterStatus?: string
  ): {
    data: OrderItem[];
    pagination: { nextCursor: string | null; limit: number; hasMore: boolean };
    scanComplexity: string;
  } {
    let dataset = this.orders;
    if (filterStatus) {
      dataset = dataset.filter((o) => o.status === filterStatus);
    }

    let startIndex = 0;
    if (cursor) {
      const decodedCursor = Buffer.from(cursor, 'base64').toString('utf8');
      const foundIdx = dataset.findIndex((o) => o.id === decodedCursor);
      if (foundIdx !== -1) {
        startIndex = foundIdx + 1;
      }
    }

    const data = dataset.slice(startIndex, startIndex + limit);
    const lastItem = data[data.length - 1];
    const nextCursor = lastItem ? Buffer.from(lastItem.id).toString('base64') : null;

    return {
      data,
      pagination: {
        nextCursor,
        limit,
        hasMore: startIndex + limit < dataset.length,
      },
      scanComplexity: 'Direct B-Tree index seek on cursor key. Zero rows discarded (O(1) cost). Immune to page drift.',
    };
  }

  public createOrder(
    payload: { customerName: string; amount: number },
    idempotencyKey?: string
  ): { statusCode: number; order: OrderItem; idempotentReplay: boolean } {
    if (idempotencyKey) {
      const check = globalIdempotencyStore.acquireOrCheck(idempotencyKey, payload);
      if (check.action === 'CONFLICT_IN_FLIGHT') {
        throw new Error('409 Conflict: An order request with this idempotency key is already currently processing.');
      }
      if (check.action === 'RETURN_CACHED') {
        return {
          statusCode: check.record.statusCode || 200,
          order: check.record.responseBody,
          idempotentReplay: true,
        };
      }
    }

    const newId = `ord_${(this.orders.length + 1).toString().padStart(6, '0')}`;
    const newOrder: OrderItem = {
      id: newId,
      orderNumber: this.orders.length + 1,
      customerName: payload.customerName,
      amount: payload.amount,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    this.orders.push(newOrder);

    if (idempotencyKey) {
      globalIdempotencyStore.saveResult(idempotencyKey, 201, newOrder);
    }

    return {
      statusCode: 201,
      order: newOrder,
      idempotentReplay: false,
    };
  }

  public getById(id: string): OrderItem | undefined {
    return this.orders.find((o) => o.id === id);
  }

  public count(): number {
    return this.orders.length;
  }
}

export const globalOrderDb = new OrderDatabase();
