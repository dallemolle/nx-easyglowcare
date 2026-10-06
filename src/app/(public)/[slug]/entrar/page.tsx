import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { whatsAppNumber } from "@/lib/br/phone";
import { safeReturnPath } from "@/lib/return-path";
import { canonicalTenantPath } from "@/lib/tenant-path";
import { getCurrentClient } from "@/server/auth/current-client";
import { locations } from "@/server/db/schema";
import { getTenantBySlug } from "@/server/services/tenants";

import { EntryFlow } from "./entry-flow";

export const metadata: Metadata = { title: "Entrar" };

export default async function EntrarPage({ params, searchParams }: PageProps<"/[slug]/entrar">) {
  const { slug } = await params;
  const found = await getTenantBySlug(slug);
  if (!found) notFound();
  const { tenant, scope } = found;

  const search = await searchParams;
  const canonical = canonicalTenantPath(slug, tenant.slug, "/entrar", search);
  if (canonical) redirect(canonical);

  const voltar = typeof search.voltar === "string" ? search.voltar : null;

  if (await getCurrentClient(slug)) redirect(safeReturnPath(tenant.slug, voltar));

  const [location] = await scope.select(locations, eq(locations.isActive, true));

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6 px-4 py-8">
      <Link href={`/${tenant.slug}`} className="self-start text-sm text-muted-foreground underline underline-offset-4">
        {tenant.name}
      </Link>
      <EntryFlow
        slug={tenant.slug}
        voltar={voltar}
        clinicPhone={whatsAppNumber(location?.phone)}
        clinicName={tenant.name}
      />
    </main>
  );
}
