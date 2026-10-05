import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InstallGuide } from "@/components/pwa/install-guide";
import { getTenantBySlug } from "@/server/services/tenants";

export const metadata: Metadata = { title: "Instalar app" };

export default async function InstalarPage({ params }: PageProps<"/[slug]/instalar">) {
  const found = await getTenantBySlug((await params).slug);
  if (!found) notFound();
  const { tenant } = found;

  return (
    <main className="mx-auto flex w-full max-w-screen-sm flex-1 flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Instalar o app</h1>
      <p className="text-muted-foreground">
        Coloque {tenant.name} na tela inicial do celular para abrir com um toque.
      </p>
      <InstallGuide appName={tenant.name} />
      <Link href={`/${tenant.slug}`} className="self-start text-sm underline underline-offset-4">
        Voltar
      </Link>
    </main>
  );
}
