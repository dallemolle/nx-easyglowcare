import { is } from "drizzle-orm";
import { toSnakeCase } from "drizzle-orm/casing";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it } from "vitest";

import { MESSAGE_CHANNELS } from "@/lib/validation/outbox";

import { resetDb, testPool } from "../../../test/db";

import * as schema from "./schema";

const tables = (Object.values(schema) as unknown[]).filter((value): value is PgTable =>
  is(value, PgTable),
);

const TENANT_OPTIONAL = ["tenants", "login_attempts"];

describe("guardas do schema", () => {
  it("toda tabela exceto tenants e login_attempts tem tenant_id obrigatório", () => {
    const checked = tables
      .map((table) => getTableConfig(table))
      .filter((config) => !TENANT_OPTIONAL.includes(config.name));

    expect(checked.length).toBeGreaterThanOrEqual(10);
    for (const config of checked) {
      // Com casing "snake_case" o config guarda a chave TS; o nome real no banco é a conversão.
      expect(config.columns.map((c) => toSnakeCase(c.name)), config.name).toContain("tenant_id");
    }
  });

  it("os canais do Zod e do enum do banco são os mesmos", () => {
    expect(schema.messageChannel.enumValues).toEqual([...MESSAGE_CHANNELS]);
  });

  it("audit_log não tem updated_at", () => {
    const config = getTableConfig(schema.auditLog);
    expect(config.columns.map((c) => toSnakeCase(c.name))).not.toContain("updated_at");
  });

  it("login_attempts tem tenant_id (opcional)", () => {
    const config = tables
      .map((table) => getTableConfig(table))
      .find((c) => c.name === "login_attempts");

    expect(config).toBeDefined();
    expect(config?.columns.map((c) => toSnakeCase(c.name))).toContain("tenant_id");
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

  const OUTBOX_INSERT = `insert into message_outbox (tenant_id, channel, template, recipient, send_at, dedupe_key)
    values ($1, 'whatsapp', 'teste', '11999990000', now(), $2)`;

  it("dedupe_key é única por clínica", async () => {
    const tenantA = await insertTenant("clinica-a");
    await testPool.query(OUTBOX_INSERT, [tenantA, "chave-1"]);
    await expect(testPool.query(OUTBOX_INSERT, [tenantA, "chave-1"])).rejects.toThrow(/unique/);
  });

  it("a mesma dedupe_key em clínicas diferentes é aceita, e nula pode repetir", async () => {
    const tenantA = await insertTenant("clinica-a");
    const tenantB = await insertTenant("clinica-b");
    await testPool.query(OUTBOX_INSERT, [tenantA, "chave-1"]);
    await testPool.query(OUTBOX_INSERT, [tenantB, "chave-1"]);
    await testPool.query(OUTBOX_INSERT, [tenantA, null]);
    await testPool.query(OUTBOX_INSERT, [tenantA, null]);
    const { rows } = await testPool.query("select id from message_outbox");
    expect(rows).toHaveLength(4);
  });

  it("mensagem nasce pending, com 0 tentativas e payload vazio", async () => {
    const tenantA = await insertTenant("clinica-a");
    await testPool.query(OUTBOX_INSERT, [tenantA, null]);
    const { rows } = await testPool.query("select status, attempts, payload from message_outbox");
    expect(rows[0]).toEqual({ status: "pending", attempts: 0, payload: {} });
  });

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

  it("e-mail de staff é único entre tenants", async () => {
    const tenantA = await insertTenant("clinica-a");
    const tenantB = await insertTenant("clinica-b");

    await testPool.query(
      `insert into staff_users (tenant_id, name, email, password_hash, role)
       values ($1, 'Dono A', 'dono@x.test', 'hash', 'owner')`,
      [tenantA],
    );

    await expect(
      testPool.query(
        `insert into staff_users (tenant_id, name, email, password_hash, role)
         values ($1, 'Dono B', 'dono@x.test', 'hash', 'owner')`,
        [tenantB],
      ),
    ).rejects.toThrow(/unique/);
  });

  it("e-mail de staff com maiúsculas é rejeitado pelo CHECK", async () => {
    const tenantA = await insertTenant("clinica-a");

    await expect(
      testPool.query(
        `insert into staff_users (tenant_id, name, email, password_hash, role)
         values ($1, 'Dono A', 'Dono@x.test', 'hash', 'owner')`,
        [tenantA],
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("sessão não pode apontar para staff de outro tenant", async () => {
    const tenantA = await insertTenant("clinica-a");
    const tenantB = await insertTenant("clinica-b");

    const { rows } = await testPool.query<{ id: string }>(
      `insert into staff_users (tenant_id, name, email, password_hash, role)
       values ($1, 'Dono B', 'dono-b@x.test', 'hash', 'owner') returning id`,
      [tenantB],
    );

    await expect(
      testPool.query(
        `insert into sessions (tenant_id, staff_user_id, token_hash, expires_at)
         values ($1, $2, 'tokenhash', now() + interval '7 days')`,
        [tenantA, rows[0].id],
      ),
    ).rejects.toThrow(/foreign key/);
  });
});
