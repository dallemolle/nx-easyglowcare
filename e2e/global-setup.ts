/**
 * Setup global do Playwright: roda o seed (com uma senha fixa para a equipe de exemplo) e
 * limpa `login_attempts` no banco de DEV local, para que o limite de tentativas de uma
 * execução anterior não vaze para esta.
 *
 * Só roda contra banco local (localhost/127.0.0.1/db.localtest.me) — reaproveita a mesma
 * trava do seed (`assertLocalDatabase`) para nunca encostar num banco que não seja o Docker
 * local, mesmo que `.env.local` aponte, por engano, para outra coisa.
 */
import { execSync } from "node:child_process";

import pg from "pg";

import { assertLocalDatabase } from "../src/server/db/seed-guard";

export const E2E_STAFF_PASSWORD = "e2e-senha-forte-1";

export default async function globalSetup(): Promise<void> {
  process.loadEnvFile(".env.local");

  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    throw new Error("Defina DATABASE_URL_UNPOOLED em .env.local antes de rodar o e2e.");
  }
  assertLocalDatabase(url, false);

  execSync("pnpm db:seed", {
    stdio: "inherit",
    env: { ...process.env, SEED_STAFF_PASSWORD: E2E_STAFF_PASSWORD },
  });

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await pool.query("DELETE FROM login_attempts");
  } finally {
    await pool.end();
  }
}
