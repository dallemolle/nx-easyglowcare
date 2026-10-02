import { boolean, foreignKey, index, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { staffUsers } from "./staff";
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
    staffUserId: uuid(),
  },
  (t) => [
    index().on(t.tenantId),
    unique().on(t.tenantId, t.id),
    unique().on(t.staffUserId),
    // Usuários da equipe nunca são apagados (só desativados): sem ação no delete.
    foreignKey({
      columns: [t.tenantId, t.staffUserId],
      foreignColumns: [staffUsers.tenantId, staffUsers.id],
    }),
  ],
);

export type Room = typeof rooms.$inferSelect;
export type Equipment = typeof equipment.$inferSelect;
export type Professional = typeof professionals.$inferSelect;
