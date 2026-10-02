import "server-only";

import { eq } from "drizzle-orm";

import { loginSchema } from "@/lib/validation/auth";
import { staffUsers } from "@/server/db/schema";
import type { AnyPgDatabase } from "@/server/db/tenant-scope";

import { DUMMY_PASSWORD_HASH, verifyPassword } from "./password";
import { isLoginBlocked, recordLoginAttempt } from "./rate-limit";
import { createSession, type SessionMeta } from "./session";

const INVALID_CREDENTIALS_ERROR = "E-mail ou senha incorretos.";
const BLOCKED_ERROR = "Muitas tentativas. Tente novamente em alguns minutos.";

export type LoginResult =
  | { ok: true; cookieValue: string; expiresAt: Date; mustChangePassword: boolean }
  | { ok: false; error: string };

// Roda antes de o tenant ser conhecido (é o login quem descobre o tenant do usuário),
// por isso consulta `staff_users` direto com `db`, sem passar por tenantScope.
// Autorizado explicitamente para login.ts e rate-limit.ts (ver constraints da tarefa).

/**
 * Login da equipe. Ordem importa por segurança: checa o limite de tentativas antes de
 * olhar a senha; para e-mail inexistente, verifica a senha contra um hash falso fixo
 * para igualar o tempo de resposta; e-mail inexistente, senha errada e usuário
 * desativado devolvem a mesma mensagem.
 */
export async function login(
  db: AnyPgDatabase,
  input: unknown,
  meta: SessionMeta,
  now: Date = new Date(),
): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: INVALID_CREDENTIALS_ERROR };
  }
  const { email, password } = parsed.data;

  if (await isLoginBlocked(db, email, meta.ip, now)) {
    return { ok: false, error: BLOCKED_ERROR };
  }

  const [user] = await db.select().from(staffUsers).where(eq(staffUsers.email, email)).limit(1);

  const passwordOk = await verifyPassword(user ? user.passwordHash : DUMMY_PASSWORD_HASH, password);
  const succeeded = Boolean(user) && user.isActive && passwordOk;

  await recordLoginAttempt(db, { tenantId: user?.tenantId ?? null, email, ip: meta.ip, succeeded }, now);

  if (!succeeded || !user) {
    return { ok: false, error: INVALID_CREDENTIALS_ERROR };
  }

  await db.update(staffUsers).set({ lastLoginAt: now }).where(eq(staffUsers.id, user.id));

  const { cookieValue, expiresAt } = await createSession(db, user, meta, now);

  return { ok: true, cookieValue, expiresAt, mustChangePassword: user.mustChangePassword };
}
