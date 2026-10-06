import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { maskCpf } from "@/lib/br/cpf";
import { maskPhone } from "@/lib/br/phone";
import { requireClient } from "@/server/auth/current-client";

import { signOutAction } from "./actions";
import { SessionRefresher } from "./session-refresher";

export const metadata: Metadata = { title: "Minha conta" };

export default async function MinhaContaPage({ params }: PageProps<"/[slug]/minha-conta">) {
  const { slug } = await params;
  const { person, tenant, shouldRenew } = await requireClient(slug, `/${slug}/minha-conta`);
  const firstName = person.name.trim().split(/\s+/)[0];

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6 px-4 py-8">
      {shouldRenew && <SessionRefresher slug={tenant.slug} />}
      <Link href={`/${tenant.slug}`} className="self-start text-sm text-muted-foreground underline underline-offset-4">
        {tenant.name}
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Olá, {firstName}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">CPF</dt>
            <dd>{maskCpf(person.cpf)}</dd>
            <dt className="text-muted-foreground">Celular</dt>
            <dd>{maskPhone(person.phone)}</dd>
          </dl>
          <form action={signOutAction.bind(null, tenant.slug)}>
            <Button type="submit" variant="outline" className="w-full">
              Sair
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
