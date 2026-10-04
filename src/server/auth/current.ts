import "server-only";

import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/server/db/client";
import type { StaffUser, Tenant } from "@/server/db/schema";
import { tenantScope, type TenantScope } from "@/server/db/tenant-scope";
import { describeUnexpectedError } from "@/server/errors";
import { safeRecordAudit, type AuditEntry } from "@/server/services/audit";

import { login } from "./login";
import { can, type Permission } from "./permissions";
import { clientIp } from "./rate-limit";
import {
  renewSession,
  revokeSession,
  SESSION_COOKIE,
  validateSession,
  type StaffSession,
} from "./session";

const LOGIN_PATH = "/admin/login";
const CHANGE_PASSWORD_PATH = "/admin/trocar-senha";

// Único módulo (além de services/tenants.ts) autorizado a importar @/server/db/client:
// páginas, layouts, actions e componentes passam por aqui, nunca pelo `db` direto.

/** `StaffUser` sem `passwordHash`: é isso que circula para fora deste módulo. */
export type CurrentStaffUser = Omit<StaffUser, "passwordHash">;

/** Sessão da equipe autenticada. `user` nunca carrega o hash da senha (ver `CurrentStaffUser`). */
export type CurrentStaff = {
  sessionId: string;
  user: CurrentStaffUser;
  tenant: Tenant;
  scope: TenantScope;
};

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

function toCurrentStaff(session: StaffSession): CurrentStaff {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- descartado de propósito
  const { passwordHash, ...user } = session.user;
  return {
    sessionId: session.sessionId,
    user,
    tenant: session.tenant,
    scope: tenantScope(db, session.tenant.id),
  };
}

/**
 * Sessão completa (com `shouldRenew`), memoizada por request. Uso interno: `getStaff` deriva
 * o `CurrentStaff` público daqui, e `refreshSessionCookie`/`signOut` reaproveitam o mesmo
 * resultado (já validado nesta request) em vez de consultar o banco de novo.
 */
const getSession = cache(async (): Promise<StaffSession | null> => {
  const cookieValue = (await cookies()).get(SESSION_COOKIE)?.value;
  return validateSession(db, cookieValue);
});

/** Staff autenticado da request atual, ou `null`. Memoizado por request. */
export const getStaff = cache(async (): Promise<CurrentStaff | null> => {
  const session = await getSession();
  return session ? toCurrentStaff(session) : null;
});

/**
 * Exige um staff autenticado. Sem sessão, redireciona para o login. Com
 * `mustChangePassword` e sem `{ allowPasswordChange: true }`, redireciona para a troca de
 * senha obrigatória.
 */
export async function requireStaff(options?: {
  allowPasswordChange?: boolean;
}): Promise<CurrentStaff> {
  const staff = await getStaff();
  if (!staff) {
    redirect(LOGIN_PATH);
  }

  if (staff.user.mustChangePassword && !options?.allowPasswordChange) {
    redirect(CHANGE_PASSWORD_PATH);
  }

  return staff;
}

/** Exige a permissão informada; sem ela, devolve 404 (nunca revela que a rota existe). */
export async function requirePermission(permission: Permission): Promise<CurrentStaff> {
  const staff = await requireStaff();
  if (!can(staff.user.role, permission)) {
    notFound();
  }
  return staff;
}

export type StaffAuditEntry = Omit<AuditEntry, "actor" | "ip">;

/**
 * Registra no `audit_log` uma ação do staff autenticado, com o IP da request. Chamada pelas
 * Server Actions DEPOIS que a ação deu certo. Nunca lança: a ação já aconteceu.
 */
export async function recordStaffAudit(
  staff: Pick<CurrentStaff, "scope" | "user">,
  entry: StaffAuditEntry,
): Promise<void> {
  try {
    const ip = clientIp((await headers()).get("x-forwarded-for"));
    await safeRecordAudit(staff.scope, { ...entry, actor: { type: "staff", id: staff.user.id }, ip });
  } catch (error) {
    console.error(`[audit] falha ao registrar ${entry.action}:`, describeUnexpectedError(error));
  }
}

/**
 * Login da equipe: lê IP e user-agent da request e grava o cookie de sessão. Só pode ser
 * chamada de uma Server Action ou Route Handler (onde é possível gravar cookie).
 */
export async function signIn(
  input: unknown,
): Promise<{ ok: true; mustChangePassword: boolean } | { ok: false; error: string }> {
  const headerList = await headers();
  const ip = clientIp(headerList.get("x-forwarded-for"));
  const userAgent = headerList.get("user-agent");

  // Nunca dentro de db.transaction(): o limite de tentativas depende de autocommit.
  const result = await login(db, input, { ip, userAgent });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  (await cookies()).set(SESSION_COOKIE, result.cookieValue, {
    ...COOKIE_OPTIONS,
    expires: result.expiresAt,
  });

  await safeRecordAudit(tenantScope(db, result.tenantId), {
    actor: { type: "staff", id: result.staffUserId },
    action: "auth.login",
    entity: "staff_user",
    entityId: result.staffUserId,
    ip,
  });

  return { ok: true, mustChangePassword: result.mustChangePassword };
}

/** Revoga a sessão atual (se houver) e apaga o cookie. */
export async function signOut(): Promise<void> {
  const session = await getSession();
  if (session) {
    await revokeSession(db, session.sessionId);
    await safeRecordAudit(tenantScope(db, session.tenant.id), {
      actor: { type: "staff", id: session.user.id },
      action: "auth.logout",
      entity: "staff_user",
      entityId: session.user.id,
      ip: clientIp((await headers()).get("x-forwarded-for")),
    });
  }
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * Renova o cookie de sessão quando ela estiver perto de expirar (`shouldRenew`). Chamada
 * pelas Server Actions logo após `requireStaff`/`requirePermission` — nunca em uma
 * página/layout, onde não é possível gravar cookie.
 */
export async function refreshSessionCookie(staff: CurrentStaff): Promise<void> {
  const session = await getSession();
  if (!session || session.sessionId !== staff.sessionId || !session.shouldRenew) {
    return;
  }

  const expiresAt = await renewSession(db, session.sessionId);

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE)?.value;
  if (!cookieValue) return;

  cookieStore.set(SESSION_COOKIE, cookieValue, { ...COOKIE_OPTIONS, expires: expiresAt });
}
