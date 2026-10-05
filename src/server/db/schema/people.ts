import { sql } from "drizzle-orm";
import { boolean, check, date, foreignKey, index, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { tenantColumns } from "./tenancy";

export const personStatus = pgEnum("person_status", ["lead", "client"]);
export const conversionReason = pgEnum("conversion_reason", ["appointment", "payment", "attendance"]);
export const leadSource = pgEnum("lead_source", ["instagram", "google", "referral", "direct", "other"]);
export const consentKind = pgEnum("consent_kind", ["terms", "marketing", "image"]);

export const people = pgTable(
  "people",
  {
    ...tenantColumns(),
    status: personStatus().notNull().default("lead"),
    name: text().notNull(),
    cpf: text().notNull(),
    phone: text().notNull(),
    email: text(),
    birthDate: date({ mode: "string" }),
    phoneVerifiedAt: timestamp({ withTimezone: true }),
    convertedAt: timestamp({ withTimezone: true }),
    conversionReason: conversionReason(),
    source: leadSource().notNull(),
    utmSource: text(),
    utmMedium: text(),
    utmCampaign: text(),
    utmTerm: text(),
    utmContent: text(),
    ref: text(),
  },
  (t) => [
    index().on(t.tenantId),
    unique().on(t.tenantId, t.id),
    unique().on(t.tenantId, t.cpf),
    index().on(t.tenantId, t.phone),
    check("people_cpf_format", sql`${t.cpf} ~ '^[0-9]{11}$'`),
    check("people_phone_format", sql`${t.phone} ~ '^[1-9]{2}9[0-9]{8}$'`),
    check(
      "people_client_requires_conversion",
      sql`${t.status} <> 'client' OR (${t.convertedAt} IS NOT NULL AND ${t.conversionReason} IS NOT NULL)`,
    ),
  ],
);

// Só recebe inserções: retirar um consentimento é uma linha nova com granted = false.
export const personConsents = pgTable(
  "person_consents",
  {
    ...tenantColumns(),
    personId: uuid().notNull(),
    kind: consentKind().notNull(),
    version: text().notNull(),
    granted: boolean().notNull(),
    ip: text(),
    userAgent: text(),
  },
  (t) => [
    index().on(t.tenantId),
    unique().on(t.tenantId, t.id),
    index().on(t.personId, t.kind, t.createdAt),
    foreignKey({
      columns: [t.tenantId, t.personId],
      foreignColumns: [people.tenantId, people.id],
    }).onDelete("cascade"),
  ],
);

export type Person = typeof people.$inferSelect;
export type PersonConsent = typeof personConsents.$inferSelect;
