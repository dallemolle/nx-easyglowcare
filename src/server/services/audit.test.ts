import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTestDb, resetDb } from "../../../test/db";
import { auditLog, tenants, type Tenant } from "../db/schema";
import { tenantScope, type TenantScope } from "../db/tenant-scope";

import { AUDIT_ACTIONS, recordAudit, safeRecordAudit } from "./audit";

const db = getTestDb();
const STAFF_ID = "3f2b8c1e-5d4a-4b7e-9a1c-2d6e8f0a1b3c";
const TARGET_ID = "9a1c2d6e-8f0a-4b3c-8f2b-3f2b8c1e5d4a";

let tenantA: Tenant;
let tenantB: Tenant;
let scopeA: TenantScope;

beforeEach(async () => {
  await resetDb();
  [tenantA] = await db.insert(tenants).values({ slug: "clinica-a", name: "Clínica A" }).returning();
  [tenantB] = await db.insert(tenants).values({ slug: "clinica-b", name: "Clínica B" }).returning();
  scopeA = tenantScope(db, tenantA.id);
});

describe("recordAudit", () => {
  it("grava a ação de um staff com a clínica do escopo", async () => {
    await recordAudit(scopeA, {
      actor: { type: "staff", id: STAFF_ID },
      action: "staff.role_changed",
      entity: "staff_user",
      entityId: TARGET_ID,
      metadata: { from: "reception", to: "owner" },
      ip: "203.0.113.7",
    });

    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: tenantA.id,
      actorType: "staff",
      actorId: STAFF_ID,
      action: "staff.role_changed",
      entity: "staff_user",
      entityId: TARGET_ID,
      metadata: { from: "reception", to: "owner" },
      ip: "203.0.113.7",
    });
    expect(rows[0].createdAt).toBeInstanceOf(Date);
    expect(rows.some((row) => row.tenantId === tenantB.id)).toBe(false);
  });

  it("ator system grava actor_id nulo; campos opcionais ficam nulos e metadata vazio", async () => {
    await recordAudit(scopeA, { actor: { type: "system" }, action: "staff.created", entity: "staff_user" });

    const [row] = await db.select().from(auditLog);
    expect(row).toMatchObject({
      actorType: "system",
      actorId: null,
      entityId: null,
      metadata: {},
      ip: null,
    });
  });

  it("a lista de ações é a da spec", () => {
    expect([...AUDIT_ACTIONS]).toEqual([
      "auth.login",
      "auth.logout",
      "auth.password_changed",
      "staff.created",
      "staff.role_changed",
      "staff.deactivated",
      "staff.reactivated",
      "staff.password_reset",
    ]);
  });
});

describe("safeRecordAudit", () => {
  it("grava normalmente quando dá certo", async () => {
    await safeRecordAudit(scopeA, { actor: { type: "system" }, action: "auth.login", entity: "staff_user" });
    expect(await db.select().from(auditLog)).toHaveLength(1);
  });

  it("não propaga erro e loga só o nome e o código", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      ...scopeA,
      insert: () =>
        Promise.reject(
          Object.assign(new Error("Failed query: insert ... params: 203.0.113.7"), {
            cause: { code: "08006" },
          }),
        ),
    } as TenantScope;

    await expect(
      safeRecordAudit(broken, {
        actor: { type: "staff", id: STAFF_ID },
        action: "auth.login",
        entity: "staff_user",
        ip: "203.0.113.7",
      }),
    ).resolves.toBeUndefined();

    const logged = JSON.stringify(spy.mock.calls);
    spy.mockRestore();
    expect(logged).toContain("08006");
    expect(logged).not.toContain("203.0.113.7");
    expect(logged).not.toContain("Failed query");
  });
});
