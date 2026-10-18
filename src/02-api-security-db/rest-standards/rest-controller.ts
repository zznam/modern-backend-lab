/**
 * RESTful API Standards, Pagination (Cursor vs Offset), Filtering, Versioning & Modeling
 */
import { IdempotencyStore } from './idempotency.js';

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

  constructor(private idempotencyStore = new IdempotencyStore()) {
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
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RangeError('limit must be between 1 and 100');
    let dataset = this.orders;
    if (filterStatus) {
      dataset = dataset.filter((o) => o.status === filterStatus);
    }

    if (!Number.isSafeInteger(offset) || offset < 0) throw new RangeError('offset must be a nonnegative integer');
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
  // Benefit: O(log N) B-Tree indexed seek directly to cursor row, stable against insertions/deletions!
  public getWithCursorPagination(
    cursor: string | null,
    limit: number,
    filterStatus?: string
  ): {
    data: OrderItem[];
    pagination: { nextCursor: string | null; limit: number; hasMore: boolean };
    scanComplexity: string;
  } {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RangeError('limit must be between 1 and 100');
    let dataset = this.orders;
    if (filterStatus) {
      dataset = dataset.filter((o) => o.status === filterStatus);
    }

    let startIndex = 0;
    if (cursor) {
      const decodedCursor = Buffer.from(cursor, 'base64').toString('utf8');
      if (!/^ord_\d+$/.test(decodedCursor)) throw new Error('Invalid cursor');
      const orderNumber = Number(decodedCursor.slice(4));
      // Seek the first greater key even if the cursor row is missing or excluded by a filter.
      let low = 0;
      let high = dataset.length;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (dataset[mid].orderNumber <= orderNumber) low = mid + 1;
        else high = mid;
      }
      startIndex = low;
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
      scanComplexity: 'Binary search seeks the first greater key in O(log N) after optional in-memory filtering. A database index avoids scanning earlier rows.',
    };
  }

  public createOrder(
    payload: { customerName: string; amount: number },
    idempotencyKey?: string
  ): { statusCode: number; order: OrderItem; idempotentReplay: boolean } {
    if (!payload || typeof payload.customerName !== 'string' || !payload.customerName.trim() || payload.customerName.length > 200
      || typeof payload.amount !== 'number' || !Number.isFinite(payload.amount) || payload.amount <= 0) {
      throw new Error('422 Unprocessable: customerName and a finite positive amount are required');
    }
    payload = { customerName: payload.customerName.trim(), amount: payload.amount };
    if (idempotencyKey) {
      const check = this.idempotencyStore.acquireOrCheck(idempotencyKey, payload);
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
      this.idempotencyStore.saveResult(idempotencyKey, 201, newOrder);
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
