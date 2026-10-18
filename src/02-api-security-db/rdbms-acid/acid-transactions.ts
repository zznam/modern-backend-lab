/**
 * RDBMS ACID Properties & Transaction Isolation Levels Lab
 * Demonstrates:
 * 1. ACID: Atomicity, Consistency, Isolation, Durability
 * 2. Isolation Anomalies: Dirty Reads, Non-Repeatable Reads, Phantom Reads
 * 3. Isolation Levels: Read Uncommitted, Read Committed, Repeatable Read, Serializable
 */

export interface AccountRecord {
  id: string;
  name: string;
  balance: number;
  version: number;
}

export class AcidSimulator {
  private accounts = new Map<string, AccountRecord>();

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.accounts.clear();
    this.accounts.set('acc_alice', { id: 'acc_alice', name: 'Alice', balance: 1000, version: 1 });
    this.accounts.set('acc_bob', { id: 'acc_bob', name: 'Bob', balance: 500, version: 1 });
  }

  public getAccount(id: string): AccountRecord | undefined {
    const acc = this.accounts.get(id);
    return acc ? { ...acc } : undefined;
  }

  // ==========================================
  // 1. ATOMICITY: All-or-Nothing Transfer
  // ==========================================
  public async executeAtomicTransfer(
    fromId: string,
    toId: string,
    amount: number,
    simulateCrashAtStep = 0
  ): Promise<{ success: boolean; rolledBack: boolean; balances: Record<string, number>; reason: string }> {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be finite and positive');
    if (fromId === toId) throw new Error('Sender and recipient must differ');
    const from = this.accounts.get(fromId);
    const to = this.accounts.get(toId);

    if (!from || !to) throw new Error('Account not found');
    if (from.balance < amount) throw new Error('Insufficient funds');

    // Snapshot for transaction rollback (Write-Ahead Log / Undo log)
    const undoSnapshot = {
      fromBalance: from.balance,
      toBalance: to.balance,
    };

    try {
      // Step 1: Debit sender
      from.balance -= amount;

      if (simulateCrashAtStep === 1) {
        throw new Error('Simulated Database Crash / Power Failure during step 1');
      }

      // Step 2: Credit receiver
      to.balance += amount;

      if (simulateCrashAtStep === 2) {
        throw new Error('Simulated Network Partition during step 2');
      }

      return {
        success: true,
        rolledBack: false,
        balances: { [fromId]: from.balance, [toId]: to.balance },
        reason: 'Transaction committed successfully: Atomicity preserved.',
      };
    } catch (err: any) {
      // ROLLBACK: Restore from undo log
      from.balance = undoSnapshot.fromBalance;
      to.balance = undoSnapshot.toBalance;

      return {
        success: false,
        rolledBack: true,
        balances: { [fromId]: from.balance, [toId]: to.balance },
        reason: `Atomicity Rollback: ${err.message}. State cleanly reverted.`,
      };
    }
  }

  // ==========================================
  // 2. ISOLATION ANOMALIES DEMO
  // ==========================================
  public simulateDirtyReadAnomaly(): {
    anomaly: string;
    isolationLevel: string;
    sequence: string[];
    explanation: string;
  } {
    return {
      anomaly: 'Dirty Read (G1)',
      isolationLevel: 'Read Uncommitted',
      sequence: [
        'Tx1 begins and updates Alice balance from $1,000 to $500 (uncommitted in memory buffer).',
        'Tx2 begins at Read Uncommitted, reads Alice balance as $500, and makes a loan decision.',
        'Tx1 encounters an error or cancels, and issues ROLLBACK. Alice balance reverts to $1,000.',
        'Tx2 acted upon data that NEVER truly existed in the database!',
      ],
      explanation:
        'Read Committed prevents Dirty Reads by ensuring queries only read rows committed before the query began.',
    };
  }

  public simulateNonRepeatableReadAnomaly(): {
    anomaly: string;
    isolationLevel: string;
    sequence: string[];
    explanation: string;
  } {
    return {
      anomaly: 'Non-Repeatable Read (Fuzzy Read - G2a)',
      isolationLevel: 'Read Committed',
      sequence: [
        'Tx1 begins at Read Committed: Reads Alice balance = $1,000.',
        'Tx2 begins, updates Alice balance to $1,500, and COMMITS immediately.',
        'Tx1 re-reads Alice balance within the SAME transaction: Now receives $1,500!',
        'Two identical reads within Tx1 returned different results.',
      ],
      explanation:
        'Repeatable Read prevents this via MVCC (Multi-Version Concurrency Control) snapshot isolation: Tx1 sees a consistent snapshot of data as of when Tx1 started.',
    };
  }

  public simulatePhantomReadAnomaly(): {
    anomaly: string;
    isolationLevel: string;
    sequence: string[];
    explanation: string;
  } {
    return {
      anomaly: 'Phantom Read (A3)',
      isolationLevel: 'Repeatable Read',
      sequence: [
        'Tx1 runs range query: SELECT COUNT(*) FROM accounts WHERE balance > 500 (Returns 1).',
        'Tx2 inserts a brand new account "acc_charlie" with balance $800 and COMMITS.',
        'Tx1 re-runs the range query: Now returns 2 rows! The new row appeared like a "phantom".',
      ],
      explanation:
        'Serializable isolation prevents Phantom Reads using Next-Key Locks (Index lock + Gap lock) or Serializable Snapshot Isolation (SSI).',
    };
  }
}

export const globalAcidSimulator = new AcidSimulator();
