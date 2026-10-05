import "server-only";

import { and, eq, gt, isNull } from "drizzle-orm";

import { people, personSessions, tenants, type Person, type Tenant } from "@/server/db/schema";
import type { AnyPgDatabase } from "@/server/db/tenant-scope";

import type { SessionMeta } from "./session";
import { generateToken, hashToken, signPayload, verifyPayload } from "./token";

export const CLIENT_SESSION_COOKIE = "egc_cliente";
export const CLIENT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const CLIENT_SESSION_RENEW_BEFORE_MS = 7 * 24 * 60 * 60 * 1000;

export type ClientSession = {
  sessionId: string;
  person: Person;
  tenant: Tenant;
  expiresAt: Date;
  shouldRenew: boolean;
};

/** Cria a sessão do cliente (só o hash do token vai ao banco) e devolve o cookie assinado. */
export async function createClientSession(
  db: AnyPgDatabase,
  person: Pick<Person, "id" | "tenantId">,
  meta: SessionMeta,
  now: Date = new Date(),
): Promise<{ cookieValue: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + CLIENT_SESSION_TTL_MS);

  await db.insert(personSessions).values({
    tenantId: person.tenantId,
    personId: person.id,
    tokenHash: hashToken(token),
    expiresAt,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  const cookieValue = await signPayload({ t: token });
  return { cookieValue, expiresAt };
}

/**
 * Valida o cookie do cliente para a clínica `tenantId` (a do endereço). Roda antes de
 * existir um tenantScope, por isso consulta `person_sessions` → `people` → `tenants`
 * direto pelo `db`, com o hash do token (imprevisível) como chave. O isolamento entre
 * clínicas está no WHERE: `person_sessions.tenant_id` tem de ser igual a `tenantId`.
 * Nunca lança por cookie inválido; erro de configuração do segredo propaga.
 */
export async function validateClientSession(
  db: AnyPgDatabase,
  tenantId: string,
  cookieValue: string | undefined,
  now: Date = new Date(),
): Promise<ClientSession | null> {
  const payload = await verifyPayload(cookieValue);
  const token = payload?.t;
  if (typeof token !== "string") return null;

  const rows = await db
    .select({ session: personSessions, person: people, tenant: tenants })
    .from(personSessions)
    .innerJoin(people, eq(personSessions.personId, people.id))
    .innerJoin(tenants, eq(personSessions.tenantId, tenants.id))
    .where(
      and(
        eq(personSessions.tokenHash, hashToken(token)),
        eq(personSessions.tenantId, tenantId),
        isNull(personSessions.revokedAt),
        gt(personSessions.expiresAt, now),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const msLeft = row.session.expiresAt.getTime() - now.getTime();
  return {
    sessionId: row.session.id,
    person: row.person,
    tenant: row.tenant,
    expiresAt: row.session.expiresAt,
    shouldRenew: msLeft < CLIENT_SESSION_RENEW_BEFORE_MS,
  };
}

/** Empurra a expiração da sessão para `now + 30 dias` e devolve a nova data. */
export async function renewClientSession(
  db: AnyPgDatabase,
  sessionId: string,
  now: Date = new Date(),
): Promise<Date> {
  const expiresAt = new Date(now.getTime() + CLIENT_SESSION_TTL_MS);
  await db.update(personSessions).set({ expiresAt }).where(eq(personSessions.id, sessionId));
  return expiresAt;
}

export async function revokeClientSession(db: AnyPgDatabase, sessionId: string): Promise<void> {
  await db.update(personSessions).set({ revokedAt: new Date() }).where(eq(personSessions.id, sessionId));
}
