import "server-only";

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { maskPhone } from "@/lib/br/phone";
import type { LeadOriginParams } from "@/lib/lead-origin";
import { TERMS_VERSION } from "@/lib/legal/terms";
import {
  resendSchema,
  signupSchema,
  startEntrySchema,
  verifyCodeSchema,
  type OtpChannel,
} from "@/lib/validation/entry";
import type { MessagingProvider } from "@/server/adapters/messaging";
import { otpCodes, type OtpCode, type Person } from "@/server/db/schema";
import { tenantScope, type AnyPgDatabase } from "@/server/db/tenant-scope";
import { describeUnexpectedError } from "@/server/errors";
import { createLeadFromSignup, findPersonByCpf, markPhoneVerified } from "@/server/services/people";

import { createClientSession } from "./client-session";
import {
  codeMatches,
  generateCode,
  OTP_MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  reserveChallenge,
  TEST_PHONE_CODE,
  type ChallengeInput,
} from "./otp";
import type { SessionMeta } from "./session";

// Este módulo usa `db` direto em `otp_codes` (incremento atômico de `attempts`, consumo e
// invalidação), porque o tenantScope não expressa `attempts = attempts + 1` nem devolve a
// linha do UPDATE condicional como precisamos. Exceção autorizada (Ruling 1): TODO `WHERE`
// em `otp_codes` aqui inclui `tenant_id = <tenantId recebido>`, para que um desafio de uma
// clínica nunca seja lido, verificado ou alterado a partir de outra. Pessoas passam pelo
// serviço de pessoas e pelo tenantScope. Nenhuma linha de `otp_codes` é apagada aqui: os
// limites de envio contam as linhas das últimas 24 h, e só a limpeza diária apaga.

const EXPIRED_ERROR = "Este código expirou. Peça um novo.";
const EXHAUSTED_ERROR = "Você errou o código 5 vezes. Peça um novo.";
const LIMIT_ERROR = "Muitas tentativas. Tente de novo em alguns minutos.";
const SEND_FAILED_ERROR = "Não conseguimos enviar o código agora. Tente de novo em instantes.";
const CPF_TAKEN_ERROR = "Este CPF já tem cadastro. Entre de novo com seu CPF.";
const RESEND_WAIT_ERROR = "Aguarde para pedir um novo código.";

export type EntryMeta = SessionMeta;
export type EntryDeps = { messaging: MessagingProvider; testPhones: readonly string[] };

export type CodeSent = {
  kind: "code-sent";
  challengeId: string;
  maskedPhone: string;
  channel: OtpChannel;
  resendAvailableAt: Date;
};

/** `restart = true` manda a tela de volta ao passo do CPF. */
export type EntryError = { kind: "error"; error: string; restart: boolean };

export type SignedIn = { kind: "signed-in"; personId: string; cookieValue: string; expiresAt: Date };

const challengeIdSchema = z.uuid();

function fail(error: string, restart = false): EntryError {
  return { kind: "error", error, restart };
}

function invalidInput(error: z.ZodError): EntryError {
  return fail(error.issues[0]?.message ?? "Não foi possível continuar. Tente novamente.");
}

function wrongCodeError(remaining: number): string {
  return remaining === 1
    ? "Código incorreto. Resta 1 tentativa."
    : `Código incorreto. Restam ${remaining} tentativas.`;
}

/** Condição base de toda consulta a `otp_codes` neste módulo: o desafio e a clínica. */
function challengeWhere(tenantId: string, challengeId: string) {
  return and(eq(otpCodes.id, challengeId), eq(otpCodes.tenantId, tenantId));
}

async function invalidateChallenge(db: AnyPgDatabase, tenantId: string, challengeId: string, now: Date) {
  await db
    .update(otpCodes)
    .set({ invalidatedAt: now })
    .where(and(challengeWhere(tenantId, challengeId), isNull(otpCodes.invalidatedAt)));
}

type Reservation = { blocked: true } | { blocked: false; challenge: OtpCode; code: string };

/** Grava o desafio (contando os limites). Telefone de teste recebe sempre o código fixo. */
async function reserve(
  db: AnyPgDatabase,
  input: ChallengeInput,
  deps: EntryDeps,
  now: Date,
): Promise<Reservation> {
  const code = deps.testPhones.includes(input.phone) ? TEST_PHONE_CODE : generateCode();
  const reservation = await reserveChallenge(db, input, code, now);
  return reservation.blocked ? reservation : { blocked: false, challenge: reservation.challenge, code };
}

/**
 * Envia o código do desafio já gravado. Telefone de teste não chama o provedor. Se o
 * provedor falhar, o desafio é invalidado e o erro é logado só com `describeUnexpectedError`
 * (a mensagem do provedor pode conter o telefone ou o código).
 */
async function deliver(
  db: AnyPgDatabase,
  challenge: OtpCode,
  code: string,
  channel: OtpChannel,
  deps: EntryDeps,
  now: Date,
): Promise<CodeSent | EntryError> {
  if (!deps.testPhones.includes(challenge.phone)) {
    try {
      await deps.messaging.sendOtp({ channel, recipient: challenge.phone, code });
    } catch (error) {
      console.error("[entrada] falha ao enviar o código:", describeUnexpectedError(error));
      await invalidateChallenge(db, challenge.tenantId, challenge.id, now);
      return fail(SEND_FAILED_ERROR);
    }
  }

  return {
    kind: "code-sent",
    challengeId: challenge.id,
    maskedPhone: maskPhone(challenge.phone),
    channel,
    resendAvailableAt: new Date(challenge.createdAt.getTime() + RESEND_COOLDOWN_MS),
  };
}

async function issueChallenge(
  db: AnyPgDatabase,
  input: ChallengeInput,
  deps: EntryDeps,
  now: Date,
): Promise<CodeSent | EntryError> {
  const reservation = await reserve(db, input, deps, now);
  if (reservation.blocked) return fail(LIMIT_ERROR);
  return deliver(db, reservation.challenge, reservation.code, input.channel, deps, now);
}

function loginChallenge(tenantId: string, person: Person, meta: EntryMeta): ChallengeInput {
  return {
    tenantId,
    purpose: "login",
    personId: person.id,
    phone: person.phone,
    channel: "whatsapp",
    pendingSignup: null,
    ip: meta.ip,
    userAgent: meta.userAgent,
  };
}

/** Passo do CPF: CPF cadastrado nesta clínica recebe o código no telefone cadastrado. */
export async function startEntry(
  db: AnyPgDatabase,
  tenantId: string,
  input: unknown,
  meta: EntryMeta,
  deps: EntryDeps,
  now: Date = new Date(),
): Promise<CodeSent | { kind: "needs-signup"; cpf: string } | EntryError> {
  const parsed = startEntrySchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const { cpf } = parsed.data;

  const person = await findPersonByCpf(tenantScope(db, tenantId), cpf);
  if (!person) return { kind: "needs-signup", cpf };

  return issueChallenge(db, loginChallenge(tenantId, person, meta), deps, now);
}

/**
 * Passo do cadastro: guarda os dados no desafio (`pending_signup`) até o código ser
 * confirmado. Se o CPF já existir (corrida ou formulário adulterado), age como `startEntry`:
 * o código vai para o telefone cadastrado, nunca para o digitado.
 */
export async function startSignup(
  db: AnyPgDatabase,
  tenantId: string,
  input: unknown,
  origin: LeadOriginParams,
  meta: EntryMeta,
  deps: EntryDeps,
  now: Date = new Date(),
): Promise<CodeSent | EntryError> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const { cpf, name, phone, marketing } = parsed.data;

  const existing = await findPersonByCpf(tenantScope(db, tenantId), cpf);
  if (existing) return issueChallenge(db, loginChallenge(tenantId, existing, meta), deps, now);

  return issueChallenge(
    db,
    {
      tenantId,
      purpose: "signup",
      personId: null,
      phone,
      channel: "whatsapp",
      pendingSignup: { name, cpf, phone, marketing, termsVersion: TERMS_VERSION, origin },
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
    deps,
    now,
  );
}

/**
 * Reenvio: o desafio atual precisa ser desta clínica e não consumido (pode estar
 * invalidado ou expirado: é justamente quando se pede outro). Só 60 s depois da criação.
 * Ordem: reserva o novo (se bloqueado, o atual continua valendo), invalida o atual, envia.
 */
export async function resendCode(
  db: AnyPgDatabase,
  tenantId: string,
  challengeId: string,
  input: unknown,
  meta: EntryMeta,
  deps: EntryDeps,
  now: Date = new Date(),
): Promise<CodeSent | EntryError> {
  const parsed = resendSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const { channel } = parsed.data;

  if (!challengeIdSchema.safeParse(challengeId).success) return fail(EXPIRED_ERROR);

  const [current] = await db
    .select()
    .from(otpCodes)
    .where(and(challengeWhere(tenantId, challengeId), isNull(otpCodes.consumedAt)))
    .limit(1);
  if (!current) return fail(EXPIRED_ERROR);

  if (now.getTime() < current.createdAt.getTime() + RESEND_COOLDOWN_MS) return fail(RESEND_WAIT_ERROR);

  const reservation = await reserve(
    db,
    {
      tenantId,
      purpose: current.purpose,
      personId: current.personId,
      phone: current.phone,
      channel,
      pendingSignup: current.pendingSignup,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
    deps,
    now,
  );
  if (reservation.blocked) return fail(LIMIT_ERROR);

  await invalidateChallenge(db, tenantId, current.id, now);

  return deliver(db, reservation.challenge, reservation.code, channel, deps, now);
}

/**
 * Confere o código. Incrementa `attempts` de forma atômica ANTES de comparar (só em desafio
 * desta clínica, vivo e não usado) e consome com `consumed_at IS NULL` no WHERE: de dois
 * envios simultâneos do código certo, só um consome e abre sessão; o outro vê "expirou".
 */
export async function verifyCode(
  db: AnyPgDatabase,
  tenantId: string,
  challengeId: string,
  input: unknown,
  meta: EntryMeta,
  now: Date = new Date(),
): Promise<SignedIn | EntryError> {
  const parsed = verifyCodeSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const { code } = parsed.data;

  if (!challengeIdSchema.safeParse(challengeId).success) return fail(EXPIRED_ERROR);

  const live = and(
    challengeWhere(tenantId, challengeId),
    isNull(otpCodes.consumedAt),
    isNull(otpCodes.invalidatedAt),
  );

  const [challenge] = await db
    .update(otpCodes)
    .set({ attempts: sql`${otpCodes.attempts} + 1` })
    .where(and(live, gt(otpCodes.expiresAt, now)))
    .returning();
  if (!challenge) return fail(EXPIRED_ERROR);

  const matches = codeMatches(challenge.id, code, challenge.codeHash);
  if (challenge.attempts > OTP_MAX_ATTEMPTS || (!matches && challenge.attempts >= OTP_MAX_ATTEMPTS)) {
    await invalidateChallenge(db, tenantId, challenge.id, now);
    return fail(EXHAUSTED_ERROR);
  }
  if (!matches) return fail(wrongCodeError(OTP_MAX_ATTEMPTS - challenge.attempts));

  const [consumed] = await db.update(otpCodes).set({ consumedAt: now }).where(live).returning();
  if (!consumed) return fail(EXPIRED_ERROR);

  const scope = tenantScope(db, tenantId);

  if (consumed.purpose === "login" && consumed.personId) {
    await markPhoneVerified(scope, consumed.personId, now);
    return signIn(db, { id: consumed.personId, tenantId }, meta, now);
  }

  const pending = consumed.pendingSignup;
  if (!pending) return fail(EXPIRED_ERROR, true);

  const created = await createLeadFromSignup(db, tenantId, pending, meta, now);
  if (created.ok) return signIn(db, created.person, meta, now);

  // Outra pessoa confirmou o mesmo CPF antes. Só entra se o telefone confirmado for o dela.
  const existing = await findPersonByCpf(scope, pending.cpf);
  if (!existing || existing.phone !== pending.phone) return fail(CPF_TAKEN_ERROR, true);

  await markPhoneVerified(scope, existing.id, now);
  return signIn(db, existing, meta, now);
}

async function signIn(
  db: AnyPgDatabase,
  person: Pick<Person, "id" | "tenantId">,
  meta: EntryMeta,
  now: Date,
): Promise<SignedIn> {
  const { cookieValue, expiresAt } = await createClientSession(db, person, meta, now);
  return { kind: "signed-in", personId: person.id, cookieValue, expiresAt };
}
