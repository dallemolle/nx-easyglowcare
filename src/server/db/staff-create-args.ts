import { parseArgs } from "node:util";

import { staffRole, type StaffRole } from "./schema";

export type StaffCreateArgs = {
  tenant: string;
  name: string;
  email: string;
  role: StaffRole;
};

export const STAFF_CREATE_USAGE =
  "Uso: pnpm staff:create -- --tenant <slug> --name <nome> --email <email> --role <owner|reception|professional>";

/**
 * Lê os argumentos de `pnpm staff:create`. Lança um `Error` com o texto de uso quando falta
 * algum argumento, e um `Error` citando `--role` quando o papel informado não existe.
 */
export function parseStaffCreateArgs(argv: string[]): StaffCreateArgs {
  let values: Partial<Record<"tenant" | "name" | "email" | "role", string>>;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        tenant: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
        role: { type: "string" },
      },
      strict: true,
    }));
  } catch {
    throw new Error(STAFF_CREATE_USAGE);
  }

  const { tenant, name, email, role } = values;
  if (!tenant || !name || !email || !role) throw new Error(STAFF_CREATE_USAGE);

  if (!staffRole.enumValues.includes(role as StaffRole)) {
    throw new Error(`Valor inválido para --role: "${role}". Use ${staffRole.enumValues.join(", ")}.`);
  }

  return { tenant, name, email, role: role as StaffRole };
}
