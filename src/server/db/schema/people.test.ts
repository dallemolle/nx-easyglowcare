import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { getTestDb, resetDb } from "../../../../test/db";
import { isUniqueViolation } from "../../errors";

import { otpCodes, people, personConsents, personSessions, tenants, type Person, type Tenant } from "./index";

const db = getTestDb();

const CPF = "52998224725";
const PHONE = "11987654321";

let tenant: Tenant;
let other: Tenant;

function pgCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === "string") return direct;
  const cause = (error as { cause?: unknown }).cause;
  return cause && typeof cause === "object" ? ((cause as { code?: string }).code ?? undefined) : undefined;
}

async function rejection(promise: PromiseLike<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("esperava uma rejeição");
}

const CHECK_VIOLATION = "23514";

function newPerson(overrides: Partial<typeof people.$inferInsert> = {}) {
  return { tenantId: tenant.id, name: "Maria", cpf: CPF, phone: PHONE, source: "direct" as const, ...overrides };
}

const PENDING = {
  name: "Maria",
  cpf: CPF,
  phone: PHONE,
  marketing: false,
  termsVersion: "v1",
  origin: {},
};

function newOtp(overrides: Partial<typeof otpCodes.$inferInsert> = {}) {
  return {
    tenantId: tenant.id,
    purpose: "signup" as const,
    phone: PHONE,
    channel: "whatsapp" as const,
    codeHash: "hash",
    expiresAt: new Date(Date.now() + 300_000),
    pendingSignup: PENDING,
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDb();
  [tenant, other] = await db
    .insert(tenants)
    .values([
      { slug: "easyglowcare", name: "EasyGlowCare" },
      { slug: "outra", name: "Outra" },
    ])
    .returning();
});

describe("people", () => {
  it("insere uma pessoa válida como lead", async () => {
    const [person] = await db.insert(people).values(newPerson()).returning();

    expect(person.status).toBe("lead");
    expect(person.cpf).toBe(CPF);
  });

  it("recusa o mesmo CPF na mesma clínica", async () => {
    await db.insert(people).values(newPerson());

    const error = await rejection(db.insert(people).values(newPerson({ phone: "11912345678" })));

    expect(isUniqueViolation(error)).toBe(true);
  });

  it("aceita o mesmo CPF em outra clínica", async () => {
    await db.insert(people).values(newPerson());

    await expect(db.insert(people).values(newPerson({ tenantId: other.id }))).resolves.toBeDefined();
  });

  it("recusa CPF com 10 dígitos", async () => {
    const error = await rejection(db.insert(people).values(newPerson({ cpf: "5299822472" })));

    expect(pgCode(error)).toBe(CHECK_VIOLATION);
  });

  it("recusa celular com 10 dígitos", async () => {
    const error = await rejection(db.insert(people).values(newPerson({ phone: "1187654321" })));

    expect(pgCode(error)).toBe(CHECK_VIOLATION);
  });

  it("recusa status client sem converted_at", async () => {
    const error = await rejection(
      db.insert(people).values(newPerson({ status: "client", conversionReason: "payment" })),
    );

    expect(pgCode(error)).toBe(CHECK_VIOLATION);
  });

  it("recusa status client sem conversion_reason", async () => {
    const error = await rejection(
      db.insert(people).values(newPerson({ status: "client", convertedAt: new Date() })),
    );

    expect(pgCode(error)).toBe(CHECK_VIOLATION);
  });

  it("aceita status client com conversão completa", async () => {
    await expect(
      db
        .insert(people)
        .values(newPerson({ status: "client", convertedAt: new Date(), conversionReason: "appointment" })),
    ).resolves.toBeDefined();
  });
});

describe("otp_codes", () => {
  let person: Person;

  beforeEach(async () => {
    [person] = await db.insert(people).values(newPerson()).returning();
  });

  it("aceita desafio de cadastro e de login válidos", async () => {
    await db.insert(otpCodes).values(newOtp());
    await db
      .insert(otpCodes)
      .values(newOtp({ purpose: "login", personId: person.id, pendingSignup: null, channel: "sms" }));

    const rows = await db.select().from(otpCodes);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.attempts === 0)).toBe(true);
  });

  it("recusa login sem person_id", async () => {
    const error = await rejection(db.insert(otpCodes).values(newOtp({ purpose: "login", pendingSignup: null })));

    expect(pgCode(error)).toBe(CHECK_VIOLATION);
  });

  it("recusa signup com person_id", async () => {
    const error = await rejection(db.insert(otpCodes).values(newOtp({ personId: person.id })));

    expect(pgCode(error)).toBe(CHECK_VIOLATION);
  });

  it("recusa signup sem pending_signup", async () => {
    const error = await rejection(db.insert(otpCodes).values(newOtp({ pendingSignup: null })));

    expect(pgCode(error)).toBe(CHECK_VIOLATION);
  });

  it("recusa login com pending_signup", async () => {
    const error = await rejection(
      db.insert(otpCodes).values(newOtp({ purpose: "login", personId: person.id })),
    );

    expect(pgCode(error)).toBe(CHECK_VIOLATION);
  });

  it("recusa o canal email", async () => {
    const error = await rejection(db.insert(otpCodes).values(newOtp({ channel: "email" })));

    expect(pgCode(error)).toBe(CHECK_VIOLATION);
  });

  it("recusa person_id de outra clínica", async () => {
    const error = await rejection(
      db
        .insert(otpCodes)
        .values(newOtp({ tenantId: other.id, purpose: "login", personId: person.id, pendingSignup: null })),
    );

    expect(pgCode(error)).toBe("23503");
  });
});

describe("person_sessions", () => {
  it("recusa token_hash repetido", async () => {
    const [person] = await db.insert(people).values(newPerson()).returning();
    const row = {
      tenantId: tenant.id,
      personId: person.id,
      tokenHash: "mesmo",
      expiresAt: new Date(Date.now() + 1000),
    };
    await db.insert(personSessions).values(row);

    const error = await rejection(db.insert(personSessions).values(row));

    expect(isUniqueViolation(error)).toBe(true);
  });
});

describe("apagar a pessoa", () => {
  it("apaga consentimentos, desafios de login e sessões", async () => {
    const [person] = await db.insert(people).values(newPerson()).returning();
    await db.insert(personConsents).values({
      tenantId: tenant.id,
      personId: person.id,
      kind: "terms",
      version: "v1",
      granted: true,
    });
    await db
      .insert(otpCodes)
      .values(newOtp({ purpose: "login", personId: person.id, pendingSignup: null }));
    await db.insert(personSessions).values({
      tenantId: tenant.id,
      personId: person.id,
      tokenHash: "h",
      expiresAt: new Date(Date.now() + 1000),
    });

    await db.delete(people).where(eq(people.id, person.id));

    expect(await db.select().from(personConsents)).toHaveLength(0);
    expect(await db.select().from(otpCodes)).toHaveLength(0);
    expect(await db.select().from(personSessions)).toHaveLength(0);
  });
});
