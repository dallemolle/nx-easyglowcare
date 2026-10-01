import "server-only";

import { eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/server/db/client";
import { tenants, type Tenant } from "@/server/db/schema";
import { tenantScope, type AnyPgDatabase, type TenantScope } from "@/server/db/tenant-scope";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MAX_LENGTH = 63;

/** Normaliza o slug vindo da URL; devolve null se não for um slug válido. */
export function normalizeSlug(raw: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const slug = decoded.trim().toLowerCase();
  if (slug.length > SLUG_MAX_LENGTH || !SLUG_PATTERN.test(slug)) return null;
  return slug;
}

export type TenantContext = { tenant: Tenant; scope: TenantScope };

export async function findTenantBySlug(
  database: AnyPgDatabase,
  rawSlug: string,
): Promise<TenantContext | null> {
  const slug = normalizeSlug(rawSlug);
  if (!slug) return null;

  const [tenant] = await database.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (!tenant) return null;

  return { tenant, scope: tenantScope(database, tenant.id) };
}

/** Tenant das rotas públicas (/[slug]). Memoizado por request (página + generateMetadata). */
export const getTenantBySlug = cache((slug: string) => findTenantBySlug(db, slug));
