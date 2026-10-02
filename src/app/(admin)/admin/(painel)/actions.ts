"use server";

import { redirect } from "next/navigation";

import { requireStaff, signOut } from "@/server/auth/current";

// `allowPasswordChange: true` porque esta action também é usada pelo botão "Sair" da tela de
// troca de senha obrigatória — sem isso, quem está preso em /admin/trocar-senha não
// conseguiria sair.
export async function logoutAction(): Promise<void> {
  await requireStaff({ allowPasswordChange: true });
  await signOut();
  redirect("/admin/login");
}
