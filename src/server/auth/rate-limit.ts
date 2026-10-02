import "server-only";

import { and, count, desc, eq, gte } from "drizzle-orm";

import { loginAttempts } from "@/server/db/schema";
import type { AnyPgDatabase } from "@/server/db/tenant-scope";

// Roda antes de o tenant ser conhecido (login ainda não identificou o usuário): esta
// função consulta `login_attempts` direto com `db`, sem passar por tenantScope.
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

/**
 * Bloqueado quando, na janela de 15 minutos, há 5+ falhas para o e-mail desde o
 * último sucesso, ou 20+ falhas para o IP.
 */
export async function isLoginBlocked(
  db: AnyPgDatabase,
  email: string,
  ip: string,
  now: Date = new Date(),
): Promise<boolean> {
  const windowStart = new Date(now.getTime() - WINDOW_MS);

  const [lastSuccess] = await db
    .select({ createdAt: loginAttempts.createdAt })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.email, email), eq(loginAttempts.succeeded, true)))
    .orderBy(desc(loginAttempts.createdAt))
    .limit(1);

  const emailSince =
    lastSuccess && lastSuccess.createdAt > windowStart ? lastSuccess.createdAt : windowStart;

  const [emailFailures] = await db
    .select({ value: count() })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.email, email),
        eq(loginAttempts.succeeded, false),
        gte(loginAttempts.createdAt, emailSince),
      ),
    );

  if ((emailFailures?.value ?? 0) >= MAX_FAILURES_PER_EMAIL) return true;

  const [ipFailures] = await db
    .select({ value: count() })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.ip, ip),
        eq(loginAttempts.succeeded, false),
        gte(loginAttempts.createdAt, windowStart),
      ),
    );

  return (ipFailures?.value ?? 0) >= MAX_FAILURES_PER_IP;
}

/** Grava uma tentativa de login (sucesso ou falha) para fins de limite de tentativas. */
export async function recordLoginAttempt(
  db: AnyPgDatabase,
  attempt: { tenantId: string | null; email: string; ip: string; succeeded: boolean },
  now: Date = new Date(),
): Promise<void> {
  await db.insert(loginAttempts).values({
    tenantId: attempt.tenantId,
    email: attempt.email,
    ip: attempt.ip,
    succeeded: attempt.succeeded,
    createdAt: now,
  });
}
