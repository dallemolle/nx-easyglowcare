/**
 * Cria um usuário da equipe (dono, recepção ou profissional) direto no banco.
 * É assim que a/o primeira/o dona/dono é criada/o em produção.
 * Uso: pnpm staff:create -- --tenant <slug> --name <nome> --email <email> --role <owner|reception|professional>
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { createStaff } from "@/server/services/staff";

import * as schema from "./schema";
import { parseStaffCreateArgs } from "./staff-create-args";
import { tenantScope } from "./tenant-scope";

const { tenants } = schema;

async function main() {
  // `pnpm staff:create -- --tenant ...` repassa o `--` separador como argumento literal.
  const args = parseStaffCreateArgs(process.argv.slice(2).filter((arg) => arg !== "--"));

  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) throw new Error("Defina DATABASE_URL_UNPOOLED (veja .env.example).");

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const db = drizzle({ client: pool, schema, casing: "snake_case" });

  try {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, args.tenant));
    if (!tenant) throw new Error(`Clínica não encontrada: ${args.tenant}`);

    const scope = tenantScope(db, tenant.id);
    const { user, temporaryPassword } = await createStaff(scope, {
      name: args.name,
      email: args.email,
      role: args.role,
    });

    console.log(`E-mail: ${user.email}`);
    console.log(`Papel: ${user.role}`);
    console.log(`Senha provisória: ${temporaryPassword}`);
    console.log("Anote agora: ela não será mostrada de novo.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
