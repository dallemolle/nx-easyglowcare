"use client";

import { format } from "date-fns";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { staffRoleSchema } from "@/lib/validation/staff";
import { ROLE_LABELS } from "@/server/auth/permissions";
import type { StaffListItem } from "@/server/services/staff";

import {
  changeRoleAction,
  resetPasswordAction,
  setActiveAction,
  type StaffActionResult,
} from "./actions";
import { TemporaryPasswordDialog } from "./temporary-password-dialog";

const ROLES = Object.keys(ROLE_LABELS) as StaffListItem["role"][];

function statusLabel(member: StaffListItem): string {
  if (!member.isActive) return "Desativado";
  if (member.mustChangePassword) return "Senha provisória";
  return "Ativo";
}

export function StaffList({
  members,
  currentUserId,
}: {
  members: StaffListItem[];
  currentUserId: string;
}) {
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Os controles do próprio usuário ficam desabilitados, mas quem protege a conta é o serviço.
  function run(action: () => Promise<StaffActionResult>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.temporaryPassword) setTemporaryPassword(result.temporaryPassword);
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">Pessoas da equipe</h2>
      <ul className="flex flex-col gap-3">
        {members.map((member) => {
          const isSelf = member.id === currentUserId;
          return (
            <li
              key={member.id}
              data-testid="staff-card"
              className="flex flex-col gap-3 rounded-xl border p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium">{member.name}</span>
                  <span className="text-sm break-all text-muted-foreground">{member.email}</span>
                </div>
                <Badge variant="secondary">{ROLE_LABELS[member.role]}</Badge>
              </div>

              <div className="flex flex-col text-sm text-muted-foreground">
                <span>{statusLabel(member)}</span>
                <span>
                  {member.lastLoginAt
                    ? `Último acesso: ${format(member.lastLoginAt, "dd/MM/yyyy")}`
                    : "Nunca acessou"}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <Select
                  value={member.role}
                  disabled={isSelf || isPending}
                  onValueChange={(value) => {
                    const role = staffRoleSchema.parse(value);
                    run(() => changeRoleAction(member.id, role));
                  }}
                >
                  <SelectTrigger className="w-full" aria-label={`Papel de ${member.name}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={isSelf || isPending}
                    onClick={() => run(() => setActiveAction(member.id, !member.isActive))}
                  >
                    {member.isActive ? "Desativar" : "Reativar"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={isSelf || isPending}
                    onClick={() => run(() => resetPasswordAction(member.id))}
                  >
                    Gerar nova senha
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <TemporaryPasswordDialog
        password={temporaryPassword}
        title="Nova senha provisória"
        onClose={() => setTemporaryPassword(null)}
      />
    </section>
  );
}
