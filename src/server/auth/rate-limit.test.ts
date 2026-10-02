import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { getTestDb, resetDb } from "../../../test/db";
import { loginAttempts, tenants, type Tenant } from "../db/schema";

import { clientIp, completeLoginAttempt, reserveLoginAttempt } from "./rate-limit";

const db = getTestDb();

const IP = "203.0.113.7";
const OTHER_IP = "198.51.100.9";

let tenant: Tenant;

beforeEach(async () => {
  await resetDb();
  [tenant] = await db
    .insert(tenants)
    .values({ slug: "easyglowcare", name: "EasyGlowCare" })
    .returning();
});

/** Simula uma falha de login real: reserva e completa como falha, como `login()` faz. */
async function recordFailure(email: string, ip: string, now?: Date): Promise<void> {
  const reservation = await reserveLoginAttempt(db, { email, ip }, now);
  if (reservation.blocked) throw new Error("tentativa deveria ter sido reservada, não bloqueada");
  await completeLoginAttempt(db, reservation.attemptId, { tenantId: null, succeeded: false });
}

async function failureRowCount(email: string): Promise<number> {
  const rows = await db
    .select()
    .from(loginAttempts)
    .where(and(eq(loginAttempts.email, email), eq(loginAttempts.succeeded, false)));
  return rows.length;
}

describe("clientIp", () => {
  it("devolve 'unknown' quando não há cabeçalho", () => {
    expect(clientIp(null)).toBe("unknown");
  });

  it("devolve o IP quando há só um", () => {
    expect(clientIp("203.0.113.7")).toBe("203.0.113.7");
  });

  it("devolve o primeiro IP da lista, ignorando espaços", () => {
    expect(clientIp(" 203.0.113.7 , 10.0.0.1, 10.0.0.2")).toBe("203.0.113.7");
  });

  it("devolve 'unknown' para cabeçalho vazio", () => {
    expect(clientIp("")).toBe("unknown");
  });
});

describe("reserveLoginAttempt / completeLoginAttempt", () => {
  it("reserva a tentativa ANTES de qualquer verificação: a linha já existe como falha", async () => {
    const email = "dono@clinica.test";
    const reservation = await reserveLoginAttempt(db, { email, ip: IP });

    expect(reservation.blocked).toBe(false);
    if (reservation.blocked) throw new Error("não deveria bloquear");

    const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.id, reservation.attemptId));
    expect(row.succeeded).toBe(false);
    expect(row.email).toBe(email);
    expect(row.tenantId).toBeNull();
  });

  it("completeLoginAttempt atualiza tenantId e succeeded da linha reservada", async () => {
    const email = "dono@clinica.test";
    const reservation = await reserveLoginAttempt(db, { email, ip: IP });
    if (reservation.blocked) throw new Error("não deveria bloquear");

    await completeLoginAttempt(db, reservation.attemptId, { tenantId: tenant.id, succeeded: true });

    const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.id, reservation.attemptId));
    expect(row.succeeded).toBe(true);
    expect(row.tenantId).toBe(tenant.id);
  });

  it("5 falhas do mesmo e-mail não bloqueiam; a 6ª bloqueia", async () => {
    const email = "dono@clinica.test";

    for (let i = 0; i < 5; i++) {
      await recordFailure(email, IP);
    }
    expect(await failureRowCount(email)).toBe(5);

    const sixth = await reserveLoginAttempt(db, { email, ip: IP });
    expect(sixth.blocked).toBe(true);

    // a tentativa bloqueada não deixou linha extra (foi desfeita)
    expect(await failureRowCount(email)).toBe(5);
  });

  it("um sucesso depois de 5 falhas desbloqueia o e-mail", async () => {
    const email = "dono2@clinica.test";
    const now = new Date("2026-01-01T12:00:00Z");

    for (let i = 0; i < 5; i++) {
      await recordFailure(email, IP, now);
    }
    expect((await reserveLoginAttempt(db, { email, ip: IP }, now)).blocked).toBe(true);

    // sucesso gravado diretamente, como `login()` faz via completeLoginAttempt({ succeeded: true })
    const afterSuccess = new Date(now.getTime() + 1000);
    await db
      .insert(loginAttempts)
      .values({ tenantId: tenant.id, email, ip: IP, succeeded: true, createdAt: afterSuccess });

    const afterwards = new Date(afterSuccess.getTime() + 1000);
    expect((await reserveLoginAttempt(db, { email, ip: IP }, afterwards)).blocked).toBe(false);
  });

  it("falha no mesmo instante do sucesso não conta para o limite por e-mail (corte estrito)", async () => {
    const email = "simultaneo@clinica.test";
    const t = new Date("2026-01-01T12:00:00Z");

    // sucesso em t
    await db.insert(loginAttempts).values({ tenantId: tenant.id, email, ip: IP, succeeded: true, createdAt: t });
    // falha no MESMO instante t: não deve contar (fronteira exclusiva)
    await db.insert(loginAttempts).values({ tenantId: null, email, ip: IP, succeeded: false, createdAt: t });
    // 4 falhas depois de t, dentro da janela
    for (let i = 1; i <= 4; i++) {
      await db.insert(loginAttempts).values({
        tenantId: null,
        email,
        ip: IP,
        succeeded: false,
        createdAt: new Date(t.getTime() + i * 1000),
      });
    }

    // a 5ª falha "real" depois do sucesso: se a fronteira for exclusiva (correto), o total
    // contado é 5 (não bloqueia); se fosse inclusiva, contaria a de t também e bloquearia.
    const reservation = await reserveLoginAttempt(db, { email, ip: IP }, new Date(t.getTime() + 10_000));
    expect(reservation.blocked).toBe(false);
  });

  it("5 falhas há 16 minutos não bloqueiam (fora da janela de 15 min)", async () => {
    const email = "dono3@clinica.test";
    const now = new Date("2026-01-01T12:00:00Z");
    const sixteenMinutesAgo = new Date(now.getTime() - 16 * 60 * 1000);

    for (let i = 0; i < 5; i++) {
      await recordFailure(email, IP, sixteenMinutesAgo);
    }

    const reservation = await reserveLoginAttempt(db, { email, ip: IP }, now);
    expect(reservation.blocked).toBe(false);
  });

  it("20 falhas do mesmo IP com e-mails diferentes bloqueiam um e-mail novo vindo desse IP; outro IP não é afetado", async () => {
    for (let i = 0; i < 20; i++) {
      await recordFailure(`cliente${i}@clinica.test`, IP);
    }

    const blockedByIp = await reserveLoginAttempt(db, { email: "novo-email@clinica.test", ip: IP });
    expect(blockedByIp.blocked).toBe(true);

    const notBlocked = await reserveLoginAttempt(db, { email: "novo-email@clinica.test", ip: OTHER_IP });
    expect(notBlocked.blocked).toBe(false);
  });

  it("tentativas bloqueadas repetidas não fazem o número de falhas crescer", async () => {
    const email = "dono4@clinica.test";
    for (let i = 0; i < 5; i++) {
      await recordFailure(email, IP);
    }
    expect(await failureRowCount(email)).toBe(5);

    for (let i = 0; i < 3; i++) {
      const reservation = await reserveLoginAttempt(db, { email, ip: IP });
      expect(reservation.blocked).toBe(true);
    }

    expect(await failureRowCount(email)).toBe(5);
  });
});
