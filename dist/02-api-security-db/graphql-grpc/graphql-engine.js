/**
 * GraphQL Engine & DataLoader Lab
 * Demonstrates:
 * 1. Solving Over-fetching & Under-fetching
 * 2. The Infamous N+1 Problem
 * 3. DataLoader Batching & In-Memory Request-Scoped Caching
 */
export class DataLoaderSimulator {
    batchFn;
    queue = [];
    cache = new Map();
    scheduled = false;
    constructor(batchFn) {
        this.batchFn = batchFn;
    }
    async load(key) {
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }
        return new Promise((resolve, reject) => {
            this.queue.push({ key, resolve, reject });
            if (!this.scheduled) {
                this.scheduled = true;
                // Schedule batch dispatch on next microtask tick
                queueMicrotask(() => this.dispatchBatch());
            }
        });
    }
    async dispatchBatch() {
        const currentQueue = [...this.queue];
        this.queue = [];
        this.scheduled = false;
        const uniqueKeys = Array.from(new Set(currentQueue.map((q) => q.key)));
        try {
            const results = await this.batchFn(uniqueKeys);
            for (const item of currentQueue) {
                const val = results.get(item.key);
                if (val !== undefined) {
                    this.cache.set(item.key, val);
                    item.resolve(val);
                }
                else {
                    item.reject(new Error(`Not found for key: ${item.key}`));
                }
            }
        }
        catch (err) {
            currentQueue.forEach((q) => q.reject(err));
        }
    }
}
// Mock Database with query counter
export class MockCustomerDb {
    queryCount = 0;
    customers = [
        { id: 'c1', name: 'Alice Smith', email: 'alice@example.com', tier: 'ENTERPRISE' },
        { id: 'c2', name: 'Bob Johnson', email: 'bob@example.com', tier: 'PRO' },
        { id: 'c3', name: 'Charlie Davis', email: 'charlie@example.com', tier: 'FREE' },
        { id: 'c4', name: 'Diana Prince', email: 'diana@example.com', tier: 'PRO' },
        { id: 'c5', name: 'Evan Wright', email: 'evan@example.com', tier: 'FREE' },
    ];
    async findCustomerById(id) {
        this.queryCount++;
        // Simulate ~5ms DB read latency
        await new Promise((r) => setTimeout(r, 5));
        return this.customers.find((c) => c.id === id);
    }
    async findCustomersByIds(ids) {
        this.queryCount++; // Exactly 1 batched query!
        await new Promise((r) => setTimeout(r, 5));
        const map = new Map();
        for (const c of this.customers) {
            if (ids.includes(c.id)) {
                map.set(c.id, c);
            }
        }
        return map;
    }
    resetCount() {
        this.queryCount = 0;
    }
}
export async function runNPlusOneBenchmark() {
    const db = new MockCustomerDb();
    const orders = [
        { id: 'ord_1', customerId: 'c1', total: 100 },
        { id: 'ord_2', customerId: 'c2', total: 150 },
        { id: 'ord_3', customerId: 'c3', total: 200 },
        { id: 'ord_4', customerId: 'c1', total: 80 },
        { id: 'ord_5', customerId: 'c4', total: 320 },
        { id: 'ord_6', customerId: 'c5', total: 45 },
        { id: 'ord_7', customerId: 'c2', total: 110 },
        { id: 'ord_8', customerId: 'c3', total: 95 },
    ];
    // 1. Without DataLoader: Naive field resolver triggers 1 query per order
    db.resetCount();
    const startNaive = performance.now();
    // 1 query to fetch orders
    db.queryCount++;
    for (const order of orders) {
        await db.findCustomerById(order.customerId);
    }
    const naiveDuration = performance.now() - startNaive;
    const naiveQueries = db.queryCount;
    // 2. With DataLoader: Batches customer requests into 1 single query
    db.resetCount();
    const startBatched = performance.now();
    // 1 query to fetch orders
    db.queryCount++;
    const loader = new DataLoaderSimulator((keys) => db.findCustomersByIds(keys));
    await Promise.all(orders.map((o) => loader.load(o.customerId)));
    const batchedDuration = performance.now() - startBatched;
    const batchedQueries = db.queryCount;
    return {
        withoutDataLoader: {
            queriesFired: naiveQueries,
            durationMs: Math.round(naiveDuration * 100) / 100,
            pattern: '1 query for orders + N queries for customers = 9 queries total',
        },
        withDataLoader: {
            queriesFired: batchedQueries,
            durationMs: Math.round(batchedDuration * 100) / 100,
            pattern: '1 query for orders + 1 batched query for customers = 2 queries total',
        },
        comparison: `DataLoader cut database queries from ${naiveQueries} down to ${batchedQueries} (${Math.round((naiveQueries / batchedQueries) * 100)}% query reduction) and eliminated duplicate fetches for the same customer!`,
    };
}
