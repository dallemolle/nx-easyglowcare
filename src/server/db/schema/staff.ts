import { sql } from "drizzle-orm";
import { boolean, check, index, pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { tenantColumns } from "./tenancy";

export const staffRole = pgEnum("staff_role", ["owner", "reception", "professional"]);

export const staffUsers = pgTable(
  "staff_users",
  {
    ...tenantColumns(),
    name: text().notNull(),
    email: text().notNull(),
    passwordHash: text().notNull(),
    role: staffRole().notNull(),
    mustChangePassword: boolean().notNull().default(false),
    isActive: boolean().notNull().default(true),
    lastLoginAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index().on(t.tenantId),
    unique().on(t.tenantId, t.id),
    unique().on(t.email),
    check("staff_users_email_lowercase", sql`${t.email} = lower(${t.email})`),
  ],
);

export type StaffRole = (typeof staffRole.enumValues)[number];
export type StaffUser = typeof staffUsers.$inferSelect;
