import { eq } from "drizzle-orm";
import { Clock, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration, formatServicePrice } from "@/lib/format";
import { locations } from "@/server/db/schema";
import { getPublicCatalog } from "@/server/services/catalog";
import { getTenantBySlug } from "@/server/services/tenants";

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const found = await getTenantBySlug((await params).slug);
  return found ? { title: { absolute: found.tenant.name } } : {};
}

export default async function TenantPage({ params }: PageProps<"/[slug]">) {
  // Catálogo lido do banco a cada request nesta fase.
  await connection();

  const found = await getTenantBySlug((await params).slug);
  if (!found) notFound();

  const { tenant, scope } = found;
  const [catalog, [location]] = await Promise.all([
    getPublicCatalog(scope),
    scope.select(locations, eq(locations.isActive, true)),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-screen-sm flex-1 flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{tenant.name}</h1>
        {location?.address && (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
            {location.address}
          </p>
        )}
      </header>

      {catalog.length === 0 ? (
        <p className="text-muted-foreground">Catálogo em breve.</p>
      ) : (
        catalog.map((category) => (
          <section key={category.id} aria-labelledby={`cat-${category.slug}`} className="flex flex-col gap-3">
            <h2 id={`cat-${category.slug}`} className="text-xl font-semibold">
              {category.name}
            </h2>
            <ul className="flex flex-col gap-3">
              {category.services.map((service) => (
                <li key={service.id}>
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>{service.name}</CardTitle>
                      {service.description && (
                        <CardDescription>{service.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="font-medium">
                        {formatServicePrice(service.priceCents, service.priceIsFrom)}
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock aria-hidden className="size-3.5" />
                        {formatDuration(service.durationMin)}
                      </span>
                      {service.requiresAssessment && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                          Requer avaliação
                        </span>
                      )}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
