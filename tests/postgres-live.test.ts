import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DualModePostgresAdapter } from '../src/02-api-security-db/adapters/dual-mode-adapters.js';

// Point this at a disposable database: these tests reset the seeded lab accounts.
describe.skipIf(!process.env.TEST_DATABASE_URL)('Live PostgreSQL transaction guarantees', () => {
  let db: DualModePostgresAdapter;
  beforeAll(async () => {
    db = new DualModePostgresAdapter(process.env.TEST_DATABASE_URL);
    await db.initSchema();
    expect((await db.healthCheck()).status).toBe('CONNECTED');
  });
  beforeEach(async () => {
    await db.query("UPDATE accounts SET balance = CASE id WHEN 'acc_alice' THEN 1000 ELSE 500 END, version = 1 WHERE id IN ('acc_alice', 'acc_bob')");
  });
  afterAll(async () => { await db?.close(); });

  async function balances() {
    const result = await db.query("SELECT id, balance FROM accounts WHERE id IN ('acc_alice', 'acc_bob') ORDER BY id");
    return result.rows.map(row => Number(row.balance));
  }
  it('commits both sides of a real transfer', async () => {
    const result = await db.executeAtomicTransfer('acc_alice', 'acc_bob', 100);
    expect(result).toMatchObject({ success: true, mode: 'LIVE_DATABASE', balances: { acc_alice: 900, acc_bob: 600 } });
    expect(await balances()).toEqual([900, 600]);
  });
  it.each([1, 2])('rolls back a crash at step %s on the live database', async step => {
    expect(await db.executeAtomicTransfer('acc_alice', 'acc_bob', 100, step)).toMatchObject({ success: false, rolledBack: true, mode: 'LIVE_DATABASE' });
    expect(await balances()).toEqual([1000, 500]);
  });
  it('does not debit the sender if the recipient is absent', async () => {
    expect((await db.executeAtomicTransfer('acc_alice', 'missing', 100)).success).toBe(false);
    expect(await balances()).toEqual([1000, 500]);
  });
  it('rejects insufficient funds without changing either account', async () => {
    expect((await db.executeAtomicTransfer('acc_alice', 'acc_bob', 2000)).success).toBe(false);
    expect(await balances()).toEqual([1000, 500]);
  });
  it('handles reciprocal concurrent transfers without lost money or deadlock', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) => index % 2
      ? db.executeAtomicTransfer('acc_bob', 'acc_alice', 10)
      : db.executeAtomicTransfer('acc_alice', 'acc_bob', 10)));
    expect(results.every(result => result.success)).toBe(true);
    expect(await balances()).toEqual([1000, 500]);
  });
  it('does not hide a SQL error behind a fallback result', async () => {
    await expect(db.query('SELECT * FROM table_that_does_not_exist')).rejects.toThrow();
  });
});
