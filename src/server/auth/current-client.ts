import "server-only";

import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { getEnv } from "@/lib/env";
import { ORIGIN_COOKIE, parseOriginCookie } from "@/lib/lead-origin";
import type { OtpChannel } from "@/lib/validation/entry";
import { getMessagingProvider } from "@/server/adapters/messaging";
import { db } from "@/server/db/client";
import type { Person, Tenant } from "@/server/db/schema";
import { tenantScope, type TenantScope } from "@/server/db/tenant-scope";
import { getTenantBySlug } from "@/server/services/tenants";

import {
  CLIENT_SESSION_COOKIE,
  renewClientSession,
  revokeClientSession,
  validateClientSession,
  type ClientSession,
} from "./client-session";
import {
  resendCode,
  startEntry,
  startSignup,
  verifyCode,
  type CodeSent,
  type EntryDeps,
  type EntryError,
  type EntryMeta,
} from "./entry";
import { clientIp } from "./rate-limit";
import { signPayload, verifyPayload } from "./token";

// Fiação Next.js da entrada do cliente (cookies, headers, redirect). Como current.ts, é um dos
// poucos módulos autorizados a importar @/server/db/client: páginas, actions e componentes de
// /<slug>/entrar e /<slug>/minha-conta passam por aqui. Os cookies usam sempre o slug
// NORMALIZADO da clínica (`tenant.slug`), nunca o parâmetro bruto da rota.

/** Cookie do desafio de código em andamento: JWT `{ c: challengeId, s: slug }`, 10 min. */
export const OTP_COOKIE = "egc_otp";
const OTP_COOKIE_TTL_MS = 10 * 60 * 1000;

const GENERIC_ERROR = "Não foi possível continuar. Tente novamente.";
const EXPIRED_ERROR = "Este código expirou. Peça um novo.";

export type CurrentClient = {
  sessionId: string;
  person: Pick<Person, "id" | "name" | "cpf" | "phone" | "status">;
  tenant: Tenant;
  scope: TenantScope;
  shouldRenew: boolean;
};

export type EntryStepResult =
  | { ok: true; step: "code"; maskedPhone: string; channel: OtpChannel; resendAvailableAt: string }
  | { ok: true; step: "signup"; cpf: string }
  | { ok: false; error: string; restart: boolean };

export type CompleteEntryResult = { ok: true } | { ok: false; error: string; restart: boolean };

type Failure = { ok: false; error: string; restart: boolean };

function cookieOptions(slug: string) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: `/${slug}`,
  };
}

/** Clínica desconhecida numa action: volta ao começo com a mensagem genérica. */
const UNKNOWN_TENANT: Failure = { ok: false, error: GENERIC_ERROR, restart: true };

function failure(result: EntryError): Failure {
  return { ok: false, error: result.error, restart: result.restart };
}

/**
 * Sessão completa da clínica `slug`, memoizada por request. Uso interno: `getCurrentClient`
 * deriva o `CurrentClient` público daqui, e `refreshClientSession`/`signOutClient`
 * reaproveitam o resultado.
 */
const getSession = cache(
  async (slug: string): Promise<{ tenant: Tenant; session: ClientSession | null } | null> => {
    const found = await getTenantBySlug(slug);
    if (!found) return null;
    const cookieValue = (await cookies()).get(CLIENT_SESSION_COOKIE)?.value;
    const session = await validateClientSession(db, found.tenant.id, cookieValue);
    return { tenant: found.tenant, session };
  },
);

/** Cliente com sessão válida nesta clínica, ou `null`. Memoizado por request. */
export const getCurrentClient = cache(async (slug: string): Promise<CurrentClient | null> => {
  const current = await getSession(slug);
  const session = current?.session;
  if (!session) return null;

  const { id, name, cpf, phone, status } = session.person;
  return {
    sessionId: session.sessionId,
    person: { id, name, cpf, phone, status },
    tenant: session.tenant,
    scope: tenantScope(db, session.tenant.id),
    shouldRenew: session.shouldRenew,
  };
});

/**
 * Exige um cliente com sessão nesta clínica. Sem sessão, redireciona para
 * `/<slug>/entrar?voltar=<voltar>`. Clínica inexistente: 404.
 */
export async function requireClient(slug: string, voltar: string): Promise<CurrentClient> {
  const found = await getTenantBySlug(slug);
  if (!found) notFound();

  const client = await getCurrentClient(slug);
  if (!client) {
    redirect(`/${found.tenant.slug}/entrar?voltar=${encodeURIComponent(voltar)}`);
  }
  return client;
}

async function requestMeta(): Promise<EntryMeta> {
  const headerList = await headers();
  return { ip: clientIp(headerList.get("x-forwarded-for")), userAgent: headerList.get("user-agent") };
}

function entryDeps(): EntryDeps {
  return { messaging: getMessagingProvider(), testPhones: getEnv().OTP_TEST_PHONES };
}

/** Grava (ou troca) o cookie do desafio e devolve o resultado para a tela do código. */
async function codeStep(slug: string, sent: CodeSent, now: Date): Promise<EntryStepResult> {
  const value = await signPayload(
    { c: sent.challengeId, s: slug },
    new Date(now.getTime() + OTP_COOKIE_TTL_MS),
  );
  (await cookies()).set(OTP_COOKIE, value, {
    ...cookieOptions(slug),
    expires: new Date(now.getTime() + OTP_COOKIE_TTL_MS),
  });
  return {
    ok: true,
    step: "code",
    maskedPhone: sent.maskedPhone,
    channel: sent.channel,
    resendAvailableAt: sent.resendAvailableAt.toISOString(),
  };
}

/**
 * Desafio do cookie `egc_otp`, só se o cookie for válido e emitido para esta clínica
 * (`s === tenant.slug`). Senão `null`, e quem chama volta ao passo do CPF sem consultar o banco.
 */
async function challengeFromCookie(slug: string): Promise<string | null> {
  const payload = await verifyPayload((await cookies()).get(OTP_COOKIE)?.value);
  if (!payload || payload.s !== slug || typeof payload.c !== "string") return null;
  return payload.c;
}

/** Passo do CPF. Só para Server Actions (grava cookie). */
export async function beginEntry(slug: string, input: unknown): Promise<EntryStepResult> {
  const found = await getTenantBySlug(slug);
  if (!found) return UNKNOWN_TENANT;

  const now = new Date();
  const result = await startEntry(db, found.tenant.id, input, await requestMeta(), entryDeps(), now);
  if (result.kind === "needs-signup") return { ok: true, step: "signup", cpf: result.cpf };
  if (result.kind === "error") return failure(result);
  return codeStep(found.tenant.slug, result, now);
}

/** Passo do cadastro, com a origem do lead do cookie `egc_origem`. Só para Server Actions. */
export async function beginSignup(slug: string, input: unknown): Promise<EntryStepResult> {
  const found = await getTenantBySlug(slug);
  if (!found) return UNKNOWN_TENANT;

  const origin = parseOriginCookie((await cookies()).get(ORIGIN_COOKIE)?.value);
  const now = new Date();
  const result = await startSignup(db, found.tenant.id, input, origin, await requestMeta(), entryDeps(), now);
  if (result.kind === "error") return failure(result);
  return codeStep(found.tenant.slug, result, now);
}

/** Reenvio (pelo canal escolhido). Troca o cookie pelo desafio novo. Só para Server Actions. */
export async function resendEntryCode(slug: string, input: unknown): Promise<EntryStepResult> {
  const found = await getTenantBySlug(slug);
  if (!found) return UNKNOWN_TENANT;

  const challengeId = await challengeFromCookie(found.tenant.slug);
  if (!challengeId) return { ok: false, error: EXPIRED_ERROR, restart: true };

  const now = new Date();
  const result = await resendCode(db, found.tenant.id, challengeId, input, await requestMeta(), entryDeps(), now);
  if (result.kind === "error") return failure(result);
  return codeStep(found.tenant.slug, result, now);
}

/** Confere o código, grava `egc_cliente` e apaga `egc_otp`. Só para Server Actions. */
export async function completeEntry(slug: string, input: unknown): Promise<CompleteEntryResult> {
  const found = await getTenantBySlug(slug);
  if (!found) return UNKNOWN_TENANT;
  const { tenant } = found;

  const challengeId = await challengeFromCookie(tenant.slug);
  if (!challengeId) return { ok: false, error: EXPIRED_ERROR, restart: true };

  const result = await verifyCode(db, tenant.id, challengeId, input, await requestMeta());
  if (result.kind === "error") return failure(result);

  const cookieStore = await cookies();
  cookieStore.set(CLIENT_SESSION_COOKIE, result.cookieValue, {
    ...cookieOptions(tenant.slug),
    expires: result.expiresAt,
  });
  cookieStore.delete({ name: OTP_COOKIE, ...cookieOptions(tenant.slug) });
  return { ok: true };
}

/**
 * Renova a sessão quando estiver perto de expirar (`shouldRenew`). Chamada por Server Action
 * (a página só sinaliza com `shouldRenew`; página não grava cookie).
 */
export async function refreshClientSession(slug: string): Promise<void> {
  const current = await getSession(slug);
  if (!current?.session?.shouldRenew) return;

  const expiresAt = await renewClientSession(db, current.session.sessionId);

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(CLIENT_SESSION_COOKIE)?.value;
  if (!cookieValue) return;
  cookieStore.set(CLIENT_SESSION_COOKIE, cookieValue, {
    ...cookieOptions(current.tenant.slug),
    expires: expiresAt,
  });
}

/** Revoga a sessão desta clínica (se houver) e apaga o cookie. Só para Server Actions. */
export async function signOutClient(slug: string): Promise<void> {
  const current = await getSession(slug);
  if (!current) return;
  if (current.session) await revokeClientSession(db, current.session.sessionId);
  (await cookies()).delete({ name: CLIENT_SESSION_COOKIE, ...cookieOptions(current.tenant.slug) });
}
