import Link from "next/link";

import { requireStaff } from "@/server/auth/current";
import { can } from "@/server/auth/permissions";

export default async function AdminPage() {
  const staff = await requireStaff();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Olá, {staff.user.name}</h1>
      {can(staff.user.role, "staff.manage") && (
        <Link href="/admin/equipe" className="text-sm underline underline-offset-4">
          Equipe
        </Link>
      )}
    </div>
  );
}
