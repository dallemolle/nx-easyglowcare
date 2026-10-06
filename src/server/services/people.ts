import "server-only";

import { and, eq } from "drizzle-orm";

import { resolveLeadSource } from "@/lib/lead-origin";
import type { PendingSignup } from "@/lib/validation/entry";
import type { SessionMeta } from "@/server/auth/session";
import { people, personConsents, type Person } from "@/server/db/schema";
import { tenantScope, type AnyPgDatabase, type TenantScope } from "@/server/db/tenant-scope";
import { isUniqueViolation } from "@/server/errors";

export type ConversionReason = "appointment" | "payment" | "attendance";

export type CreateLeadResult = { ok: true; person: Person } | { ok: false; reason: "cpf-taken" };

export async function findPersonByCpf(scope: TenantScope, cpf: string): Promise<Person | null> {
  const [person] = await scope.select(people, eq(people.cpf, cpf));
  return person ?? null;
}

/**
 * Cria o lead e os consentimentos (termos e marketing) numa transação, nessa ordem.
 * CPF repetido na clínica devolve `cpf-taken`; a transação é desfeita antes do retorno.
 */
export async function createLeadFromSignup(
  db: AnyPgDatabase,
  tenantId: string,
  signup: PendingSignup,
  meta: SessionMeta,
  now: Date = new Date(),
): Promise<CreateLeadResult> {
  const { origin } = signup;

  try {
    const person = await db.transaction(async (tx) => {
      const scope = tenantScope(tx, tenantId);

      const [created] = await scope.insert(people, {
        name: signup.name,
        cpf: signup.cpf,
        phone: signup.phone,
        phoneVerifiedAt: now,
        source: resolveLeadSource(origin),
        utmSource: origin.utm_source,
        utmMedium: origin.utm_medium,
        utmCampaign: origin.utm_campaign,
        utmTerm: origin.utm_term,
        utmContent: origin.utm_content,
        ref: origin.ref,
      });

      const consent = { personId: created.id, version: signup.termsVersion, ip: meta.ip, userAgent: meta.userAgent };
      await scope.insert(personConsents, [
        { ...consent, kind: "terms", granted: true },
        { ...consent, kind: "marketing", granted: signup.marketing },
      ]);

      return created;
    });
    return { ok: true, person };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "cpf-taken" };
    throw error;
  }
}

/**
 * Marca o telefone como verificado só se o telefone cadastrado ainda for o que recebeu o
 * código (a recepção pode tê-lo trocado depois do envio). Devolve `false` quando não marcou.
 */
export async function markPhoneVerified(
  scope: TenantScope,
  personId: string,
  phone: string,
  now: Date = new Date(),
): Promise<boolean> {
  const rows = await scope.update(people, { phoneVerifiedAt: now }, eq(people.id, personId), eq(people.phone, phone));
  return rows.length > 0;
}

/**
 * Promove lead a cliente. Idempotente: se já é cliente, devolve a linha atual sem alterar nada.
 * Devolve `null` quando a pessoa não existe nesta clínica.
 */
export async function convertLeadToClient(
  scope: TenantScope,
  personId: string,
  reason: ConversionReason,
  now: Date = new Date(),
): Promise<Person | null> {
  const [updated] = await scope.update(
    people,
    { status: "client", convertedAt: now, conversionReason: reason },
    and(eq(people.id, personId), eq(people.status, "lead")),
  );
  if (updated) return updated;

  const [current] = await scope.select(people, eq(people.id, personId));
  return current ?? null;
}
