"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHydrated } from "@/lib/use-hydrated";
import { createStaffSchema, type CreateStaffInput } from "@/lib/validation/staff";
import { ROLE_LABELS } from "@/server/auth/permissions";

import { createStaffAction } from "./actions";
import { TemporaryPasswordDialog } from "./temporary-password-dialog";

const ROLES = Object.keys(ROLE_LABELS) as CreateStaffInput["role"][];

export function CreateStaffForm() {
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateStaffInput>({
    resolver: zodResolver(createStaffSchema),
    defaultValues: { name: "", email: "", role: "reception" },
  });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await createStaffAction(data);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      reset();
      setTemporaryPassword(result.temporaryPassword ?? null);
    });
  });

  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4">
      <h2 className="text-base font-semibold">Cadastrar pessoa</h2>
      <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" autoComplete="off" aria-invalid={Boolean(errors.name)} {...register("name")} />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="off"
            aria-invalid={Boolean(errors.email)}
            {...register("email")}
          />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role">Papel</Label>
          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="role" className="w-full">
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
            )}
          />
        </div>

        <Button type="submit" disabled={!hydrated || isPending}>
          Cadastrar
        </Button>
      </form>

      <TemporaryPasswordDialog
        password={temporaryPassword}
        title="Pessoa cadastrada"
        onClose={() => setTemporaryPassword(null)}
      />
    </section>
  );
}
