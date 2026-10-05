/**
 * Roda no build da Vercel antes do `next build` (script `vercel-build`): aplica as migrations
 * no banco do ambiente. Se falhar, o build falha e a versão anterior continua no ar.
 * Toda migration precisa funcionar com a versão anterior do app ainda rodando (ver README).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

import { describeUnexpectedError } from "../errors";

import { describeDatabaseTarget } from "./database-target";
import { shouldMigrate } from "./deploy-migration";

// Erro de configuração do deploy (URL ausente ou inválida): a mensagem é nossa e segura de mostrar.
class DeployMigrationConfigError extends Error {}

async function main() {
  const decision = shouldMigrate({
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
  });
  if (!decision.migrate) {
    console.log(`[migrate] pulado: ${decision.reason}`);
    return;
  }

  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    throw new DeployMigrationConfigError(
      "Defina DATABASE_URL_UNPOOLED neste ambiente da Vercel para aplicar as migrations no deploy.",
    );
  }

  let target: string;
  try {
    target = describeDatabaseTarget(url);
  } catch {
    throw new DeployMigrationConfigError("DATABASE_URL_UNPOOLED não é uma URL válida.");
  }

  console.log(`[migrate] ${decision.reason} · banco: ${target}`);
  // Sem limite de conexão, um host inalcançável prende o build até o limite de tempo da Vercel.
  const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 30_000 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: "drizzle" });
    console.log("[migrate] migrations aplicadas");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // Só a nossa mensagem de configuração é mostrada por inteiro; erro de banco vai sem a
  // mensagem (pode carregar SQL e parâmetros).
  const detail = error instanceof DeployMigrationConfigError ? error.message : describeUnexpectedError(error);
  console.error(`[migrate] falhou: ${detail}`);
  process.exit(1);
});
