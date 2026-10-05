import type { Metadata } from "next";

import { getTenantBySlug } from "@/server/services/tenants";

/** Todas as páginas de /<slug> apontam para o app da clínica. */
export async function generateMetadata({ params }: LayoutProps<"/[slug]">): Promise<Metadata> {
  const found = await getTenantBySlug((await params).slug);
  return found ? { manifest: `/${found.tenant.slug}/manifest.webmanifest` } : {};
}

export default function TenantLayout({ children }: LayoutProps<"/[slug]">) {
  return children;
}
