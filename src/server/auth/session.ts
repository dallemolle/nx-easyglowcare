import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, isNull, ne } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";

import { getEnv } from "@/lib/env";
import { sessions, staffUsers, tenants, type StaffUser, type Tenant } from "@/server/db/schema";
import type { AnyPgDatabase, TenantScope } from "@/server/db/tenant-scope";

export const SESSION_COOKIE = "egc_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_RENEW_BEFORE_MS = 24 * 60 * 60 * 1000;

export type SessionMeta = { ip: string; userAgent: string | null };

export type StaffSession = {
  sessionId: string;
  user: StaffUser;
  tenant: Tenant;
  expiresAt: Date;
  shouldRenew: boolean;
};

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getEnv().SESSION_SECRET);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Cria a sessão no banco (guardando só o hash do token) e devolve o cookie assinado. */
export async function createSession(
  db: AnyPgDatabase,
  user: Pick<StaffUser, "id" | "tenantId">,
  meta: SessionMeta,
  now: Date = new Date(),
): Promise<{ cookieValue: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    tenantId: user.tenantId,
    staffUserId: user.id,
    tokenHash,
    expiresAt,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  const cookieValue = await new SignJWT({ t: token })
    .setProtectedHeader({ alg: "HS256" })
    .sign(secretKey());

  return { cookieValue, expiresAt };
}

/**
 * Valida o cookie de sessão. Roda antes de o tenant ser conhecido, por isso consulta
 * `sessions` → `staff_users` → `tenants` direto pelo `db`, usando o hash do token
 * (imprevisível) como chave — a única busca entre tenants autorizada nesta tarefa.
 * Nunca lança: cookie ausente, malformado, com assinatura inválida ou de outro
 * segredo devolvem `null`.
 */
export async function validateSession(
  db: AnyPgDatabase,
  cookieValue: string | undefined,
  now: Date = new Date(),
): Promise<StaffSession | null> {
  if (!cookieValue) return null;

  // Fora do try: um erro de configuração (ex.: SESSION_SECRET inválido) deve propagar,
  // não ser confundido com uma falha de verificação do JWT e virar "sessão inválida".
  const key = secretKey();

  let token: unknown;
  try {
    const { payload } = await jwtVerify(cookieValue, key, { algorithms: ["HS256"] });
    token = payload.t;
  } catch {
    return null;
  }
  if (typeof token !== "string") return null;

  const tokenHash = hashToken(token);

  const rows = await db
    .select({ session: sessions, user: staffUsers, tenant: tenants })
    .from(sessions)
    .innerJoin(staffUsers, eq(sessions.staffUserId, staffUsers.id))
    .innerJoin(tenants, eq(sessions.tenantId, tenants.id))
    .where(
      and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), eq(staffUsers.isActive, true)),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const msLeft = row.session.expiresAt.getTime() - now.getTime();
  if (msLeft <= 0) return null;

  return {
    sessionId: row.session.id,
    user: row.user,
    tenant: row.tenant,
    expiresAt: row.session.expiresAt,
    shouldRenew: msLeft < SESSION_RENEW_BEFORE_MS,
  };
}

/** Empurra a expiração da sessão para `now + 7 dias` e devolve a nova data. */
export async function renewSession(
  db: AnyPgDatabase,
  sessionId: string,
  now: Date = new Date(),
): Promise<Date> {
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, sessionId));
  return expiresAt;
}

export async function revokeSession(db: AnyPgDatabase, sessionId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

/** Revoga todas as sessões do staff no tenant do escopo, exceto `exceptSessionId`. */
export async function revokeUserSessions(
  scope: TenantScope,
  staffUserId: string,
  exceptSessionId?: string,
): Promise<void> {
  const condition = exceptSessionId
    ? and(eq(sessions.staffUserId, staffUserId), ne(sessions.id, exceptSessionId))
    : eq(sessions.staffUserId, staffUserId);
  await scope.update(sessions, { revokedAt: new Date() }, condition);
}
