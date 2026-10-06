import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { LegalDocument } from "@/components/legal-document";
import { termsOfUse } from "@/lib/legal/terms";
import { canonicalTenantPath } from "@/lib/tenant-path";
import { getTenantBySlug } from "@/server/services/tenants";

export const metadata: Metadata = { title: "Termos de uso" };

export default async function TermosPage({ params, searchParams }: PageProps<"/[slug]/termos">) {
  const { slug } = await params;
  const found = await getTenantBySlug(slug);
  if (!found) notFound();
  const { tenant } = found;
  const canonical = canonicalTenantPath(slug, tenant.slug, "/termos", await searchParams);
  if (canonical) redirect(canonical);

  return (
    <LegalDocument
      slug={tenant.slug}
      clinicName={tenant.name}
      title="Termos de uso"
      sections={termsOfUse(tenant.name)}
    />
  );
}
