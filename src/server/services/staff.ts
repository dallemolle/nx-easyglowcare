import "server-only";

import { and, eq, ne } from "drizzle-orm";

import { changePasswordSchema } from "@/lib/validation/auth";
import { createStaffSchema } from "@/lib/validation/staff";
import { generateTemporaryPassword, hashPassword, verifyPassword } from "@/server/auth/password";
import { revokeUserSessions } from "@/server/auth/session";
import { professionals, staffUsers, type StaffRole, type StaffUser } from "@/server/db/schema";
import type { TenantScope } from "@/server/db/tenant-scope";
import { isUniqueViolation } from "@/server/errors";

const SELF_ACCOUNT_ERROR = "Você não pode alterar a sua própria conta por aqui.";
const NOT_FOUND_ERROR = "Usuário não encontrado.";
const LAST_OWNER_ERROR = "A clínica precisa de pelo menos um(a) dono(a) ativo(a).";
const DUPLICATE_EMAIL_ERROR = "Este e-mail já está em uso.";
const WRONG_PASSWORD_ERROR = "Senha atual incorreta.";

export class StaffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaffError";
  }
}

export type Actor = Pick<StaffUser, "id">;

export type StaffListItem = Pick<
  StaffUser,
  "id" | "name" | "email" | "role" | "isActive" | "mustChangePassword" | "lastLoginAt"
>;

function toListItem(user: StaffUser): StaffListItem {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
  };
}

async function requireStaffUser(scope: TenantScope, staffUserId: string): Promise<StaffUser> {
  const [user] = await scope.select(staffUsers, eq(staffUsers.id, staffUserId));
  if (!user) throw new StaffError(NOT_FOUND_ERROR);
  return user;
}

/** Impede remover o papel de dono(a) ou desativar quando ninguém mais ficaria como dono(a) ativo(a). */
async function ensureNotLastActiveOwner(scope: TenantScope, target: StaffUser): Promise<void> {
  if (target.role !== "owner") return;
  const otherActiveOwners = await scope.select(
    staffUsers,
    and(eq(staffUsers.role, "owner"), eq(staffUsers.isActive, true), ne(staffUsers.id, target.id)),
  );
  if (otherActiveOwners.length === 0) throw new StaffError(LAST_OWNER_ERROR);
}

async function ensureProfessionalLink(
  scope: TenantScope,
  user: Pick<StaffUser, "id" | "name">,
): Promise<void> {
  const [existing] = await scope.select(professionals, eq(professionals.staffUserId, user.id));
  if (existing) return;
  await scope.insert(professionals, { staffUserId: user.id, displayName: user.name });
}

/** Todos os usuários do tenant do escopo, ordenados por nome, sem o hash da senha. */
export async function listStaff(scope: TenantScope): Promise<StaffListItem[]> {
  const users = await scope.select(staffUsers);
  return users.toSorted((a, b) => a.name.localeCompare(b.name, "pt-BR")).map(toListItem);
}

/**
 * Cadastra um usuário da equipe com senha provisória (`mustChangePassword = true`).
 * Se o papel for `professional`, cria também o `professionals` vinculado — sem
 * transação (o escopo não tem uma): se esse segundo insert falhar, o usuário fica
 * sem profissional vinculado.
 */
export async function createStaff(
  scope: TenantScope,
  input: unknown,
): Promise<{ user: StaffListItem; temporaryPassword: string }> {
  const parsed = createStaffSchema.safeParse(input);
  if (!parsed.success) throw new StaffError(parsed.error.issues[0].message);
  const { name, email, role } = parsed.data;

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  let user: StaffUser;
  try {
    [user] = await scope.insert(staffUsers, {
      name,
      email,
      passwordHash,
      role,
      mustChangePassword: true,
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new StaffError(DUPLICATE_EMAIL_ERROR);
    throw error;
  }

  if (role === "professional") {
    await scope.insert(professionals, { staffUserId: user.id, displayName: user.name });
  }

  return { user: toListItem(user), temporaryPassword };
}

/** Muda o papel de outro usuário da equipe; cria o `professionals` vinculado ao virar `professional`. */
export async function changeStaffRole(
  scope: TenantScope,
  actor: Actor,
  staffUserId: string,
  role: StaffRole,
): Promise<{ previousRole: StaffRole }> {
  if (staffUserId === actor.id) throw new StaffError(SELF_ACCOUNT_ERROR);
  const target = await requireStaffUser(scope, staffUserId);

  if (role !== "owner") await ensureNotLastActiveOwner(scope, target);

  await scope.update(staffUsers, { role }, eq(staffUsers.id, staffUserId));

  if (role === "professional") await ensureProfessionalLink(scope, target);

  return { previousRole: target.role };
}

/** Ativa/desativa outro usuário da equipe; desativar revoga todas as sessões dele. */
export async function setStaffActive(
  scope: TenantScope,
  actor: Actor,
  staffUserId: string,
  isActive: boolean,
): Promise<void> {
  if (staffUserId === actor.id) throw new StaffError(SELF_ACCOUNT_ERROR);
  const target = await requireStaffUser(scope, staffUserId);

  if (!isActive) await ensureNotLastActiveOwner(scope, target);

  await scope.update(staffUsers, { isActive }, eq(staffUsers.id, staffUserId));

  if (!isActive) await revokeUserSessions(scope, staffUserId);
}

/** Gera uma nova senha provisória para outro usuário da equipe e revoga as sessões dele. */
export async function resetStaffPassword(
  scope: TenantScope,
  actor: Actor,
  staffUserId: string,
): Promise<{ temporaryPassword: string }> {
  if (staffUserId === actor.id) throw new StaffError(SELF_ACCOUNT_ERROR);
  await requireStaffUser(scope, staffUserId);

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  await scope.update(
    staffUsers,
    { passwordHash, mustChangePassword: true },
    eq(staffUsers.id, staffUserId),
  );
  await revokeUserSessions(scope, staffUserId);

  return { temporaryPassword };
}

/** Troca a própria senha. Mantém a sessão atual e revoga as demais. */
export async function changeOwnPassword(
  scope: TenantScope,
  actor: Actor,
  currentSessionId: string,
  input: unknown,
): Promise<void> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) throw new StaffError(parsed.error.issues[0].message);
  const { currentPassword, newPassword } = parsed.data;

  const [user] = await scope.select(staffUsers, eq(staffUsers.id, actor.id));
  if (!user) throw new StaffError(NOT_FOUND_ERROR);

  const passwordOk = await verifyPassword(user.passwordHash, currentPassword);
  if (!passwordOk) throw new StaffError(WRONG_PASSWORD_ERROR);

  const passwordHash = await hashPassword(newPassword);
  await scope.update(staffUsers, { passwordHash, mustChangePassword: false }, eq(staffUsers.id, actor.id));

  await revokeUserSessions(scope, actor.id, currentSessionId);
}
