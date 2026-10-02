import "server-only";

import { and, count, desc, eq, gt, gte } from "drizzle-orm";

import { loginAttempts } from "@/server/db/schema";
import type { AnyPgDatabase } from "@/server/db/tenant-scope";

// Roda antes de o tenant ser conhecido (login ainda não identificou o usuário): estas
// funções consultam `login_attempts` direto com `db`, sem passar por tenantScope.
// Autorizado explicitamente para rate-limit.ts e login.ts (ver constraints da tarefa).

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 20;

/** Primeiro IP de `x-forwarded-for`, ou "unknown" se ausente/vazio. */
export function clientIp(forwardedFor: string | null): string {
  if (!forwardedFor) return "unknown";
  const first = forwardedFor.split(",")[0]?.trim();
  return first ? first : "unknown";
}

export type LoginAttemptReservation = { blocked: true } | { blocked: false; attemptId: string };

/**
 * Reserva uma tentativa de login GRAVANDO a falha antes de qualquer verificação de
 * senha (que é lenta, por causa do Argon2). Isso fecha a corrida de concorrência: se a
 * tentativa só fosse gravada depois de verificar a senha, N requisições simultâneas
 * para o mesmo e-mail veriam todas a contagem zerada e todas poderiam tentar a senha —
 * o limite efetivo virava a concorrência do atacante, não 5 por e-mail / 20 por IP.
 *
 * Conta falhas na janela de 15 minutos (incluindo a linha recém-inserida): por e-mail,
 * desde o último sucesso (uma falha no EXATO instante do sucesso não conta, por isso o
 * corte é estrito nesse caso); por IP, desde o início da janela. Se algum limite
 * estourar, desfaz a própria inserção — uma tentativa bloqueada não deve alongar o
 * bloqueio — e devolve `{ blocked: true }`. Caso contrário devolve o id da linha, para
 * `completeLoginAttempt` preencher o resultado depois.
 */
export async function reserveLoginAttempt(
  db: AnyPgDatabase,
  attempt: { email: string; ip: string },
  now: Date = new Date(),
): Promise<LoginAttemptReservation> {
  const windowStart = new Date(now.getTime() - WINDOW_MS);

  const [inserted] = await db
    .insert(loginAttempts)
    .values({
      tenantId: null,
      email: attempt.email,
      ip: attempt.ip,
      succeeded: false,
      createdAt: now,
    })
    .returning({ id: loginAttempts.id });

  const [lastSuccess] = await db
    .select({ createdAt: loginAttempts.createdAt })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.email, attempt.email), eq(loginAttempts.succeeded, true)))
    .orderBy(desc(loginAttempts.createdAt))
    .limit(1);

  const emailCondition =
    lastSuccess && lastSuccess.createdAt > windowStart
      ? and(
          eq(loginAttempts.email, attempt.email),
          eq(loginAttempts.succeeded, false),
          gt(loginAttempts.createdAt, lastSuccess.createdAt),
        )
      : and(
          eq(loginAttempts.email, attempt.email),
          eq(loginAttempts.succeeded, false),
          gte(loginAttempts.createdAt, windowStart),
        );

  const [emailFailures] = await db.select({ value: count() }).from(loginAttempts).where(emailCondition);

  const [ipFailures] = await db
    .select({ value: count() })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.ip, attempt.ip),
        eq(loginAttempts.succeeded, false),
        gte(loginAttempts.createdAt, windowStart),
      ),
    );

  const blocked =
    (emailFailures?.value ?? 0) > MAX_FAILURES_PER_EMAIL || (ipFailures?.value ?? 0) > MAX_FAILURES_PER_IP;

  if (blocked) {
    await db.delete(loginAttempts).where(eq(loginAttempts.id, inserted.id));
    return { blocked: true };
  }

  return { blocked: false, attemptId: inserted.id };
}

/** Preenche o resultado final (tenant e sucesso/falha) da tentativa já reservada. */
export async function completeLoginAttempt(
  db: AnyPgDatabase,
  attemptId: string,
  result: { tenantId: string | null; succeeded: boolean },
): Promise<void> {
  await db
    .update(loginAttempts)
    .set({ tenantId: result.tenantId, succeeded: result.succeeded })
    .where(eq(loginAttempts.id, attemptId));
}
