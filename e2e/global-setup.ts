/**
 * Setup global do Playwright: roda o seed (com uma senha fixa para a equipe de exemplo) e
 * limpa `login_attempts` no banco de DEV local, para que o limite de tentativas de uma
 * execução anterior não vaze para esta.
 *
 * Só roda contra banco local (localhost/127.0.0.1/db.localtest.me). Confere TANTO
 * `DATABASE_URL_UNPOOLED` (usada pelo seed e por este setup) QUANTO `DATABASE_URL` (a que o
 * app sob teste usa de verdade — src/server/db/client.ts). As duas podem divergir em
 * `.env.local`; se só a primeira fosse checada, um `DATABASE_URL` apontando para fora por
 * engano faria o e2e logar e criar gente de verdade num banco remoto, sem o seed tocar nele.
 */
import { execSync } from "node:child_process";

import pg from "pg";

import { assertLocalDatabase } from "../src/server/db/seed-guard";

import { E2E_NEW_CPF, E2E_STAFF_PASSWORD, E2E_TEST_PHONE } from "./constants";

/** Mensagem própria do e2e: a do seed ("Seed recusado... Use --force") não faz sentido aqui. */
function assertLocalForE2e(label: string, url: string): void {
  try {
    assertLocalDatabase(url, false);
  } catch {
    throw new Error(
      `Setup do e2e recusado: ${label} não aponta para um banco local ` +
        "(localhost/127.0.0.1/db.localtest.me). O e2e só pode rodar contra o Postgres de " +
        "desenvolvimento do Docker — confira .env.local antes de rodar \"pnpm test:e2e\".",
    );
  }
}

export default async function globalSetup(): Promise<void> {
  process.loadEnvFile(".env.local");

  const unpooledUrl = process.env.DATABASE_URL_UNPOOLED;
  const appUrl = process.env.DATABASE_URL;
  if (!unpooledUrl || !appUrl) {
    throw new Error("Defina DATABASE_URL e DATABASE_URL_UNPOOLED em .env.local antes de rodar o e2e.");
  }

  const testPhones = (process.env.OTP_TEST_PHONES ?? "").split(",").map((phone) => phone.trim());
  if (!testPhones.includes(E2E_TEST_PHONE)) {
    throw new Error(
      `Adicione OTP_TEST_PHONES=${E2E_TEST_PHONE} ao .env.local: o e2e de entrada usa esse celular ` +
        "de teste (código fixo 000000) e não consegue entrar sem ele.",
    );
  }

  // Antes de qualquer coisa (seed, truncate): as duas urls precisam ser locais.
  assertLocalForE2e("DATABASE_URL_UNPOOLED (seed)", unpooledUrl);
  assertLocalForE2e("DATABASE_URL (app sob teste)", appUrl);

  execSync("pnpm db:seed", {
    stdio: "inherit",
    env: { ...process.env, SEED_STAFF_PASSWORD: E2E_STAFF_PASSWORD },
  });

  const pool = new pg.Pool({ connectionString: unpooledUrl, max: 1 });
  try {
    await pool.query("DELETE FROM login_attempts");
    // Estado do e2e de entrada: a pessoa criada no cadastro e os envios de código (limites de
    // 3 por celular e 10 por IP em 15 min) de execuções anteriores, do modo dev ou do prod.
    await pool.query("DELETE FROM people WHERE cpf = $1", [E2E_NEW_CPF]);
    await pool.query("DELETE FROM otp_codes WHERE phone = $1 OR ip IN ('127.0.0.1', '::1', 'unknown')", [
      E2E_TEST_PHONE,
    ]);
  } finally {
    await pool.end();
  }
}
