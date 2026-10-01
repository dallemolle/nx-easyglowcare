import { boolean, foreignKey, index, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { locations, tenantColumns } from "./tenancy";

export const rooms = pgTable(
  "rooms",
  {
    ...tenantColumns(),
    locationId: uuid().notNull(),
    name: text().notNull(),
    isActive: boolean().notNull().default(true),
  },
  (t) => [
    index().on(t.tenantId),
    unique().on(t.tenantId, t.id),
    unique().on(t.tenantId, t.locationId, t.name),
    foreignKey({
      columns: [t.tenantId, t.locationId],
      foreignColumns: [locations.tenantId, locations.id],
    }).onDelete("cascade"),
  ],
);

export const equipment = pgTable(
  "equipment",
  {
    ...tenantColumns(),
    locationId: uuid().notNull(),
    name: text().notNull(),
    isActive: boolean().notNull().default(true),
  },
  (t) => [
    index().on(t.tenantId),
    unique().on(t.tenantId, t.id),
    unique().on(t.tenantId, t.locationId, t.name),
    foreignKey({
      columns: [t.tenantId, t.locationId],
      foreignColumns: [locations.tenantId, locations.id],
    }).onDelete("cascade"),
  ],
);

export const professionals = pgTable(
  "professionals",
  {
    ...tenantColumns(),
    displayName: text().notNull(),
    bio: text(),
    color: text(),
    isActive: boolean().notNull().default(true),
  },
  (t) => [index().on(t.tenantId), unique().on(t.tenantId, t.id)],
);

export type Room = typeof rooms.$inferSelect;
export type Equipment = typeof equipment.$inferSelect;
export type Professional = typeof professionals.$inferSelect;
