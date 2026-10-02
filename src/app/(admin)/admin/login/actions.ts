"use server";

import { redirect } from "next/navigation";

import { signIn } from "@/server/auth/current";

// Única Server Action sem requireStaff/requirePermission: é ela quem autentica.
export async function loginAction(input: unknown): Promise<{ error: string } | undefined> {
  const result = await signIn(input);
  if (!result.ok) {
    return { error: result.error };
  }

  redirect(result.mustChangePassword ? "/admin/trocar-senha" : "/admin");
}
