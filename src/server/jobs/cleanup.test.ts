import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getTestDb, resetDb } from "../../../test/db";
import {
  auditLog,
  loginAttempts,
  messageOutbox,
  otpCodes,
  people,
  personSessions,
  sessions,
  staffUsers,
  tenants,
  type Person,
  type StaffUser,
  type Tenant,
} from "../db/schema";

import { cleanupOldData } from "./cleanup";

const db = getTestDb();
const NOW = new Date("2026-10-02T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number, extraMs = 0) => new Date(NOW.getTime() - days * DAY - extraMs);

let tenant: Tenant;
let staff: StaffUser;
let person: Person;
let info: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  await resetDb();
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  [tenant] = await db.insert(tenants).values({ slug: "clinica-a", name: "Clínica A" }).returning();
  [staff] = await db
    .insert(staffUsers)
    .values({ tenantId: tenant.id, name: "Ana", email: "ana@clinica-a.test", passwordHash: "hash", role: "owner" })
    .returning();
  [person] = await db
    .insert(people)
    .values({ tenantId: tenant.id, name: "Maria", cpf: "52998224725", phone: "11987654321", source: "direct" })
    .returning();
});

afterEach(() => {
  info.mockRestore();
});

function session(tokenHash: string, expiresAt: Date, revokedAt: Date | null = null) {
  return { tenantId: tenant.id, staffUserId: staff.id, tokenHash, expiresAt, revokedAt };
}

function message(template: string, status: "pending" | "sent" | "failed", sentAt: Date | null) {
  return {
    tenantId: tenant.id,
    channel: "sms" as const,
    template,
    recipient: "11987651234",
    sendAt: daysAgo(200),
    status,
    sentAt,
  };
}

function otpCode(purpose: "signup" | "login", createdAt: Date, expiresAt: Date | null = null) {
  return {
    tenantId: tenant.id,
    purpose,
    personId: purpose === "login" ? person.id : undefined,
    phone: "11987654321",
    channel: "whatsapp" as const,
    codeHash: "hash",
    expiresAt: expiresAt ?? daysAgo(200),
    createdAt,
    pendingSignup: purpose === "signup" ? { name: "Maria", cpf: "52998224725", phone: "11987654321", marketing: false, termsVersion: "v1", origin: {} } : undefined,
  };
}

function personSession(tokenHash: string, expiresAt: Date, revokedAt: Date | null = null) {
  return { tenantId: tenant.id, personId: person.id, tokenHash, expiresAt, revokedAt };
}

describe("cleanupOldData", () => {
  it("apaga login_attempts com mais de 30 dias, com ou sem clínica", async () => {
    await db.insert(loginAttempts).values([
      { email: "velha@x.test", ip: "1.1.1.1", succeeded: false, createdAt: daysAgo(30, 1) },
      { email: "velha-b@x.test", ip: "1.1.1.1", succeeded: true, createdAt: daysAgo(90), tenantId: tenant.id },
      { email: "no-limite@x.test", ip: "1.1.1.1", succeeded: false, createdAt: daysAgo(30) },
      { email: "nova@x.test", ip: "1.1.1.1", succeeded: false, createdAt: daysAgo(1) },
    ]);

    const result = await cleanupOldData(db, NOW);

    expect(result.loginAttempts).toBe(2);
    const left = await db.select().from(loginAttempts);
    expect(left.map((row) => row.email).sort()).toEqual(["no-limite@x.test", "nova@x.test"]);
  });

  it("apaga sessões expiradas ou revogadas há mais de 30 dias e mantém as demais", async () => {
    await db.insert(sessions).values([
      session("expirada-velha", daysAgo(30, 1)),
      session("revogada-velha", new Date(NOW.getTime() + DAY), daysAgo(30, 1)),
      session("expirada-recente", daysAgo(29)),
      session("revogada-recente", new Date(NOW.getTime() + DAY), daysAgo(29)),
      session("ativa", new Date(NOW.getTime() + DAY)),
    ]);

    const result = await cleanupOldData(db, NOW);

    expect(result.sessions).toBe(2);
    const left = await db.select().from(sessions);
    expect(left.map((row) => row.tokenHash).sort()).toEqual(["ativa", "expirada-recente", "revogada-recente"]);
  });

  it("apaga só mensagens sent com mais de 90 dias; pending e failed ficam", async () => {
    await db.insert(messageOutbox).values([
      message("sent-velha", "sent", daysAgo(90, 1)),
      message("sent-no-limite", "sent", daysAgo(90)),
      message("sent-recente", "sent", daysAgo(10)),
      // Com sent_at antigo de propósito: só o filtro de status impede que seja apagada.
      message("failed-velha", "failed", daysAgo(200)),
      message("pending-velha", "pending", null),
    ]);

    const result = await cleanupOldData(db, NOW);

    expect(result.sentMessages).toBe(1);
    const left = await db.select().from(messageOutbox);
    expect(left.map((row) => row.template).sort()).toEqual([
      "failed-velha",
      "pending-velha",
      "sent-no-limite",
      "sent-recente",
    ]);
  });

  it("nunca apaga o audit_log", async () => {
    await db.insert(auditLog).values({
      tenantId: tenant.id,
      actorType: "system",
      action: "staff.created",
      entity: "staff_user",
      createdAt: daysAgo(3650),
    });

    await cleanupOldData(db, NOW);

    expect(await db.select().from(auditLog)).toHaveLength(1);
  });

  it("apaga otp_codes com mais de 24 horas e mantém os recentes", async () => {
    const OTP_DAY_MS = 24 * 60 * 60 * 1000;
    const otpCutoff = new Date(NOW.getTime() - OTP_DAY_MS);

    await db.insert(otpCodes).values([
      { ...otpCode("signup", daysAgo(1, 1)), createdAt: new Date(otpCutoff.getTime() - 1) },
      { ...otpCode("login", daysAgo(1, 1), new Date(NOW.getTime() + 300_000)), createdAt: new Date(otpCutoff.getTime() + 1) },
      { ...otpCode("signup", daysAgo(0.5)), createdAt: new Date(otpCutoff.getTime() + DAY / 2) },
    ]);

    const result = await cleanupOldData(db, NOW);

    expect(result.otpCodes).toBe(1);
    const left = await db.select().from(otpCodes);
    expect(left).toHaveLength(2);
  });

  it("apaga person_sessions expiradas ou revogadas há mais de 30 dias", async () => {
    await db.insert(personSessions).values([
      personSession("expirada-velha", daysAgo(30, 1)),
      personSession("revogada-velha", new Date(NOW.getTime() + DAY), daysAgo(30, 1)),
      personSession("expirada-recente", daysAgo(29)),
      personSession("revogada-recente", new Date(NOW.getTime() + DAY), daysAgo(29)),
      personSession("ativa", new Date(NOW.getTime() + DAY)),
    ]);

    const result = await cleanupOldData(db, NOW);

    expect(result.personSessions).toBe(2);
    const left = await db.select().from(personSessions);
    expect(left.map((row) => row.tokenHash).sort()).toEqual(["ativa", "expirada-recente", "revogada-recente"]);
  });

  it("sem nada para apagar devolve zeros e loga só as contagens", async () => {
    expect(await cleanupOldData(db, NOW)).toEqual({ loginAttempts: 0, sessions: 0, personSessions: 0, otpCodes: 0, sentMessages: 0 });
    expect(JSON.stringify(info.mock.calls)).toContain("login_attempts=0");
  });
});
