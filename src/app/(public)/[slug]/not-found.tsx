import Link from "next/link";

export default function TenantNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-screen-sm flex-1 flex-col justify-center gap-3 px-4 py-16">
      <h1 className="text-2xl font-semibold">Clínica não encontrada</h1>
      <p className="text-muted-foreground">Confira o endereço digitado.</p>
      <Link href="/" className="text-sm underline underline-offset-4">
        Voltar ao início
      </Link>
    </main>
  );
}
