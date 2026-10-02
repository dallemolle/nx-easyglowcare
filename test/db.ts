import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "@/server/db/schema";

import { assertTestDatabase } from "./db-guard";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/easyglowcare_test";

assertTestDatabase(TEST_DATABASE_URL);

export const testPool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });

const testDb = drizzle({ client: testPool, schema, casing: "snake_case" });

export function getTestDb() {
  return testDb;
}

/**
 * Apaga todos os dados de negócio (o cascade a partir de `tenants` limpa o resto).
 * `login_attempts` é truncada à parte porque admite `tenant_id` nulo (tentativa com
 * e-mail inexistente) e essas linhas não são removidas pelo cascade de `tenants`.
 */
export async function resetDb(): Promise<void> {
  await testPool.query("TRUNCATE tenants, login_attempts CASCADE");
}
