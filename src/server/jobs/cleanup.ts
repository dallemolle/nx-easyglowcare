import "server-only";

import { and, eq, lt, or } from "drizzle-orm";

import { loginAttempts, messageOutbox, sessions } from "@/server/db/schema";
import type { AnyPgDatabase } from "@/server/db/tenant-scope";

// Limpeza de TODAS as clínicas de uma vez (e de `login_attempts` sem clínica): recebe o `db`,
// não um TenantScope. Só é chamada pelo cron (src/server/jobs/run.ts).
// `audit_log` e mensagens `failed` nunca são apagadas aqui (decisão D10 da spec do 0C).

export const AUTH_RETENTION_DAYS = 30;
export const SENT_MESSAGE_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export type CleanupResult = { loginAttempts: number; sessions: number; sentMessages: number };

/** Apaga dados pessoais antigos que não têm mais uso (e-mail e IP de tentativas, sessões mortas). */
export async function cleanupOldData(db: AnyPgDatabase, now: Date = new Date()): Promise<CleanupResult> {
  const authCutoff = new Date(now.getTime() - AUTH_RETENTION_DAYS * DAY_MS);
  const sentCutoff = new Date(now.getTime() - SENT_MESSAGE_RETENTION_DAYS * DAY_MS);

  const deletedAttempts = await db
    .delete(loginAttempts)
    .where(lt(loginAttempts.createdAt, authCutoff))
    .returning({ id: loginAttempts.id });

  const deletedSessions = await db
    .delete(sessions)
    .where(or(lt(sessions.expiresAt, authCutoff), lt(sessions.revokedAt, authCutoff)))
    .returning({ id: sessions.id });

  const deletedMessages = await db
    .delete(messageOutbox)
    .where(and(eq(messageOutbox.status, "sent"), lt(messageOutbox.sentAt, sentCutoff)))
    .returning({ id: messageOutbox.id });

  const result: CleanupResult = {
    loginAttempts: deletedAttempts.length,
    sessions: deletedSessions.length,
    sentMessages: deletedMessages.length,
  };
  console.info(
    `[cleanup] login_attempts=${result.loginAttempts} sessions=${result.sessions} sent_messages=${result.sentMessages}`,
  );
  return result;
}
