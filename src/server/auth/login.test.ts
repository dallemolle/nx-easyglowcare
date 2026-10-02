import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getTestDb, resetDb } from "../../../test/db";
import { loginAttempts, sessions, staffUsers, tenants, type StaffUser, type Tenant } from "../db/schema";

import { hashPassword } from "./password";
import { isLoginBlocked } from "./rate-limit";
import { validateSession } from "./session";

import { login } from "./login";

const db = getTestDb();

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

describe("login", () => {
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

  it("senha errada: mensagem genérica e tentativa registrada como falha", async () => {
    const result = await login(db, { email: activeStaff.email, password: "errada-123" }, META);

    expect(result).toEqual(WRONG_ERROR);

    const attempts = await db
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.email, activeStaff.email));
    expect(attempts).toHaveLength(1);
    expect(attempts[0].succeeded).toBe(false);
  });

  it("e-mail inexistente: mesma mensagem genérica e tentativa com tenant_id nulo", async () => {
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
  });

  it("usuário desativado: mesma mensagem genérica mesmo com a senha certa", async () => {
    const result = await login(
      db,
      { email: deactivatedStaff.email, password: CORRECT_PASSWORD },
      META,
    );

    expect(result).toEqual(WRONG_ERROR);
  });

  it("entrada inválida: mesma mensagem genérica, sem lançar", async () => {
    await expect(login(db, { email: "x", password: "" }, META)).resolves.toEqual(WRONG_ERROR);
  });

  it("bloqueado: após 5 falhas, a senha certa devolve a mensagem de bloqueio e não cria sessão", async () => {
    for (let i = 0; i < 5; i++) {
      await login(db, { email: activeStaff.email, password: "errada-123" }, META);
    }

    expect(await isLoginBlocked(db, activeStaff.email, META.ip)).toBe(true);

    const result = await login(
      db,
      { email: activeStaff.email, password: CORRECT_PASSWORD },
      META,
    );

    expect(result).toEqual(BLOCKED_ERROR);

    const [staffRow] = await db.select().from(staffUsers).where(eq(staffUsers.id, activeStaff.id));
    expect(staffRow.lastLoginAt).toBeNull();

    const createdSessions = await db.select().from(sessions);
    expect(createdSessions).toHaveLength(0);
  });
});
