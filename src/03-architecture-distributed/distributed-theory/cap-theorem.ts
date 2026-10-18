/**
 * Distributed Systems Theory: CAP Theorem Interactive Simulation
 *
 * Concepts:
 * - Consistency (C): Every read receives the most recent write or an error.
 * - Availability (A): Every non-failing node returns a non-error response (without guarantee of latest write).
 * - Partition Tolerance (P): The system continues operating despite arbitrary packet loss or partition.
 *
 * Fundamental Law: Network Partitions are physically inevitable in distributed systems.
 * Therefore, when a partition occurs, a system MUST choose between CP or AP!
 */

export interface ClusterNode {
  id: string;
  data: string;
  version: number;
}

export class CapClusterSimulator {
  private nodeA: ClusterNode = { id: 'Node-A', data: 'initial', version: 1 };
  private nodeB: ClusterNode = { id: 'Node-B', data: 'initial', version: 1 };
  private isPartitioned = false;

  public setNetworkPartition(partitioned: boolean): void {
    this.isPartitioned = partitioned;
  }

  // ========================================================
  // 1. CP System Behavior (Consistency over Availability)
  // e.g. Raft, etcd, ZooKeeper, Google Spanner
  // ========================================================
  public writeCP(targetNodeId: 'Node-A' | 'Node-B', newData: string): {
    success: boolean;
    reason: string;
    nodeAData: string;
    nodeBData: string;
  } {
    if (this.isPartitioned) {
      // In a partition, node cannot establish majority quorum!
      // Must FAIL the write to prevent split-brain / inconsistent state.
      return {
        success: false,
        reason: '503 Service Unavailable: Network partition active. Write rejected because cluster quorum cannot be reached (Choosing Consistency over Availability).',
        nodeAData: this.nodeA.data,
        nodeBData: this.nodeB.data,
      };
    }

    // Normal operation: Replicates synchronously to both nodes
    this.nodeA.data = newData;
    this.nodeA.version++;
    this.nodeB.data = newData;
    this.nodeB.version++;

    return {
      success: true,
      reason: 'Write synchronously replicated to all nodes (100% Consistent).',
      nodeAData: this.nodeA.data,
      nodeBData: this.nodeB.data,
    };
  }

  // ========================================================
  // 2. AP System Behavior (Availability over Consistency)
  // e.g. Amazon DynamoDB, Apache Cassandra, Couchbase
  // ========================================================
  public writeAP(targetNodeId: 'Node-A' | 'Node-B', newData: string): {
    success: boolean;
    reason: string;
    nodeAData: string;
    nodeBData: string;
    diverged: boolean;
  } {
    const target = targetNodeId === 'Node-A' ? this.nodeA : this.nodeB;
    target.data = newData;
    target.version++;

    if (this.isPartitioned) {
      // Cannot replicate across partition, but ACCEPTS the write anyway!
      return {
        success: true,
        reason: 'Write ACCEPTED locally on ' + targetNodeId + '. Replicate to peer was blocked by partition (Choosing Availability over Consistency). Nodes are now DIVERGED!',
        nodeAData: this.nodeA.data,
        nodeBData: this.nodeB.data,
        diverged: this.nodeA.data !== this.nodeB.data,
      };
    }

    // Normal: Replicate asynchronously
    const other = targetNodeId === 'Node-A' ? this.nodeB : this.nodeA;
    other.data = newData;
    other.version = target.version;

    return {
      success: true,
      reason: 'Write accepted and replicated.',
      nodeAData: this.nodeA.data,
      nodeBData: this.nodeB.data,
      diverged: false,
    };
  }

  public getStatus(): { isPartitioned: boolean; nodeA: ClusterNode; nodeB: ClusterNode } {
    return {
      isPartitioned: this.isPartitioned,
      nodeA: { ...this.nodeA },
      nodeB: { ...this.nodeB },
    };
  }
}
