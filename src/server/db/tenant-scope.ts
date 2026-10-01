import { and, eq, type SQL } from "drizzle-orm";
import type { PgColumn, PgDatabase, PgQueryResultHKT, PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";

// Aceita o client do app (neon-serverless), o de teste (node-postgres) e transações.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- genéricos internos do Drizzle
export type AnyPgDatabase = PgDatabase<PgQueryResultHKT, any, any>;

/** Só tabelas com coluna `tenantId` podem ser usadas com o escopo. */
export type TenantTable = PgTable & { tenantId: PgColumn };

type Row<T extends TenantTable> = T["$inferSelect"];
type InsertValues<T extends TenantTable> = Omit<T["$inferInsert"], "tenantId">;
type Condition = SQL | undefined;

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantScopeError";
  }
}

export class InvalidTenantIdError extends TenantScopeError {
  constructor() {
    super("tenantId inválido: esperado um UUID");
    this.name = "InvalidTenantIdError";
  }
}

export type TenantScope = {
  readonly tenantId: string;
  where(table: TenantTable, ...conds: Condition[]): SQL;
  select<T extends TenantTable>(table: T, ...conds: Condition[]): Promise<Row<T>[]>;
  insert<T extends TenantTable>(
    table: T,
    values: InsertValues<T> | InsertValues<T>[],
  ): Promise<Row<T>[]>;
  update<T extends TenantTable>(
    table: T,
    set: Partial<T["$inferInsert"]>,
    ...conds: Condition[]
  ): Promise<Row<T>[]>;
  delete<T extends TenantTable>(table: T, ...conds: Condition[]): Promise<Row<T>[]>;
};

const uuidSchema = z.uuid();

function withoutTenantId<V extends object>(values: V): Omit<V, "tenantId"> {
  const copy: Partial<V> & { tenantId?: unknown } = { ...values };
  delete copy.tenantId;
  return copy as Omit<V, "tenantId">;
}

/**
 * Acesso ao banco restrito a um tenant: todo filtro inclui `tenant_id` e toda escrita
 * grava o tenant do escopo, ignorando qualquer `tenantId` recebido.
 */
export function tenantScope(db: AnyPgDatabase, tenantId: string): TenantScope {
  if (!uuidSchema.safeParse(tenantId).success) throw new InvalidTenantIdError();

  const where = (table: TenantTable, ...conds: Condition[]): SQL =>
    and(eq(table.tenantId, tenantId), ...conds) as SQL;

  // Os builders do Drizzle não inferem bem tabelas genéricas; os tipos públicos acima garantem o contrato.
  return {
    tenantId,
    where,

    async select(table, ...conds) {
      return db.select().from(table as PgTable).where(where(table, ...conds)) as never;
    },

    async insert(table, values) {
      const list = (Array.isArray(values) ? values : [values]).map((v) => ({
        ...withoutTenantId(v),
        tenantId,
      }));
      if (list.length === 0) return [];
      return db.insert(table).values(list as never).returning() as never;
    },

    async update(table, set, ...conds) {
      const values = withoutTenantId(set);
      if (Object.keys(values).length === 0) {
        throw new TenantScopeError("update sem campos após remover tenantId");
      }
      return db
        .update(table)
        .set(values as never)
        .where(where(table, ...conds))
        .returning() as never;
    },

    async delete(table, ...conds) {
      return db.delete(table).where(where(table, ...conds)).returning() as never;
    },
  };
}
