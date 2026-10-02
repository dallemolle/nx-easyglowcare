"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { staffRoleSchema } from "@/lib/validation/staff";
import { refreshSessionCookie, requirePermission, type CurrentStaff } from "@/server/auth/current";
import { describeUnexpectedError } from "@/server/errors";
import {
  changeStaffRole,
  createStaff,
  resetStaffPassword,
  setStaffActive,
  StaffError,
} from "@/server/services/staff";

export type StaffActionResult =
  | { ok: true; temporaryPassword?: string }
  | { ok: false; error: string };

const INVALID_INPUT: StaffActionResult = { ok: false, error: "Dados inválidos." };
const GENERIC_ERROR = "Não foi possível concluir. Tente novamente.";

const idSchema = z.uuid();
const activeSchema = z.boolean();

/**
 * Executa a mutação já autorizada: renova o cookie, converte `StaffError` em mensagem pronta
 * e esconde qualquer outro erro (só nome e código do driver vão para o log).
 */
async function run(
  staff: CurrentStaff,
  mutate: () => Promise<{ temporaryPassword?: string } | void>,
): Promise<StaffActionResult> {
  try {
    const result = await mutate();
    await refreshSessionCookie(staff);
    revalidatePath("/admin/equipe");
    return result?.temporaryPassword
      ? { ok: true, temporaryPassword: result.temporaryPassword }
      : { ok: true };
  } catch (error) {
    if (error instanceof StaffError) return { ok: false, error: error.message };
    console.error("[equipe] erro inesperado:", describeUnexpectedError(error));
    return { ok: false, error: GENERIC_ERROR };
  }
}

// A permissão é checada ANTES de ler qualquer argumento: tudo que vem do cliente é não confiável.

export async function createStaffAction(input: unknown): Promise<StaffActionResult> {
  const staff = await requirePermission("staff.manage");
  return run(staff, async () => {
    const { temporaryPassword } = await createStaff(staff.scope, input);
    return { temporaryPassword };
  });
}

export async function changeRoleAction(id: unknown, role: unknown): Promise<StaffActionResult> {
  const staff = await requirePermission("staff.manage");
  const parsedId = idSchema.safeParse(id);
  const parsedRole = staffRoleSchema.safeParse(role);
  if (!parsedId.success || !parsedRole.success) return INVALID_INPUT;
  return run(staff, () => changeStaffRole(staff.scope, staff.user, parsedId.data, parsedRole.data));
}

export async function setActiveAction(id: unknown, isActive: unknown): Promise<StaffActionResult> {
  const staff = await requirePermission("staff.manage");
  const parsedId = idSchema.safeParse(id);
  const parsedActive = activeSchema.safeParse(isActive);
  if (!parsedId.success || !parsedActive.success) return INVALID_INPUT;
  return run(staff, () => setStaffActive(staff.scope, staff.user, parsedId.data, parsedActive.data));
}

export async function resetPasswordAction(id: unknown): Promise<StaffActionResult> {
  const staff = await requirePermission("staff.manage");
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return INVALID_INPUT;
  return run(staff, () => resetStaffPassword(staff.scope, staff.user, parsedId.data));
}
