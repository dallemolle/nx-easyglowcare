import { beforeEach, describe, expect, it } from "vitest";

import { getTestDb, resetDb } from "../../../test/db";
import { serviceCategories, services, tenants } from "../db/schema";
import { tenantScope } from "../db/tenant-scope";

import { getPublicCatalog } from "./catalog";

const db = getTestDb();

async function createTenant(slug: string) {
  const [tenant] = await db.insert(tenants).values({ slug, name: slug }).returning();
  return tenantScope(db, tenant.id);
}

describe("getPublicCatalog", () => {
  beforeEach(resetDb);

  it("mostra só categorias com serviços ativos do próprio tenant", async () => {
    const a = await createTenant("clinica-a");
    const b = await createTenant("clinica-b");

    const [x, y] = await a.insert(serviceCategories, [
      { name: "X", slug: "x", position: 1 },
      { name: "Y", slug: "y", position: 2 },
      { name: "Z", slug: "z", position: 3 },
    ]);
    const service = { durationMin: 60, priceCents: 10000 };
    await a.insert(services, [
      { ...service, categoryId: x.id, name: "Ativo", slug: "ativo" },
      { ...service, categoryId: x.id, name: "Inativo", slug: "inativo", isActive: false },
      { ...service, categoryId: y.id, name: "Inativo Y", slug: "inativo-y", isActive: false },
    ]);
    const [bCat] = await b.insert(serviceCategories, { name: "X", slug: "x" });
    await b.insert(services, { ...service, categoryId: bCat.id, name: "De B", slug: "de-b" });

    const catalog = await getPublicCatalog(a);

    expect(catalog.map((c) => c.name)).toEqual(["X"]);
    expect(catalog[0].services.map((s) => s.name)).toEqual(["Ativo"]);
  });

  it("ordena categorias por posição e serviços por nome", async () => {
    const a = await createTenant("clinica-a");
    const [second, first] = await a.insert(serviceCategories, [
      { name: "Segunda", slug: "segunda", position: 2 },
      { name: "Primeira", slug: "primeira", position: 1 },
    ]);
    const service = { durationMin: 30, priceCents: 5000 };
    await a.insert(services, [
      { ...service, categoryId: first.id, name: "Beta", slug: "beta" },
      { ...service, categoryId: first.id, name: "Alfa", slug: "alfa" },
      { ...service, categoryId: second.id, name: "Gama", slug: "gama" },
    ]);

    const catalog = await getPublicCatalog(a);

    expect(catalog.map((c) => c.name)).toEqual(["Primeira", "Segunda"]);
    expect(catalog[0].services.map((s) => s.name)).toEqual(["Alfa", "Beta"]);
  });

  it("devolve lista vazia para tenant sem serviços", async () => {
    const a = await createTenant("clinica-a");
    expect(await getPublicCatalog(a)).toEqual([]);
  });
});
