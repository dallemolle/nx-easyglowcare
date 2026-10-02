import { beforeEach, describe, expect, it } from "vitest";

import { getTestDb, resetDb } from "../../../test/db";
import { tenants, type Tenant } from "../db/schema";

import { clientIp, isLoginBlocked, recordLoginAttempt } from "./rate-limit";

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

describe("isLoginBlocked / recordLoginAttempt", () => {
  it("4 falhas do mesmo e-mail não bloqueiam; a 5ª bloqueia", async () => {
    const email = "dono@clinica.test";

    for (let i = 0; i < 4; i++) {
      await recordLoginAttempt(db, { tenantId: tenant.id, email, ip: IP, succeeded: false });
    }
    expect(await isLoginBlocked(db, email, IP)).toBe(false);

    await recordLoginAttempt(db, { tenantId: tenant.id, email, ip: IP, succeeded: false });
    expect(await isLoginBlocked(db, email, IP)).toBe(true);
  });

  it("um sucesso depois de 5 falhas desbloqueia o e-mail", async () => {
    const email = "dono2@clinica.test";

    for (let i = 0; i < 5; i++) {
      await recordLoginAttempt(db, { tenantId: tenant.id, email, ip: IP, succeeded: false });
    }
    expect(await isLoginBlocked(db, email, IP)).toBe(true);

    await recordLoginAttempt(db, { tenantId: tenant.id, email, ip: IP, succeeded: true });
    expect(await isLoginBlocked(db, email, IP)).toBe(false);
  });

  it("5 falhas há 16 minutos não bloqueiam (fora da janela de 15 min)", async () => {
    const email = "dono3@clinica.test";
    const now = new Date("2026-01-01T12:00:00Z");
    const sixteenMinutesAgo = new Date(now.getTime() - 16 * 60 * 1000);

    for (let i = 0; i < 5; i++) {
      await recordLoginAttempt(
        db,
        { tenantId: tenant.id, email, ip: IP, succeeded: false },
        sixteenMinutesAgo,
      );
    }
    expect(await isLoginBlocked(db, email, IP, now)).toBe(false);
  });

  it("20 falhas do mesmo IP com e-mails diferentes bloqueiam um e-mail novo vindo desse IP; outro IP não é afetado", async () => {
    for (let i = 0; i < 20; i++) {
      await recordLoginAttempt(db, {
        tenantId: tenant.id,
        email: `cliente${i}@clinica.test`,
        ip: IP,
        succeeded: false,
      });
    }

    expect(await isLoginBlocked(db, "novo-email@clinica.test", IP)).toBe(true);
    expect(await isLoginBlocked(db, "novo-email@clinica.test", OTHER_IP)).toBe(false);
  });
});
