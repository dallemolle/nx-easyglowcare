import type { Metadata } from "next";

import { formatDate } from "@/lib/format";
import { requirePermission } from "@/server/auth/current";
import { listStaff } from "@/server/services/staff";

import { CreateStaffForm } from "./create-staff-form";
import { StaffList } from "./staff-list";

export const metadata: Metadata = { title: "Equipe" };

export default async function EquipePage() {
  const staff = await requirePermission("staff.manage");
  // Só dados simples cruzam para os Client Components: a lista não tem hash de senha.
  const members = (await listStaff(staff.scope)).map(({ lastLoginAt, ...member }) => ({
    ...member,
    // Formatado aqui, no fuso da clínica: o mesmo texto no servidor e no navegador.
    lastLoginLabel: lastLoginAt ? formatDate(lastLoginAt, staff.tenant.timezone) : null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Equipe</h1>
      <CreateStaffForm />
      <StaffList members={members} currentUserId={staff.user.id} />
    </div>
  );
}
