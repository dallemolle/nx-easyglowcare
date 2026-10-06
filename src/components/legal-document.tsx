import Link from "next/link";

import { type LegalSection, TERMS_VERSION } from "@/lib/legal/terms";

export function LegalDocument({
  slug,
  clinicName,
  title,
  sections,
}: {
  slug: string;
  clinicName: string;
  title: string;
  sections: LegalSection[];
}) {
  return (
    <main className="mx-auto flex w-full max-w-screen-sm flex-1 flex-col gap-6 px-4 py-8">
      <Link href={`/${slug}`} className="self-start text-sm text-muted-foreground underline underline-offset-4">
        {clinicName}
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">Versão {TERMS_VERSION}</p>
        <p role="note" className="rounded-md border bg-secondary px-3 py-2 text-sm text-secondary-foreground">
          Rascunho em revisão jurídica.
        </p>
      </header>
      {sections.map((section) => (
        <section key={section.title} className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">{section.title}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="leading-relaxed">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </main>
  );
}
