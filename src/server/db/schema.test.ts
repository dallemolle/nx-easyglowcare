import { is } from "drizzle-orm";
import { toSnakeCase } from "drizzle-orm/casing";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it } from "vitest";

import { resetDb, testPool } from "../../../test/db";

import * as schema from "./schema";

const tables = (Object.values(schema) as unknown[]).filter((value): value is PgTable =>
  is(value, PgTable),
);

describe("guardas do schema", () => {
  it("toda tabela exceto tenants tem tenant_id", () => {
    const checked = tables
      .map((table) => getTableConfig(table))
      .filter((config) => config.name !== "tenants");

    expect(checked.length).toBeGreaterThanOrEqual(6);
    for (const config of checked) {
      // Com casing "snake_case" o config guarda a chave TS; o nome real no banco é a conversão.
      expect(config.columns.map((c) => toSnakeCase(c.name)), config.name).toContain("tenant_id");
    }
  });
});

describe("restrições no banco", () => {
  beforeEach(resetDb);

  async function insertTenant(slug: string): Promise<string> {
    const { rows } = await testPool.query<{ id: string }>(
      "insert into tenants (slug, name) values ($1, $1) returning id",
      [slug],
    );
    return rows[0].id;
  }

  it("FK composta impede service de A com categoria de B", async () => {
    const tenantA = await insertTenant("clinica-a");
    const tenantB = await insertTenant("clinica-b");
    const { rows } = await testPool.query<{ id: string }>(
      "insert into service_categories (tenant_id, name, slug) values ($1, 'Facial', 'facial') returning id",
      [tenantB],
    );

    await expect(
      testPool.query(
        `insert into services (tenant_id, category_id, name, slug, duration_min, price_cents)
         values ($1, $2, 'Limpeza', 'limpeza', 60, 18000)`,
        [tenantA, rows[0].id],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("slug de tenant inválido é rejeitado pelo CHECK", async () => {
    await expect(insertTenant("Easy Glow")).rejects.toThrow(/check constraint/);
  });
});
