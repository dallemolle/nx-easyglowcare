import { boolean, foreignKey, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { staffUsers } from "./staff";
import { tenantColumns, tenants } from "./tenancy";

export const sessions = pgTable(
  "sessions",
  {
    ...tenantColumns(),
    staffUserId: uuid().notNull(),
    tokenHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    ip: text(),
    userAgent: text(),
  },
  (t) => [
    index().on(t.tenantId),
    unique().on(t.tenantId, t.id),
    unique().on(t.tokenHash),
    index().on(t.staffUserId),
    foreignKey({
      columns: [t.tenantId, t.staffUserId],
      foreignColumns: [staffUsers.tenantId, staffUsers.id],
    }).onDelete("cascade"),
  ],
);

// Sem updatedAt (ruling da tarefa): uma tentativa de login nunca é atualizada.
// tenantId é opcional: uma tentativa com e-mail inexistente não pertence a nenhuma clínica.
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid().primaryKey().defaultRandom(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid().references(() => tenants.id, { onDelete: "cascade" }),
    email: text().notNull(),
    ip: text().notNull(),
    succeeded: boolean().notNull(),
  },
  (t) => [index().on(t.email, t.createdAt), index().on(t.ip, t.createdAt)],
);

export type Session = typeof sessions.$inferSelect;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
