"use server";

import { redirect } from "next/navigation";

import { signIn } from "@/server/auth/current";
import { describeUnexpectedError } from "@/server/errors";

const GENERIC_ERROR = "Não foi possível entrar. Tente novamente.";

// Única Server Action sem requireStaff/requirePermission: é ela quem autentica.
export async function loginAction(input: unknown): Promise<{ error: string } | undefined> {
  let result: Awaited<ReturnType<typeof signIn>>;
  try {
    result = await signIn(input);
  } catch (error) {
    // Erro de banco do Drizzle carrega e-mail, IP e user-agent na mensagem: loga só o nome/código.
    console.error("[login] erro inesperado:", describeUnexpectedError(error));
    return { error: GENERIC_ERROR };
  }

  if (!result.ok) {
    return { error: result.error };
  }

  // redirect() lança um erro de controle de fluxo: fica fora do try/catch.
  redirect(result.mustChangePassword ? "/admin/trocar-senha" : "/admin");
}
