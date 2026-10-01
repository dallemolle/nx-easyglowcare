import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "@/server/db/schema";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/easyglowcare_test";

export const testPool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });

const testDb = drizzle({ client: testPool, schema, casing: "snake_case" });

export function getTestDb() {
  return testDb;
}

/** Apaga todos os dados de negócio (o cascade a partir de `tenants` limpa o resto). */
export async function resetDb(): Promise<void> {
  await testPool.query("TRUNCATE tenants CASCADE");
}
