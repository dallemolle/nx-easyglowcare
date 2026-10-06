import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { LegalDocument } from "@/components/legal-document";
import { privacyPolicy } from "@/lib/legal/terms";
import { canonicalTenantPath } from "@/lib/tenant-path";
import { getTenantBySlug } from "@/server/services/tenants";

export const metadata: Metadata = { title: "Política de privacidade" };

export default async function PrivacidadePage({ params, searchParams }: PageProps<"/[slug]/privacidade">) {
  const { slug } = await params;
  const found = await getTenantBySlug(slug);
  if (!found) notFound();
  const { tenant } = found;
  const canonical = canonicalTenantPath(slug, tenant.slug, "/privacidade", await searchParams);
  if (canonical) redirect(canonical);

  return (
    <LegalDocument
      slug={tenant.slug}
      clinicName={tenant.name}
      title="Política de privacidade"
      sections={privacyPolicy(tenant.name)}
    />
  );
}
