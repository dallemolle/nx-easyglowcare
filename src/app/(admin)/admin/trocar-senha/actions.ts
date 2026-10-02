"use server";

import { redirect } from "next/navigation";

import { refreshSessionCookie, requireStaff } from "@/server/auth/current";
import { describeUnexpectedError } from "@/server/errors";
import { changeOwnPassword, StaffError } from "@/server/services/staff";

const GENERIC_ERROR = "Não foi possível trocar a senha. Tente novamente.";

export async function changePasswordAction(input: unknown): Promise<{ error: string } | undefined> {
  const staff = await requireStaff({ allowPasswordChange: true });

  try {
    await refreshSessionCookie(staff);
    await changeOwnPassword(staff.scope, { id: staff.user.id }, staff.sessionId, input);
  } catch (error) {
    if (error instanceof StaffError) {
      return { error: error.message };
    }
    // Erro inesperado: nunca repassa detalhes ao cliente.
    console.error("[trocar-senha] erro inesperado:", describeUnexpectedError(error));
    return { error: GENERIC_ERROR };
  }

  redirect("/admin");
}
