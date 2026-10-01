import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { tenantColumns } from "./tenancy";

export const serviceCategories = pgTable(
  "service_categories",
  {
    ...tenantColumns(),
    name: text().notNull(),
    slug: text().notNull(),
    position: integer().notNull().default(0),
  },
  (t) => [index().on(t.tenantId), unique().on(t.tenantId, t.id), unique().on(t.tenantId, t.slug)],
);

export const services = pgTable(
  "services",
  {
    ...tenantColumns(),
    categoryId: uuid().notNull(),
    name: text().notNull(),
    slug: text().notNull(),
    description: text(),
    durationMin: integer().notNull(),
    priceCents: integer().notNull(),
    // true = preço inicial ("a partir de").
    priceIsFrom: boolean().notNull().default(false),
    // Tempo de higienização após o atendimento; entra no bloqueio da agenda.
    cleanupBufferMin: integer().notNull().default(0),
    requiresAssessment: boolean().notNull().default(false),
    isActive: boolean().notNull().default(true),
  },
  (t) => [
    index().on(t.tenantId, t.categoryId),
    unique().on(t.tenantId, t.id),
    unique().on(t.tenantId, t.slug),
    foreignKey({
      columns: [t.tenantId, t.categoryId],
      foreignColumns: [serviceCategories.tenantId, serviceCategories.id],
    }),
    check("services_duration_positive", sql`${t.durationMin} > 0`),
    check("services_price_non_negative", sql`${t.priceCents} >= 0`),
    check("services_cleanup_buffer_non_negative", sql`${t.cleanupBufferMin} >= 0`),
  ],
);

export type ServiceCategory = typeof serviceCategories.$inferSelect;
export type Service = typeof services.$inferSelect;
