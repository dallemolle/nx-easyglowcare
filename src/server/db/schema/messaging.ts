import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { tenantColumns } from "./tenancy";

// Mesma lista de MESSAGE_CHANNELS (src/lib/validation/outbox.ts); um teste garante a igualdade.
export const messageChannel = pgEnum("message_channel", ["whatsapp", "sms", "email", "push"]);
export const messageStatus = pgEnum("message_status", ["pending", "sending", "sent", "failed"]);

export const messageOutbox = pgTable(
  "message_outbox",
  {
    ...tenantColumns(),
    channel: messageChannel().notNull(),
    template: text().notNull(),
    recipient: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    sendAt: timestamp({ withTimezone: true }).notNull(),
    status: messageStatus().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    lockedUntil: timestamp({ withTimezone: true }),
    // Só o tipo do erro (nome e código): a mensagem do provedor pode trazer o destinatário.
    lastError: text(),
    dedupeKey: text(),
    sentAt: timestamp({ withTimezone: true }),
    providerMessageId: text(),
  },
  (t) => [
    index().on(t.tenantId),
    unique().on(t.tenantId, t.id),
    unique().on(t.tenantId, t.dedupeKey),
    index().on(t.status, t.sendAt),
  ],
);

export type MessageOutbox = typeof messageOutbox.$inferSelect;
