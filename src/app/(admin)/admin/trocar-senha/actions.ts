"use server";

import { redirect } from "next/navigation";

import { refreshSessionCookie, requireStaff } from "@/server/auth/current";
import { changeOwnPassword, StaffError } from "@/server/services/staff";

const GENERIC_ERROR = "Não foi possível trocar a senha. Tente novamente.";

/**
 * Descreve um erro inesperado para log, SEM nunca usar `error.message`: no Drizzle 0.45, uma
 * falha do driver vem embrulhada em `DrizzleQueryError`, cuja mensagem é
 * "Failed query: <sql>\nparams: <params>" — aqui, isso incluiria o novo hash Argon2, o id do
 * usuário e o do tenant. Loga só o nome do erro e, quando houver, o código da causa do driver
 * (ex.: "23505"), nunca a mensagem.
 */
function describeUnexpectedError(error: unknown): string {
  const name = error instanceof Error ? error.name : "erro desconhecido";
  const cause = error && typeof error === "object" ? (error as { cause?: unknown }).cause : undefined;
  const code =
    cause && typeof cause === "object" && "code" in cause ? (cause as { code?: unknown }).code : undefined;
  return code ? `${name} (code=${String(code)})` : name;
}

export async function changePasswordAction(input: unknown): Promise<{ error: string } | undefined> {
  const staff = await requireStaff({ allowPasswordChange: true });
  await refreshSessionCookie(staff);

  try {
    await changeOwnPassword(staff.scope, { id: staff.user.id }, staff.sessionId, input);
  } catch (error) {
    if (error instanceof StaffError) {
      return { error: error.message };
    }
    // Erro inesperado: nunca repassa detalhes ao cliente.
    console.error("[trocar-senha] erro inesperado:", describeUnexpectedError(error));
    return { error: GENERIC_ERROR };
  }

  redirect("/admin");
}
