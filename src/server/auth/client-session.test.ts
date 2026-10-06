import { decodeJwt, SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTestDb, resetDb } from "../../../test/db";
import { people, personSessions, staffUsers, tenants, type Person, type StaffUser, type Tenant } from "../db/schema";

import {
  CLIENT_SESSION_TTL_MS,
  createClientSession,
  renewClientSession,
  revokeClientSession,
  validateClientSession,
} from "./client-session";
import { createSession, validateSession } from "./session";

const db = getTestDb();
const META = { ip: "127.0.0.1", userAgent: "vitest" };
const DAY = 24 * 60 * 60 * 1000;

let tenant: Tenant;
let otherTenant: Tenant;
let person: Person;

beforeEach(async () => {
  await resetDb();
  [tenant] = await db.insert(tenants).values({ slug: "easyglowcare", name: "EasyGlowCare" }).returning();
  [otherTenant] = await db.insert(tenants).values({ slug: "outra-clinica", name: "Outra Clínica" }).returning();
  [person] = await db
    .insert(people)
    .values({
      tenantId: tenant.id,
      name: "Maria",
      cpf: "52998224725",
      phone: "11987654321",
      source: "direct",
    })
    .returning();
});

describe("createClientSession / validateClientSession", () => {
  it("cria e valida a sessão", async () => {
    const { cookieValue } = await createClientSession(db, person, META);

    const result = await validateClientSession(db, tenant.id, cookieValue);

    expect(result?.person.id).toBe(person.id);
    expect(result?.tenant.id).toBe(tenant.id);
    expect(result?.shouldRenew).toBe(false);
  });

  it("guarda só o hash do token no banco", async () => {
    const { cookieValue } = await createClientSession(db, person, META);
    const token = decodeJwt(cookieValue).t as string;

    const rows = await db.select().from(personSessions);

    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it("devolve null para a sessão de outra clínica", async () => {
    const { cookieValue } = await createClientSession(db, person, META);

    expect(await validateClientSession(db, otherTenant.id, cookieValue)).toBeNull();
  });

  it("devolve null quando a sessão expirou", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const { cookieValue } = await createClientSession(db, person, META, now);

    const afterExpiry = new Date(now.getTime() + CLIENT_SESSION_TTL_MS + 1);
    expect(await validateClientSession(db, tenant.id, cookieValue, afterExpiry)).toBeNull();
  });

  it("devolve null depois de revogada", async () => {
    const { cookieValue } = await createClientSession(db, person, META);
    const session = await validateClientSession(db, tenant.id, cookieValue);

    await revokeClientSession(db, session!.sessionId);

    expect(await validateClientSession(db, tenant.id, cookieValue)).toBeNull();
  });

  it.each([["lixo"], [""], [undefined]])("devolve null para cookie inválido (%j)", async (bad) => {
    expect(await validateClientSession(db, tenant.id, bad)).toBeNull();
  });

  it("devolve null quando o cookie foi assinado com outro segredo", async () => {
    const { cookieValue } = await createClientSession(db, person, META);
    const token = decodeJwt(cookieValue).t as string;

    const other = await new SignJWT({ t: token })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode("outro-segredo-com-mais-de-32-caracteres"));

    expect(await validateClientSession(db, tenant.id, other)).toBeNull();
  });

  it("propaga erro de configuração (SESSION_SECRET inválido) em vez de devolver null", async () => {
    const { cookieValue } = await createClientSession(db, person, META);

    vi.stubEnv("SESSION_SECRET", "curta");
    try {
      await expect(validateClientSession(db, tenant.id, cookieValue)).rejects.toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("renovação", () => {
  it("shouldRenew só quando faltam menos de 7 dias; renewClientSession empurra para +30 dias", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const { cookieValue } = await createClientSession(db, person, META, now);

    const eightDaysLeft = new Date(now.getTime() + 22 * DAY);
    expect((await validateClientSession(db, tenant.id, cookieValue, eightDaysLeft))?.shouldRenew).toBe(false);

    const sixDaysLeft = new Date(now.getTime() + 24 * DAY);
    const near = await validateClientSession(db, tenant.id, cookieValue, sixDaysLeft);
    expect(near?.shouldRenew).toBe(true);

    const newExpiresAt = await renewClientSession(db, near!.sessionId, sixDaysLeft);
    expect(newExpiresAt.getTime()).toBe(sixDaysLeft.getTime() + CLIENT_SESSION_TTL_MS);

    const pastOldExpiry = new Date(now.getTime() + CLIENT_SESSION_TTL_MS + 1);
    expect(await validateClientSession(db, tenant.id, cookieValue, pastOldExpiry)).not.toBeNull();
  });
});

describe("isolamento entre sessão de equipe e de cliente", () => {
  it("um cookie de equipe não valida como cliente", async () => {
    const [staff]: StaffUser[] = await db
      .insert(staffUsers)
      .values({
        tenantId: tenant.id,
        name: "Ana",
        email: "ana@easyglowcare.com",
        passwordHash: "hash-qualquer",
        role: "owner",
      })
      .returning();
    const { cookieValue } = await createSession(db, staff, META);

    expect(await validateSession(db, cookieValue)).not.toBeNull();
    expect(await validateClientSession(db, tenant.id, cookieValue)).toBeNull();
  });

  it("um cookie de cliente não valida em validateSession", async () => {
    const { cookieValue } = await createClientSession(db, person, META);

    expect(await validateClientSession(db, tenant.id, cookieValue)).not.toBeNull();
    expect(await validateSession(db, cookieValue)).toBeNull();
  });
});
