import { getTableName } from 'drizzle-orm';

/**
 * Minimal in-memory stand-in for the Drizzle client, used by service
 * specs. It does NOT evaluate where() clauses — each spec seeds exactly
 * the rows the method under test should see per table, and asserts on
 * the recorded inserts / updates / deletes. That is enough to prove
 * wiring (which table, which values, which order) without a database.
 */
export type FakeRow = Record<string, unknown>;

export function makeFakeDb(seed: Record<string, FakeRow[]> = {}) {
  const inserted: Array<{ table: string; values: FakeRow }> = [];
  const updated: Array<{ table: string; values: FakeRow }> = [];
  const deleted: string[] = [];
  const name = (table: unknown) => getTableName(table as never);

  function chain(result: () => FakeRow[]) {
    const b: Record<string, unknown> & { __table?: unknown } = {
      from: (t: unknown) => {
        b.__table = t;
        return b;
      },
      where: () => b,
      innerJoin: () => b,
      leftJoin: () => b,
      orderBy: () => b,
      groupBy: () => b,
      limit: () => b,
      offset: () => b,
      onConflictDoNothing: () => b,
      onConflictDoUpdate: () => b,
      returning: () => Promise.resolve(result()),
      then: (
        res: (v: FakeRow[]) => unknown,
        rej?: (e: unknown) => unknown,
      ) => Promise.resolve(result()).then(res, rej),
    };
    return b;
  }

  const db: Record<string, unknown> = {
    insert: (table: unknown) => {
      const b = chain(() => []);
      b.values = (v: FakeRow) => {
        inserted.push({ table: name(table), values: v });
        const rows = [
          { ...v, id: (v.id as string) ?? `id-${inserted.length}` },
        ];
        return chain(() => rows);
      };
      return b;
    },
    update: (table: unknown) => {
      const b = chain(() => [{ id: 'updated-id' }]);
      b.set = (v: FakeRow) => {
        updated.push({ table: name(table), values: v });
        return b;
      };
      return b;
    },
    delete: (table: unknown) => {
      deleted.push(name(table));
      return chain(() => [{ id: 'deleted-id' }]);
    },
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(db),
  };
  // select() needs the table chosen by the chained .from() call, so wrap:
  const selectChain = () => {
    const b = chain(() => seed[name(b.__table)] ?? []);
    return b;
  };
  db.select = selectChain;
  return { db, inserted, updated, deleted };
}
