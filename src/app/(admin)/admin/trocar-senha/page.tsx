import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { requireStaff } from "@/server/auth/current";

// Reaproveita a action de logout do painel: quem está preso aqui por `mustChangePassword`
// também precisa conseguir sair.
import { logoutAction } from "../(painel)/actions";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Trocar senha" };

export default async function TrocarSenhaPage() {
  const staff = await requireStaff({ allowPasswordChange: true });

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Trocar senha</h1>
        <form action={logoutAction}>
          <Button type="submit" variant="outline" size="sm">
            Sair
          </Button>
        </form>
      </div>
      <ChangePasswordForm mustChangePassword={staff.user.mustChangePassword} />
    </main>
  );
}
