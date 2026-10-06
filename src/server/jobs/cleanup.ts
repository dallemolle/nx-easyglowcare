import "server-only";

import { and, eq, lt, or } from "drizzle-orm";

import { loginAttempts, messageOutbox, otpCodes, personSessions, sessions } from "@/server/db/schema";
import type { AnyPgDatabase } from "@/server/db/tenant-scope";

// Limpeza de TODAS as clínicas de uma vez (e de `login_attempts` sem clínica): recebe o `db`,
// não um TenantScope. Só é chamada pelo cron (src/server/jobs/run.ts).
// `audit_log` e mensagens `failed` nunca são apagadas aqui (decisão D10 da spec do 0C).

export const AUTH_RETENTION_DAYS = 30;
export const SENT_MESSAGE_RETENTION_DAYS = 90;
export const OTP_RETENTION_HOURS = 24;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export type CleanupResult = {
  loginAttempts: number;
  sessions: number;
  personSessions: number;
  otpCodes: number;
  sentMessages: number;
};

/** Apaga dados pessoais antigos que não têm mais uso (e-mail e IP de tentativas, sessões mortas, códigos OTP, sessões de cliente). */
export async function cleanupOldData(db: AnyPgDatabase, now: Date = new Date()): Promise<CleanupResult> {
  const authCutoff = new Date(now.getTime() - AUTH_RETENTION_DAYS * DAY_MS);
  const sentCutoff = new Date(now.getTime() - SENT_MESSAGE_RETENTION_DAYS * DAY_MS);
  const otpCutoff = new Date(now.getTime() - OTP_RETENTION_HOURS * HOUR_MS);

  const deletedAttempts = await db
    .delete(loginAttempts)
    .where(lt(loginAttempts.createdAt, authCutoff))
    .returning({ id: loginAttempts.id });

  const deletedSessions = await db
    .delete(sessions)
    .where(or(lt(sessions.expiresAt, authCutoff), lt(sessions.revokedAt, authCutoff)))
    .returning({ id: sessions.id });

  const deletedPersonSessions = await db
    .delete(personSessions)
    .where(or(lt(personSessions.expiresAt, authCutoff), lt(personSessions.revokedAt, authCutoff)))
    .returning({ id: personSessions.id });

  const deletedOtpCodes = await db
    .delete(otpCodes)
    .where(lt(otpCodes.createdAt, otpCutoff))
    .returning({ id: otpCodes.id });

  const deletedMessages = await db
    .delete(messageOutbox)
    .where(and(eq(messageOutbox.status, "sent"), lt(messageOutbox.sentAt, sentCutoff)))
    .returning({ id: messageOutbox.id });

  const result: CleanupResult = {
    loginAttempts: deletedAttempts.length,
    sessions: deletedSessions.length,
    personSessions: deletedPersonSessions.length,
    otpCodes: deletedOtpCodes.length,
    sentMessages: deletedMessages.length,
  };
  console.info(
    `[cleanup] login_attempts=${result.loginAttempts} sessions=${result.sessions} person_sessions=${result.personSessions} otp_codes=${result.otpCodes} sent_messages=${result.sentMessages}`,
  );
  return result;
}
