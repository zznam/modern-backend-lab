/**
 * Eventual Consistency: Vector Clocks & CRDTs (Conflict-free Replicated Data Types)
 */
// ========================================================
// 1. VECTOR CLOCK (Causal Ordering)
// ========================================================
export class VectorClock {
    clock = {};
    constructor(clock = {}) {
        this.clock = { ...clock };
    }
    tick(nodeId) {
        this.clock[nodeId] = (this.clock[nodeId] || 0) + 1;
    }
    merge(other) {
        for (const [nodeId, time] of Object.entries(other.clock)) {
            this.clock[nodeId] = Math.max(this.clock[nodeId] || 0, time);
        }
    }
    /**
     * Compares causality:
     * Returns:
     *  - 'BEFORE': this happened before other
     *  - 'AFTER': this happened after other
     *  - 'CONCURRENT': independent concurrent updates! Requires conflict resolution.
     */
    compare(other) {
        let hasLess = false;
        let hasGreater = false;
        const allKeys = new Set([...Object.keys(this.clock), ...Object.keys(other.clock)]);
        for (const k of allKeys) {
            const v1 = this.clock[k] || 0;
            const v2 = other.clock[k] || 0;
            if (v1 < v2)
                hasLess = true;
            if (v1 > v2)
                hasGreater = true;
        }
        if (hasLess && hasGreater)
            return 'CONCURRENT';
        if (hasLess && !hasGreater)
            return 'BEFORE';
        if (hasGreater && !hasLess)
            return 'AFTER';
        return 'SAME';
    }
}
// ========================================================
// 2. CRDT: PN-Counter (Positive-Negative Counter)
// Converges deterministically across distributed replicas without locks
// ========================================================
export class PNCounter {
    nodeId;
    p = {};
    n = {};
    constructor(nodeId) {
        this.nodeId = nodeId;
    }
    increment(value = 1) {
        this.p[this.nodeId] = (this.p[this.nodeId] || 0) + value;
    }
    decrement(value = 1) {
        this.n[this.nodeId] = (this.n[this.nodeId] || 0) + value;
    }
    value() {
        const totalP = Object.values(this.p).reduce((sum, v) => sum + v, 0);
        const totalN = Object.values(this.n).reduce((sum, v) => sum + v, 0);
        return totalP - totalN;
    }
    merge(other) {
        // Monotonic join: take maximum of each node's counts
        for (const [id, count] of Object.entries(other.p)) {
            this.p[id] = Math.max(this.p[id] || 0, count);
        }
        for (const [id, count] of Object.entries(other.n)) {
            this.n[id] = Math.max(this.n[id] || 0, count);
        }
    }
}
