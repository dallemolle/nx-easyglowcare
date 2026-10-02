import type { Metadata } from "next";

export const metadata: Metadata = { title: "Minha conta" };

export default function MinhaContaPage() {
  return (
    <main className="mx-auto flex w-full max-w-screen-sm flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Minha conta</h1>
      <p className="text-muted-foreground">Em breve: acompanhe seus agendamentos.</p>
    </main>
  );
}
