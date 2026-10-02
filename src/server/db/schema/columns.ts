import { timestamp, uuid } from "drizzle-orm/pg-core";

/** Colunas comuns a toda tabela. Para tabelas de negócio use `tenantColumns()` (tenancy.ts). */
export const baseColumns = () => ({
  id: uuid().primaryKey().defaultRandom(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
