import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { getTestDb, resetDb } from "../../../test/db";
import { people, personConsents, tenants, type Tenant } from "../db/schema";
import { tenantScope } from "../db/tenant-scope";

import {
  convertLeadToClient,
  createLeadFromSignup,
  findPersonByCpf,
  markPhoneVerified,
} from "./people";

const db = getTestDb();
const CPF = "52998224725";
const PHONE = "11987654321";
const META = { ip: "203.0.113.7", userAgent: "Mozilla/5.0 (teste)" };
const NOW = new Date("2026-10-05T12:00:00.000Z");

const signup = (overrides: Partial<Parameters<typeof createLeadFromSignup>[2]> = {}) => ({
  name: "Maria Silva",
  cpf: CPF,
  phone: PHONE,
  marketing: true,
  termsVersion: "v1",
  origin: { utm_source: "instagram" },
  ...overrides,
});

let tenantA: Tenant;
let tenantB: Tenant;

beforeEach(async () => {
  await resetDb();
  [tenantA] = await db.insert(tenants).values({ slug: "clinica-a", name: "Clínica A" }).returning();
  [tenantB] = await db.insert(tenants).values({ slug: "clinica-b", name: "Clínica B" }).returning();
});

describe("createLeadFromSignup", () => {
  it("cria o lead com origem, telefone verificado e os dois consentimentos", async () => {
    const result = await createLeadFromSignup(
      db,
      tenantA.id,
      signup({ origin: { utm_source: "instagram", utm_campaign: "verao" } }),
      META,
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.person).toMatchObject({
      tenantId: tenantA.id,
      status: "lead",
      name: "Maria Silva",
      cpf: CPF,
      phone: PHONE,
      source: "instagram",
      utmSource: "instagram",
      utmCampaign: "verao",
      utmMedium: null,
      ref: null,
      convertedAt: null,
    });
    expect(result.person.phoneVerifiedAt).toEqual(NOW);

    const consents = await db.select().from(personConsents).where(eq(personConsents.personId, result.person.id));
    expect(consents).toHaveLength(2);
    const terms = consents.find((c) => c.kind === "terms");
    const marketing = consents.find((c) => c.kind === "marketing");
    expect(terms).toMatchObject({ tenantId: tenantA.id, granted: true, version: "v1", ip: META.ip, userAgent: META.userAgent });
    expect(marketing).toMatchObject({ tenantId: tenantA.id, granted: true, version: "v1", ip: META.ip, userAgent: META.userAgent });
  });

  it("grava marketing = false quando a pessoa não aceitou", async () => {
    const result = await createLeadFromSignup(db, tenantA.id, signup({ marketing: false }), META, NOW);
    expect(result.ok).toBe(true);
    const consents = await db.select().from(personConsents);
    expect(consents.find((c) => c.kind === "marketing")?.granted).toBe(false);
    expect(consents.find((c) => c.kind === "terms")?.granted).toBe(true);
  });

  it("CPF já existente devolve cpf-taken e não deixa linhas novas", async () => {
    const first = await createLeadFromSignup(db, tenantA.id, signup(), META, NOW);
    expect(first.ok).toBe(true);

    const second = await createLeadFromSignup(db, tenantA.id, signup({ name: "Outra Pessoa" }), META, NOW);
    expect(second).toEqual({ ok: false, reason: "cpf-taken" });

    expect(await db.select().from(people)).toHaveLength(1);
    expect(await db.select().from(personConsents)).toHaveLength(2);
  });

  it("o mesmo CPF em outra clínica é permitido", async () => {
    await createLeadFromSignup(db, tenantA.id, signup(), META, NOW);
    const other = await createLeadFromSignup(db, tenantB.id, signup(), META, NOW);
    expect(other.ok).toBe(true);
  });
});

describe("findPersonByCpf", () => {
  it("encontra a pessoa da clínica e não a de outra clínica", async () => {
    await createLeadFromSignup(db, tenantA.id, signup(), META, NOW);

    expect((await findPersonByCpf(tenantScope(db, tenantA.id), CPF))?.cpf).toBe(CPF);
    expect(await findPersonByCpf(tenantScope(db, tenantB.id), CPF)).toBeNull();
  });
});

describe("markPhoneVerified", () => {
  it("grava a data de verificação do telefone", async () => {
    const [person] = await tenantScope(db, tenantA.id).insert(people, {
      name: "Ana",
      cpf: CPF,
      phone: PHONE,
      source: "direct",
    });
    expect(person.phoneVerifiedAt).toBeNull();

    await markPhoneVerified(tenantScope(db, tenantA.id), person.id, NOW);

    const [row] = await db.select().from(people).where(eq(people.id, person.id));
    expect(row.phoneVerifiedAt).toEqual(NOW);
  });
});

describe("convertLeadToClient", () => {
  async function newLead() {
    const result = await createLeadFromSignup(db, tenantA.id, signup(), META, NOW);
    if (!result.ok) throw new Error("setup");
    return result.person;
  }

  it("converte o lead em cliente com data e motivo", async () => {
    const lead = await newLead();
    const converted = await convertLeadToClient(tenantScope(db, tenantA.id), lead.id, "appointment", NOW);

    expect(converted).toMatchObject({ id: lead.id, status: "client", conversionReason: "appointment" });
    expect(converted?.convertedAt).toEqual(NOW);
  });

  it("a segunda chamada não altera a data nem o motivo", async () => {
    const lead = await newLead();
    const scope = tenantScope(db, tenantA.id);
    await convertLeadToClient(scope, lead.id, "appointment", NOW);

    const again = await convertLeadToClient(scope, lead.id, "payment", new Date("2026-11-01T00:00:00.000Z"));

    expect(again).toMatchObject({ status: "client", conversionReason: "appointment" });
    expect(again?.convertedAt).toEqual(NOW);
  });

  it("pessoa de outra clínica devolve null e não é alterada", async () => {
    const lead = await newLead();
    expect(await convertLeadToClient(tenantScope(db, tenantB.id), lead.id, "payment", NOW)).toBeNull();

    const [row] = await db.select().from(people).where(eq(people.id, lead.id));
    expect(row.status).toBe("lead");
  });
});
