import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { whatsAppNumber } from "@/lib/br/phone";
import { safeReturnPath } from "@/lib/return-path";
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

  const raw = (await searchParams).voltar;
  const voltar = typeof raw === "string" ? raw : null;

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
