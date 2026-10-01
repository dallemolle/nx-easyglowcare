import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-screen-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">EasyGlowCare</h1>
      <p className="text-muted-foreground">
        Agendamento online e relacionamento para clínicas de estética.
      </p>
      <Button asChild className="self-start">
        <Link href="/easyglowcare">Ver clínica de exemplo</Link>
      </Button>
    </main>
  );
}
