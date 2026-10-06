"use server";

import { redirect } from "next/navigation";

import { safeReturnPath } from "@/lib/return-path";
import {
  beginEntry,
  beginSignup,
  completeEntry,
  resendEntryCode,
  type CompleteEntryResult,
  type EntryStepResult,
} from "@/server/auth/current-client";
import { describeUnexpectedError } from "@/server/errors";
import { normalizeSlug } from "@/server/services/tenants";

const GENERIC_ERROR = "Não foi possível continuar. Tente novamente.";

type Failure = { ok: false; error: string; restart: boolean };

// Ações sem sessão: são elas que autenticam. A clínica é validada dentro de current-client.
async function guarded<T>(run: () => Promise<T>): Promise<T | Failure> {
  try {
    return await run();
  } catch (error) {
    // Erro de banco do Drizzle carrega CPF, telefone e IP na mensagem: loga só o nome/código.
    console.error("[entrada] erro inesperado:", describeUnexpectedError(error));
    return { ok: false, error: GENERIC_ERROR, restart: false };
  }
}

export async function startEntryAction(slug: string, input: unknown): Promise<EntryStepResult> {
  return guarded(() => beginEntry(slug, input));
}

export async function startSignupAction(slug: string, input: unknown): Promise<EntryStepResult> {
  return guarded(() => beginSignup(slug, input));
}

export async function resendCodeAction(slug: string, input: unknown): Promise<EntryStepResult> {
  return guarded(() => resendEntryCode(slug, input));
}

export async function verifyCodeAction(
  slug: string,
  input: unknown,
  voltar: string | null,
): Promise<Failure | undefined> {
  const result: CompleteEntryResult | Failure = await guarded(() => completeEntry(slug, input));
  if (!result.ok) return result;

  // Sucesso implica clínica encontrada, logo slug válido; o normalizado vira o caminho.
  // redirect() lança um erro de controle de fluxo: fica fora do try/catch.
  redirect(safeReturnPath(normalizeSlug(slug) ?? slug, voltar));
}
