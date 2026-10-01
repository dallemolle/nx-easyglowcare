import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { baseColumns } from "./columns";

export const tenantSegment = pgEnum("tenant_segment", [
  "aesthetics",
  "salon",
  "barbershop",
  "other",
]);

export const tenants = pgTable(
  "tenants",
  {
    ...baseColumns(),
    slug: text().notNull().unique(),
    name: text().notNull(),
    segment: tenantSegment().notNull().default("aesthetics"),
    timezone: text().notNull().default("America/Sao_Paulo"),
    config: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [check("tenants_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`)],
);

/** Colunas de toda tabela de negócio: as comuns + tenant_id com cascade. */
export const tenantColumns = () => ({
  ...baseColumns(),
  tenantId: uuid()
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
});

export const locations = pgTable(
  "locations",
  {
    ...tenantColumns(),
    name: text().notNull(),
    address: text(),
    phone: text(),
    isActive: boolean().notNull().default(true),
  },
  (t) => [index().on(t.tenantId), unique().on(t.tenantId, t.id)],
);

export type Tenant = typeof tenants.$inferSelect;
export type Location = typeof locations.$inferSelect;
