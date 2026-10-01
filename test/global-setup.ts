import { existsSync } from "node:fs";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/easyglowcare_test";

/** Roda uma vez antes da suíte: confere o Postgres de teste e aplica as migrations. */
export default async function setup() {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    try {
      await pool.query("select 1");
    } catch (cause) {
      throw new Error("Postgres de teste indisponível: rode `pnpm db:up`", { cause });
    }
    if (existsSync("drizzle/meta/_journal.json")) {
      await migrate(drizzle({ client: pool }), { migrationsFolder: "drizzle" });
    }
  } finally {
    await pool.end();
  }
}
