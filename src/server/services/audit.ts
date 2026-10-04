import "server-only";

import { auditLog } from "@/server/db/schema";
import type { TenantScope } from "@/server/db/tenant-scope";
import { describeUnexpectedError } from "@/server/errors";

export const AUDIT_ACTIONS = [
  "auth.login",
  "auth.logout",
  "auth.password_changed",
  "staff.created",
  "staff.role_changed",
  "staff.deactivated",
  "staff.reactivated",
  "staff.password_reset",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditActor = { type: "staff"; id: string } | { type: "system" };

export type AuditEntry = {
  actor: AuditActor;
  action: AuditAction;
  /** Tipo do registro afetado, por exemplo `staff_user`. */
  entity: string;
  entityId?: string;
  /** Nunca senha, senha provisória, token, e-mail, CPF ou conteúdo clínico. */
  metadata?: Record<string, unknown>;
  ip?: string | null;
};

/** Grava uma linha no `audit_log` da clínica do escopo. */
export async function recordAudit(scope: TenantScope, entry: AuditEntry): Promise<void> {
  await scope.insert(auditLog, {
    actorType: entry.actor.type,
    actorId: entry.actor.type === "staff" ? entry.actor.id : null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? {},
    ip: entry.ip ?? null,
  });
}

/**
 * Versão usada nos pontos de chamada: a ação auditada já aconteceu e não há transação para
 * desfazê-la, então uma falha ao auditar vai só para o log do servidor e não é propagada.
 */
export async function safeRecordAudit(scope: TenantScope, entry: AuditEntry): Promise<void> {
  try {
    await recordAudit(scope, entry);
  } catch (error) {
    console.error(`[audit] falha ao registrar ${entry.action}:`, describeUnexpectedError(error));
  }
}
