import { Button } from "@/components/ui/button";
import { requireStaff } from "@/server/auth/current";
import { ROLE_LABELS } from "@/server/auth/permissions";

import { logoutAction } from "./actions";

export default async function PainelLayout({ children }: LayoutProps<"/admin">) {
  const staff = await requireStaff();

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{staff.tenant.name}</span>
          <span className="text-xs text-muted-foreground">
            {staff.user.name} · {ROLE_LABELS[staff.user.role]}
          </span>
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="outline" size="sm">
            Sair
          </Button>
        </form>
      </header>
      <main className="mx-auto flex w-full max-w-screen-sm flex-1 flex-col gap-6 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
