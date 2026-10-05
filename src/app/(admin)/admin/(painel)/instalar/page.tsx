import type { Metadata } from "next";
import Link from "next/link";

import { InstallGuide } from "@/components/pwa/install-guide";
import { requireStaff } from "@/server/auth/current";

export const metadata: Metadata = { title: "Instalar o painel" };

export default async function InstalarPainelPage() {
  await requireStaff();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Instalar o painel</h1>
      <p className="text-muted-foreground">
        Coloque o painel na tela inicial do celular para abrir a agenda com um toque.
      </p>
      <InstallGuide appName="EasyGlowCare Painel" />
      <Link href="/admin" className="self-start text-sm underline underline-offset-4">
        Voltar
      </Link>
    </div>
  );
}
