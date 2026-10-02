import { eq } from "drizzle-orm";
import { decodeJwt, SignJWT } from "jose";
import { beforeEach, describe, expect, it } from "vitest";

import { getTestDb, resetDb } from "../../../test/db";
import { sessions, staffUsers, tenants, type StaffUser, type Tenant } from "../db/schema";
import { tenantScope } from "../db/tenant-scope";

import {
  createSession,
  renewSession,
  revokeSession,
  revokeUserSessions,
  SESSION_TTL_MS,
  validateSession,
} from "./session";

const db = getTestDb();

const META = { ip: "127.0.0.1", userAgent: "vitest" };

let tenant: Tenant;
let staff: StaffUser;

beforeEach(async () => {
  await resetDb();
  [tenant] = await db
    .insert(tenants)
    .values({ slug: "easyglowcare", name: "EasyGlowCare" })
    .returning();
  [staff] = await db
    .insert(staffUsers)
    .values({
      tenantId: tenant.id,
      name: "Ana",
      email: "ana@easyglowcare.com",
      passwordHash: "hash-qualquer",
      role: "owner",
    })
    .returning();
});

describe("createSession / validateSession", () => {
  it("cria e valida a sessão", async () => {
    const { cookieValue } = await createSession(db, staff, META);

    const result = await validateSession(db, cookieValue);

    expect(result?.user.id).toBe(staff.id);
    expect(result?.tenant.id).toBe(tenant.id);
    expect(result?.shouldRenew).toBe(false);
  });

  it("guarda só o hash do token no banco", async () => {
    const { cookieValue } = await createSession(db, staff, META);
    const token = decodeJwt(cookieValue).t as string;

    const rows = await db.select().from(sessions);

    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it("devolve null quando a sessão expirou", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const { cookieValue } = await createSession(db, staff, META, now);

    const afterExpiry = new Date(now.getTime() + SESSION_TTL_MS + 1);
    expect(await validateSession(db, cookieValue, afterExpiry)).toBeNull();
  });

  it("devolve null depois de revogada", async () => {
    const { cookieValue } = await createSession(db, staff, META);
    const session = await validateSession(db, cookieValue);

    await revokeSession(db, session!.sessionId);

    expect(await validateSession(db, cookieValue)).toBeNull();
  });

  it("devolve null quando o usuário está desativado", async () => {
    const { cookieValue } = await createSession(db, staff, META);

    await db.update(staffUsers).set({ isActive: false }).where(eq(staffUsers.id, staff.id));

    expect(await validateSession(db, cookieValue)).toBeNull();
  });

  it.each([["lixo"], [""], [undefined]])("devolve null para cookie inválido (%j)", async (bad) => {
    expect(await validateSession(db, bad)).toBeNull();
  });

  it("devolve null quando a assinatura foi adulterada", async () => {
    const { cookieValue } = await createSession(db, staff, META);
    const [header, payload, signature] = cookieValue.split(".");
    const flippedChar = signature[0] === "a" ? "b" : "a";
    const tamperedSignature = flippedChar + signature.slice(1);
    const tampered = `${header}.${payload}.${tamperedSignature}`;

    expect(await validateSession(db, tampered)).toBeNull();
  });

  it("devolve null quando o cookie foi assinado com outro segredo", async () => {
    const other = await new SignJWT({ t: "x".repeat(43) })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode("outro-segredo-com-mais-de-32-caracteres"));

    expect(await validateSession(db, other)).toBeNull();
  });

  it("sinaliza renovação perto do fim do prazo e renewSession estende a validade", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const { cookieValue } = await createSession(db, staff, META, now);

    const almostExpired = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000);
    const nearExpiry = await validateSession(db, cookieValue, almostExpired);
    expect(nearExpiry?.shouldRenew).toBe(true);

    const newExpiresAt = await renewSession(db, nearExpiry!.sessionId, almostExpired);
    expect(newExpiresAt.getTime()).toBe(almostExpired.getTime() + SESSION_TTL_MS);

    const pastOldExpiry = new Date(now.getTime() + SESSION_TTL_MS + 1);
    expect(await validateSession(db, cookieValue, pastOldExpiry)).not.toBeNull();
  });

  it("reflete o papel atualizado no banco", async () => {
    const { cookieValue } = await createSession(db, staff, META);

    await db.update(staffUsers).set({ role: "reception" }).where(eq(staffUsers.id, staff.id));

    const result = await validateSession(db, cookieValue);
    expect(result?.user.role).toBe("reception");
  });
});

describe("revokeUserSessions", () => {
  it("revoga todas as sessões menos a atual", async () => {
    const s1 = await createSession(db, staff, META);
    const s2 = await createSession(db, staff, META);
    const s3 = await createSession(db, staff, META);
    const current = await validateSession(db, s2.cookieValue);

    const scope = tenantScope(db, tenant.id);
    await revokeUserSessions(scope, staff.id, current!.sessionId);

    expect(await validateSession(db, s1.cookieValue)).toBeNull();
    expect(await validateSession(db, s2.cookieValue)).not.toBeNull();
    expect(await validateSession(db, s3.cookieValue)).toBeNull();
  });

  it("não revoga sessões de outro tenant", async () => {
    const [otherTenant] = await db
      .insert(tenants)
      .values({ slug: "outra-clinica", name: "Outra Clínica" })
      .returning();
    const { cookieValue } = await createSession(db, staff, META);

    const otherScope = tenantScope(db, otherTenant.id);
    await revokeUserSessions(otherScope, staff.id);

    expect(await validateSession(db, cookieValue)).not.toBeNull();
  });
});
