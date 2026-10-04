/**
 * Cria um usuário da equipe (dono, recepção ou profissional) direto no banco.
 * É assim que a/o primeira/o dona/dono é criada/o em produção.
 * Uso: pnpm staff:create -- --tenant <slug> --name <nome> --email <email> --role <owner|reception|professional>
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { safeRecordAudit } from "@/server/services/audit";
import { createStaff } from "@/server/services/staff";

import { describeDatabaseTarget } from "./database-target";
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

    console.log(`Banco: ${describeDatabaseTarget(url)} · Clínica: ${tenant.slug}`);

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

    // Auditoria só depois de mostrar a senha: ela aparece uma única vez e, se a gravação
    // travar ou o comando for interrompido, a pessoa já existe e a senha se perderia.
    // Ator "system": o comando roda no terminal, sem usuário logado.
    await safeRecordAudit(scope, {
      actor: { type: "system" },
      action: "staff.created",
      entity: "staff_user",
      entityId: user.id,
      metadata: { role: user.role },
    });
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
