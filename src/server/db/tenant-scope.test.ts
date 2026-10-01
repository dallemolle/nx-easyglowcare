import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { getTestDb, resetDb } from "../../../test/db";

import { serviceCategories, tenants, type ServiceCategory, type Tenant } from "./schema";
import { InvalidTenantIdError, tenantScope, TenantScopeError, type TenantScope } from "./tenant-scope";

const db = getTestDb();

let tenantA: Tenant;
let tenantB: Tenant;
let catA: ServiceCategory;
let catB: ServiceCategory;
let a: TenantScope;

beforeEach(async () => {
  await resetDb();
  [tenantA, tenantB] = await db
    .insert(tenants)
    .values([
      { slug: "clinica-a", name: "Clínica A" },
      { slug: "clinica-b", name: "Clínica B" },
    ])
    .returning();
  [catA] = await db
    .insert(serviceCategories)
    .values({ tenantId: tenantA.id, name: "Facial A", slug: "facial" })
    .returning();
  [catB] = await db
    .insert(serviceCategories)
    .values({ tenantId: tenantB.id, name: "Facial B", slug: "facial" })
    .returning();
  a = tenantScope(db, tenantA.id);
});

async function findCategory(id: string) {
  const [row] = await db.select().from(serviceCategories).where(eq(serviceCategories.id, id));
  return row;
}

describe("tenantScope", () => {
  it("select isola por tenant", async () => {
    const rows = await a.select(serviceCategories);
    expect(rows.map((r) => r.id)).toEqual([catA.id]);
  });

  it("select combina filtros extras com o tenant", async () => {
    const rows = await a.select(serviceCategories, eq(serviceCategories.slug, "facial"));
    expect(rows.map((r) => r.id)).toEqual([catA.id]);
  });

  it("condição em SQL cru com OR não escapa do tenant", async () => {
    const rows = await a.select(serviceCategories, sql`${serviceCategories.slug} = 'x' or true`);
    expect(rows.map((r) => r.id)).toEqual([catA.id]);
  });

  it("update com condição OR não alcança outro tenant", async () => {
    await a.update(serviceCategories, { name: "z" }, sql`false or true`);
    expect((await findCategory(catB.id)).name).toBe("Facial B");
  });

  it("insert força o tenant do escopo", async () => {
    const [row] = await a.insert(serviceCategories, {
      name: "Corporal",
      slug: "corporal",
      tenantId: tenantB.id,
    } as never);
    expect(row.tenantId).toBe(tenantA.id);
  });

  it("insert com array vazio não consulta", async () => {
    expect(await a.insert(serviceCategories, [])).toEqual([]);
  });

  it("update não alcança outro tenant", async () => {
    const rows = await a.update(serviceCategories, { name: "x" }, eq(serviceCategories.id, catB.id));
    expect(rows).toEqual([]);
    expect((await findCategory(catB.id)).name).toBe("Facial B");
  });

  it("delete não alcança outro tenant", async () => {
    const rows = await a.delete(serviceCategories, eq(serviceCategories.id, catB.id));
    expect(rows).toEqual([]);
    expect(await findCategory(catB.id)).toBeDefined();
  });

  it("update não move a linha de tenant", async () => {
    const [row] = await a.update(
      serviceCategories,
      { name: "y", tenantId: tenantB.id },
      eq(serviceCategories.id, catA.id),
    );
    expect(row.tenantId).toBe(tenantA.id);
    expect(row.name).toBe("y");
  });

  it("update só com tenantId lança erro", async () => {
    await expect(a.update(serviceCategories, { tenantId: tenantB.id })).rejects.toThrow(
      new TenantScopeError("update sem campos após remover tenantId"),
    );
  });

  it("tenantId inválido", () => {
    expect(() => tenantScope(db, "x")).toThrow(InvalidTenantIdError);
  });
});
