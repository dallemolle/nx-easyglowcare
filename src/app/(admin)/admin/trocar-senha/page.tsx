import type { Metadata } from "next";

import { requireStaff } from "@/server/auth/current";

import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Trocar senha" };

export default async function TrocarSenhaPage() {
  const staff = await requireStaff({ allowPasswordChange: true });

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-8">
      <h1 className="text-xl font-semibold">Trocar senha</h1>
      <ChangePasswordForm mustChangePassword={staff.user.mustChangePassword} />
    </main>
  );
}
