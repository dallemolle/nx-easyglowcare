import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { PendingSignup } from "@/lib/validation/entry";

import { messageChannel } from "./messaging";
import { people } from "./people";
import { staffUsers } from "./staff";
import { tenantColumns, tenants } from "./tenancy";

export const otpPurpose = pgEnum("otp_purpose", ["signup", "login"]);

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

// Desafio de código (OTP). Os limites de envio contam linhas por telefone e IP entre clínicas.
export const otpCodes = pgTable(
  "otp_codes",
  {
    ...tenantColumns(),
    purpose: otpPurpose().notNull(),
    personId: uuid(),
    phone: text().notNull(),
    channel: messageChannel().notNull(),
    codeHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    attempts: integer().notNull().default(0),
    consumedAt: timestamp({ withTimezone: true }),
    invalidatedAt: timestamp({ withTimezone: true }),
    ip: text(),
    userAgent: text(),
    pendingSignup: jsonb().$type<PendingSignup>(),
  },
  (t) => [
    index().on(t.tenantId),
    unique().on(t.tenantId, t.id),
    index().on(t.phone, t.createdAt),
    index().on(t.ip, t.createdAt),
    foreignKey({
      columns: [t.tenantId, t.personId],
      foreignColumns: [people.tenantId, people.id],
    }).onDelete("cascade"),
    check("otp_codes_channel_allowed", sql`${t.channel} IN ('whatsapp', 'sms')`),
    check(
      "otp_codes_person_by_purpose",
      sql`(${t.purpose} = 'login' AND ${t.personId} IS NOT NULL) OR (${t.purpose} = 'signup' AND ${t.personId} IS NULL)`,
    ),
    check(
      "otp_codes_pending_by_purpose",
      sql`(${t.purpose} = 'signup' AND ${t.pendingSignup} IS NOT NULL) OR (${t.purpose} = 'login' AND ${t.pendingSignup} IS NULL)`,
    ),
  ],
);

export const personSessions = pgTable(
  "person_sessions",
  {
    ...tenantColumns(),
    personId: uuid().notNull(),
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
    index().on(t.personId),
    foreignKey({
      columns: [t.tenantId, t.personId],
      foreignColumns: [people.tenantId, people.id],
    }).onDelete("cascade"),
  ],
);

export type Session = typeof sessions.$inferSelect;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type OtpCode = typeof otpCodes.$inferSelect;
export type PersonSession = typeof personSessions.$inferSelect;
