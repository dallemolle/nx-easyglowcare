import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getTestDb, resetDb } from "../../../test/db";
import { loginAttempts, sessions, staffUsers, tenants, type StaffUser, type Tenant } from "../db/schema";

import { hashPassword } from "./password";
import { validateSession } from "./session";

// Spia nas funções reais de ./password (mantém o comportamento real), para os testes
// que verificam QUANDO `verifyPassword` é chamado — isso é o que garante, de fato, a
// defesa contra timing (hash falso para e-mail inexistente) e que a senha nunca é
// verificada quando a tentativa já está bloqueada.
vi.mock("./password", { spy: true });

import { DUMMY_PASSWORD_HASH, verifyPassword } from "./password";

import { login } from "./login";

const db = getTestDb();
const verifyPasswordSpy = vi.mocked(verifyPassword);

const META = { ip: "203.0.113.7", userAgent: "vitest" };
const CORRECT_PASSWORD = "senha-correta-1";
const WRONG_ERROR = { ok: false, error: "E-mail ou senha incorretos." };
const BLOCKED_ERROR = { ok: false, error: "Muitas tentativas. Tente novamente em alguns minutos." };

let tenant: Tenant;
let activeStaff: StaffUser;
let deactivatedStaff: StaffUser;
let correctPasswordHash: string;

beforeAll(async () => {
  correctPasswordHash = await hashPassword(CORRECT_PASSWORD);
});

beforeEach(async () => {
  verifyPasswordSpy.mockClear();
  await resetDb();
  [tenant] = await db
    .insert(tenants)
    .values({ slug: "easyglowcare", name: "EasyGlowCare" })
    .returning();
  [activeStaff] = await db
    .insert(staffUsers)
    .values({
      tenantId: tenant.id,
      name: "Dona Ana",
      email: "dono@clinica.test",
      passwordHash: correctPasswordHash,
      role: "owner",
    })
    .returning();
  [deactivatedStaff] = await db
    .insert(staffUsers)
    .values({
      tenantId: tenant.id,
      name: "Ex-Funcionária",
      email: "ex@clinica.test",
      passwordHash: correctPasswordHash,
      role: "reception",
      isActive: false,
    })
    .returning();
});

async function countSessions(): Promise<number> {
  return (await db.select().from(sessions)).length;
}

async function countAttempts(email: string): Promise<number> {
  return (await db.select().from(loginAttempts).where(eq(loginAttempts.email, email))).length;
}

describe("login", () => {
  it("e-mail gigante: mensagem genérica, sem lançar e sem gravar tentativa", async () => {
    const hugeEmail = `${"a".repeat(4993)}@x.test`;
    expect(hugeEmail).toHaveLength(5000);

    const result = await login(db, { email: hugeEmail, password: CORRECT_PASSWORD }, META);

    expect(result).toEqual(WRONG_ERROR);
    expect(await db.select().from(loginAttempts)).toHaveLength(0);
  });

  it("sucesso: cria sessão válida, zera mustChangePassword, grava last_login_at e registra tentativa", async () => {
    const result = await login(
      db,
      { email: activeStaff.email, password: CORRECT_PASSWORD },
      META,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("esperava sucesso");

    const session = await validateSession(db, result.cookieValue);
    expect(session?.user.id).toBe(activeStaff.id);
    expect(result.mustChangePassword).toBe(false);

    const [updated] = await db.select().from(staffUsers).where(eq(staffUsers.id, activeStaff.id));
    expect(updated.lastLoginAt).not.toBeNull();

    const attempts = await db
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.email, activeStaff.email));
    expect(attempts).toHaveLength(1);
    expect(attempts[0].succeeded).toBe(true);
    expect(attempts[0].tenantId).toBe(tenant.id);
  });

  it("normaliza e-mail com espaços e maiúsculas", async () => {
    const result = await login(
      db,
      { email: " DONO@Clinica.TEST ", password: CORRECT_PASSWORD },
      META,
    );

    expect(result.ok).toBe(true);
  });

  it("senha provisória: mustChangePassword true quando must_change_password está marcado", async () => {
    await db
      .update(staffUsers)
      .set({ mustChangePassword: true })
      .where(eq(staffUsers.id, activeStaff.id));

    const result = await login(
      db,
      { email: activeStaff.email, password: CORRECT_PASSWORD },
      META,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("esperava sucesso");
    expect(result.mustChangePassword).toBe(true);
  });

  it("senha errada: mensagem genérica, tentativa registrada como falha e nenhuma sessão criada", async () => {
    const result = await login(db, { email: activeStaff.email, password: "errada-123" }, META);

    expect(result).toEqual(WRONG_ERROR);

    const attempts = await db
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.email, activeStaff.email));
    expect(attempts).toHaveLength(1);
    expect(attempts[0].succeeded).toBe(false);
    expect(await countSessions()).toBe(0);
  });

  it("e-mail inexistente: mesma mensagem genérica, tentativa com tenant_id nulo e nenhuma sessão criada", async () => {
    const result = await login(
      db,
      { email: "nao-existe@clinica.test", password: CORRECT_PASSWORD },
      META,
    );

    expect(result).toEqual(WRONG_ERROR);

    const attempts = await db
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.email, "nao-existe@clinica.test"));
    expect(attempts).toHaveLength(1);
    expect(attempts[0].tenantId).toBeNull();
    expect(await countSessions()).toBe(0);
  });

  it("e-mail inexistente: verifica a senha contra o hash falso fixo (defesa contra timing)", async () => {
    await login(db, { email: "nao-existe@clinica.test", password: "qualquer-coisa" }, META);

    expect(verifyPasswordSpy).toHaveBeenCalledWith(DUMMY_PASSWORD_HASH, "qualquer-coisa");
  });

  it("usuário desativado: mesma mensagem genérica mesmo com a senha certa, nenhuma sessão criada", async () => {
    const result = await login(
      db,
      { email: deactivatedStaff.email, password: CORRECT_PASSWORD },
      META,
    );

    expect(result).toEqual(WRONG_ERROR);
    expect(await countSessions()).toBe(0);
  });

  it("entrada inválida: mesma mensagem genérica, sem lançar e sem registrar tentativa", async () => {
    await expect(login(db, { email: "x", password: "" }, META)).resolves.toEqual(WRONG_ERROR);

    const allAttempts = await db.select().from(loginAttempts);
    expect(allAttempts).toHaveLength(0);
    expect(await countSessions()).toBe(0);
  });

  it("bloqueado: após 5 falhas, a senha certa devolve a mensagem de bloqueio, não verifica a senha e não cria sessão", async () => {
    for (let i = 0; i < 5; i++) {
      await login(db, { email: activeStaff.email, password: "errada-123" }, META);
    }
    verifyPasswordSpy.mockClear();

    const result = await login(
      db,
      { email: activeStaff.email, password: CORRECT_PASSWORD },
      META,
    );

    expect(result).toEqual(BLOCKED_ERROR);
    expect(verifyPasswordSpy).not.toHaveBeenCalled();

    const [staffRow] = await db.select().from(staffUsers).where(eq(staffUsers.id, activeStaff.id));
    expect(staffRow.lastLoginAt).toBeNull();
    expect(await countSessions()).toBe(0);
  });

  it("bloqueado repetidamente: o número de tentativas de falha registradas não cresce", async () => {
    for (let i = 0; i < 5; i++) {
      await login(db, { email: activeStaff.email, password: "errada-123" }, META);
    }
    expect(await countAttempts(activeStaff.email)).toBe(5);

    for (let i = 0; i < 3; i++) {
      const result = await login(db, { email: activeStaff.email, password: "errada-123" }, META);
      expect(result).toEqual(BLOCKED_ERROR);
    }

    expect(await countAttempts(activeStaff.email)).toBe(5);
  });

  it("concorrência: 10 tentativas simultâneas da mesma senha errada não ultrapassam o limite por e-mail", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        login(db, { email: activeStaff.email, password: "errada-123" }, META),
      ),
    );

    const blockedCount = results.filter(
      (r) => !r.ok && r.error === "Muitas tentativas. Tente novamente em alguns minutos.",
    ).length;
    expect(blockedCount).toBeGreaterThanOrEqual(5);

    const failureRows = await db
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.email, activeStaff.email));
    expect(failureRows.length).toBeLessThanOrEqual(5);
  });
});
