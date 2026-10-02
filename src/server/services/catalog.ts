import { eq } from "drizzle-orm";

import { serviceCategories, services, type Service } from "@/server/db/schema";
import type { TenantScope } from "@/server/db/tenant-scope";

export type CatalogCategory = {
  id: string;
  name: string;
  slug: string;
  services: Service[];
};

/** Catálogo público: categorias (por posição) com seus serviços ativos (por nome). */
export async function getPublicCatalog(scope: TenantScope): Promise<CatalogCategory[]> {
  const [categories, activeServices] = await Promise.all([
    scope.select(serviceCategories),
    scope.select(services, eq(services.isActive, true)),
  ]);

  const byName = (x: { name: string }, y: { name: string }) => x.name.localeCompare(y.name, "pt-BR");

  return categories
    .toSorted((x, y) => x.position - y.position || byName(x, y))
    .map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      services: activeServices.filter((s) => s.categoryId === category.id).toSorted(byName),
    }))
    .filter((category) => category.services.length > 0);
}
