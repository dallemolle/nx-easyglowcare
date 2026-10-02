import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  headers: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      request.cookies.has(name) ? { name, value: request.cookies.get(name) } : undefined,
    set: (name: string, value: string) => void request.cookies.set(name, value),
    delete: (name: string) => void request.cookies.delete(name),
  }),
  headers: async () => ({ get: (name: string) => request.headers.get(name.toLowerCase()) ?? null }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/server/db/client", async () => {
  const { getTestDb } = await import("../../../test/db");
  return { db: getTestDb() };
});

import { getTestDb, resetDb } from "../../../test/db";
import { auditLog, staffUsers, tenants, type StaffUser, type Tenant } from "../db/schema";
import { tenantScope, type TenantScope } from "../db/tenant-scope";

import { recordStaffAudit, signIn, signOut } from "./current";
import { hashPassword } from "./password";

const db = getTestDb();
const PASSWORD = "senha-correta-1";
const TARGET_ID = "9a1c2d6e-8f0a-4b3c-8f2b-3f2b8c1e5d4a";

let passwordHash: string;
let tenant: Tenant;
let owner: StaffUser;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await resetDb();
  request.cookies.clear();
  request.headers.clear();
  request.headers.set("x-forwarded-for", "203.0.113.7, 10.0.0.1");
  request.headers.set("user-agent", "vitest");
  [tenant] = await db.insert(tenants).values({ slug: "clinica-a", name: "Clínica A" }).returning();
  [owner] = await db
    .insert(staffUsers)
    .values({ tenantId: tenant.id, name: "Ana Dona", email: "ana@clinica-a.test", passwordHash, role: "owner" })
    .returning();
});

describe("auditoria do login e do logout", () => {
  it("login com sucesso grava auth.login com ator, entidade, clínica e IP", async () => {
    const result = await signIn({ email: owner.email, password: PASSWORD });

    expect(result).toEqual({ ok: true, mustChangePassword: false });
    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: tenant.id,
      actorType: "staff",
      actorId: owner.id,
      action: "auth.login",
      entity: "staff_user",
      entityId: owner.id,
      metadata: {},
      ip: "203.0.113.7",
    });
  });

  it("login que falha não grava no audit_log", async () => {
    const result = await signIn({ email: owner.email, password: "senha-errada-1" });

    expect(result.ok).toBe(false);
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it("logout grava auth.logout e apaga o cookie", async () => {
    await signIn({ email: owner.email, password: PASSWORD });

    await signOut();

    const rows = await db.select().from(auditLog);
    expect(rows.map((row) => row.action).sort()).toEqual(["auth.login", "auth.logout"]);
    const logout = rows.find((row) => row.action === "auth.logout");
    expect(logout).toMatchObject({ actorId: owner.id, entityId: owner.id, ip: "203.0.113.7" });
    expect(request.cookies.size).toBe(0);
  });

  it("logout sem sessão não grava nada", async () => {
    await signOut();
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });
});

describe("recordStaffAudit", () => {
  it("preenche o ator e o IP a partir do staff e da request", async () => {
    await recordStaffAudit(
      { scope: tenantScope(db, tenant.id), user: owner },
      { action: "staff.created", entity: "staff_user", entityId: TARGET_ID, metadata: { role: "reception" } },
    );

    const [row] = await db.select().from(auditLog);
    expect(row).toMatchObject({
      tenantId: tenant.id,
      actorType: "staff",
      actorId: owner.id,
      action: "staff.created",
      entityId: TARGET_ID,
      metadata: { role: "reception" },
      ip: "203.0.113.7",
    });
  });

  it("nunca lança, mesmo se a gravação falhar", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      ...tenantScope(db, tenant.id),
      insert: () => Promise.reject(new Error("Failed query: params: segredo")),
    } as TenantScope;

    await expect(
      recordStaffAudit({ scope: broken, user: owner }, { action: "staff.created", entity: "staff_user" }),
    ).resolves.toBeUndefined();

    expect(JSON.stringify(spy.mock.calls)).not.toContain("segredo");
    spy.mockRestore();
  });
});
