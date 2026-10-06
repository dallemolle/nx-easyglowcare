import "server-only";

import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

import { and, count, eq, gt } from "drizzle-orm";

import { getEnv } from "@/lib/env";
import type { OtpChannel, PendingSignup } from "@/lib/validation/entry";
import { otpCodes, type OtpCode } from "@/server/db/schema";
import type { AnyPgDatabase } from "@/server/db/tenant-scope";

// Os limites de envio contam linhas de `otp_codes` por telefone e por IP ENTRE clínicas:
// o mesmo número ou IP não pode burlar o limite trocando de clínica. Por isso estas
// consultas usam `db` direto, sem tenantScope. Exceção autorizada explicitamente para
// otp.ts (ver constraints da tarefa), como em rate-limit.ts.

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const TEST_PHONE_CODE = "000000";

const MINUTE_MS = 60 * 1000;
const WINDOW_SHORT_MS = 15 * MINUTE_MS;
const WINDOW_DAY_MS = 24 * 60 * MINUTE_MS;
const MAX_PER_PHONE_SHORT = 3;
const MAX_PER_PHONE_DAY = 10;
const MAX_PER_IP_SHORT = 10;

export function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashCode(challengeId: string, code: string): string {
  return createHmac("sha256", getEnv().SESSION_SECRET).update(`${challengeId}:${code}`).digest("hex");
}

export function codeMatches(challengeId: string, code: string, codeHash: string): boolean {
  const expected = Buffer.from(hashCode(challengeId, code));
  const actual = Buffer.from(codeHash);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * O IP já usou todos os envios dos últimos 15 min (entre todas as clínicas, janela estrita,
 * mesmo limite de `reserveChallenge`)? Consultado ANTES de procurar o CPF, para que a busca de
 * CPF também fique limitada: um CPF desconhecido não grava nada, então sem isso a varredura
 * seria livre e a própria mensagem de limite revelaria quais CPFs têm cadastro.
 */
export async function isIpAtLimit(db: AnyPgDatabase, ip: string, now: Date = new Date()): Promise<boolean> {
  const [row] = await db
    .select({ value: count() })
    .from(otpCodes)
    .where(and(eq(otpCodes.ip, ip), gt(otpCodes.createdAt, new Date(now.getTime() - WINDOW_SHORT_MS))));
  return (row?.value ?? 0) >= MAX_PER_IP_SHORT;
}

export type ChallengeInput = {
  tenantId: string;
  purpose: "signup" | "login";
  personId: string | null;
  phone: string;
  channel: OtpChannel;
  pendingSignup: PendingSignup | null;
  ip: string;
  userAgent: string | null;
};

export type ChallengeReservation = { blocked: true } | { blocked: false; challenge: OtpCode };

/**
 * Reserva um desafio GRAVANDO a linha antes de contar (mesma ideia de
 * `reserveLoginAttempt`): N envios simultâneos para o mesmo telefone veriam todos a
 * contagem antiga se contassem antes de inserir. Inserindo primeiro, cada requisição
 * enxerga as linhas já confirmadas das outras, e no máximo o limite sobrevive.
 *
 * Conta por telefone (15 min e 24 h) e por IP (15 min), incluindo a linha recém-inserida
 * e entre todas as clínicas. Janela estrita: só linhas com `created_at > now - janela`.
 * Se algum limite estourar, apaga a própria linha e devolve `{ blocked: true }`.
 * Não use dentro de transação: a contagem precisa ver inserts confirmados de outras conexões.
 */
export async function reserveChallenge(
  db: AnyPgDatabase,
  input: ChallengeInput,
  code: string,
  now: Date = new Date(),
): Promise<ChallengeReservation> {
  const id = randomUUID();

  const [challenge] = await db
    .insert(otpCodes)
    .values({
      id,
      tenantId: input.tenantId,
      purpose: input.purpose,
      personId: input.personId,
      phone: input.phone,
      channel: input.channel,
      codeHash: hashCode(id, code),
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      ip: input.ip,
      userAgent: input.userAgent,
      pendingSignup: input.pendingSignup,
      createdAt: now,
    })
    .returning();

  const countSince = async (column: typeof otpCodes.phone | typeof otpCodes.ip, value: string, windowMs: number) => {
    const [row] = await db
      .select({ value: count() })
      .from(otpCodes)
      .where(and(eq(column, value), gt(otpCodes.createdAt, new Date(now.getTime() - windowMs))));
    return row?.value ?? 0;
  };

  const [phoneShort, phoneDay, ipShort] = await Promise.all([
    countSince(otpCodes.phone, input.phone, WINDOW_SHORT_MS),
    countSince(otpCodes.phone, input.phone, WINDOW_DAY_MS),
    countSince(otpCodes.ip, input.ip, WINDOW_SHORT_MS),
  ]);

  if (phoneShort > MAX_PER_PHONE_SHORT || phoneDay > MAX_PER_PHONE_DAY || ipShort > MAX_PER_IP_SHORT) {
    await db.delete(otpCodes).where(eq(otpCodes.id, id));
    return { blocked: true };
  }

  return { blocked: false, challenge };
}
