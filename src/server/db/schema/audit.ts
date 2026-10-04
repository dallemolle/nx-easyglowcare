import { index, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { tenants } from "./tenancy";

export const auditActorType = pgEnum("audit_actor_type", ["staff", "system"]);

// Sem updatedAt: um registro de auditoria nunca é atualizado.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorType: auditActorType().notNull(),
    actorId: uuid(),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: uuid(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    ip: text(),
  },
  (t) => [index().on(t.tenantId, t.createdAt), unique().on(t.tenantId, t.id)],
);

export type AuditLogEntry = typeof auditLog.$inferSelect;
