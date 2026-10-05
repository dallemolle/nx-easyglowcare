import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { getTestDb, resetDb } from "../../../test/db";
import { otpCodes, tenants, type Tenant } from "../db/schema";

import {
  codeMatches,
  generateCode,
  hashCode,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  reserveChallenge,
  TEST_PHONE_CODE,
  type ChallengeInput,
} from "./otp";

const db = getTestDb();

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const T0 = new Date("2026-10-05T12:00:00.000Z");

let tenant: Tenant;
let otherTenant: Tenant;

beforeEach(async () => {
  await resetDb();
  [tenant] = await db.insert(tenants).values({ slug: "easyglowcare", name: "EasyGlowCare" }).returning();
  [otherTenant] = await db.insert(tenants).values({ slug: "outra-clinica", name: "Outra Clínica" }).returning();
});

function input(overrides: Partial<ChallengeInput> = {}): ChallengeInput {
  return {
    tenantId: tenant.id,
    purpose: "signup",
    personId: null,
    phone: "11987654321",
    channel: "whatsapp",
    pendingSignup: {
      name: "Maria",
      cpf: "52998224725",
      phone: "11987654321",
      marketing: false,
      termsVersion: "v1",
      origin: {},
    },
    ip: "203.0.113.7",
    userAgent: "vitest",
    ...overrides,
  };
}

async function rowCount(): Promise<number> {
  return (await db.select().from(otpCodes)).length;
}

describe("constantes", () => {
  it("usa os valores fixos", () => {
    expect(OTP_TTL_MS).toBe(5 * MINUTE);
    expect(OTP_MAX_ATTEMPTS).toBe(5);
    expect(RESEND_COOLDOWN_MS).toBe(60 * 1000);
    expect(TEST_PHONE_CODE).toBe("000000");
  });
});

describe("generateCode", () => {
  it("sempre devolve 6 dígitos", () => {
    for (let i = 0; i < 1000; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });
});

describe("hashCode / codeMatches", () => {
  it("muda com o challengeId", () => {
    expect(hashCode("a", "123456")).not.toBe(hashCode("b", "123456"));
  });

  it("aceita o código certo e recusa o errado", () => {
    const hash = hashCode("a", "123456");
    expect(codeMatches("a", "123456", hash)).toBe(true);
    expect(codeMatches("a", "654321", hash)).toBe(false);
    expect(codeMatches("b", "123456", hash)).toBe(false);
  });

  it("recusa hash de tamanho diferente sem lançar", () => {
    expect(codeMatches("a", "123456", "abc")).toBe(false);
    expect(codeMatches("a", "123456", "")).toBe(false);
  });
});

describe("reserveChallenge", () => {
  it("grava o hash (sem o código) e a validade de 5 minutos", async () => {
    const result = await reserveChallenge(db, input(), "123456", T0);
    if (result.blocked) throw new Error("não deveria bloquear");

    const { challenge } = result;
    expect(challenge.codeHash).not.toContain("123456");
    expect(challenge.codeHash).toBe(hashCode(challenge.id, "123456"));
    expect(challenge.expiresAt.getTime()).toBe(T0.getTime() + OTP_TTL_MS);
    expect(challenge.createdAt.getTime()).toBe(T0.getTime());
    expect(challenge.attempts).toBe(0);
  });

  it("por telefone: 3 em 15 min passam, a 4ª bloqueia e não deixa linha", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await reserveChallenge(db, input({ ip: `198.51.100.${i}` }), "123456", new Date(T0.getTime() + i * MINUTE));
      expect(r.blocked).toBe(false);
    }

    const fourth = await reserveChallenge(db, input({ ip: "198.51.100.9" }), "123456", new Date(T0.getTime() + 4 * MINUTE));

    expect(fourth).toEqual({ blocked: true });
    expect(await rowCount()).toBe(3);
  });

  it("por telefone: 15 min depois passa de novo", async () => {
    for (let i = 0; i < 3; i++) {
      await reserveChallenge(db, input({ ip: `198.51.100.${i}` }), "123456", T0);
    }

    const later = await reserveChallenge(db, input({ ip: "198.51.100.9" }), "123456", new Date(T0.getTime() + 15 * MINUTE));

    expect(later.blocked).toBe(false);
  });

  it("por telefone: 10 em 24 h bloqueiam a 11ª", async () => {
    // Espaçadas de 20 min: nunca mais de 1 por janela de 15 min.
    for (let i = 0; i < 10; i++) {
      const r = await reserveChallenge(db, input(), "123456", new Date(T0.getTime() + i * 20 * MINUTE));
      expect(r.blocked).toBe(false);
    }

    const eleventh = await reserveChallenge(db, input(), "123456", new Date(T0.getTime() + 10 * 20 * MINUTE));

    expect(eleventh).toEqual({ blocked: true });
    expect(await rowCount()).toBe(10);

    // Passadas 24 h da primeira, volta a passar.
    const later = await reserveChallenge(db, input(), "123456", new Date(T0.getTime() + 24 * HOUR + MINUTE));
    expect(later.blocked).toBe(false);
  });

  it("por IP: 10 passam e a 11ª bloqueia (telefones diferentes)", async () => {
    for (let i = 0; i < 10; i++) {
      const phone = `1198765${String(1000 + i)}`;
      const r = await reserveChallenge(db, input({ phone }), "123456", T0);
      expect(r.blocked).toBe(false);
    }

    const eleventh = await reserveChallenge(db, input({ phone: "11911112222" }), "123456", T0);

    expect(eleventh).toEqual({ blocked: true });
    expect(await rowCount()).toBe(10);
  });

  it("conta entre clínicas (mesmo telefone em duas clínicas)", async () => {
    for (let i = 0; i < 2; i++) await reserveChallenge(db, input({ ip: `198.51.100.${i}` }), "123456", T0);
    await reserveChallenge(db, input({ tenantId: otherTenant.id, ip: "198.51.100.5" }), "123456", T0);

    const fourth = await reserveChallenge(db, input({ ip: "198.51.100.9" }), "123456", T0);

    expect(fourth).toEqual({ blocked: true });
  });

  it("concorrência: 6 reservas simultâneas para o mesmo telefone deixam no máximo 3", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        reserveChallenge(db, input({ ip: `198.51.100.${i}` }), "123456", T0),
      ),
    );

    const allowed = results.filter((r) => !r.blocked);
    expect(allowed.length).toBeLessThanOrEqual(3);
    expect(await rowCount()).toBe(allowed.length);
    const rows = await db.select().from(otpCodes).where(eq(otpCodes.phone, "11987654321"));
    expect(rows.length).toBeLessThanOrEqual(3);
  });
});
