"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { passwordSchema } from "@/lib/validation/auth";

import { changePasswordAction } from "./actions";

// `changePasswordSchema` (lib/validation/auth.ts) não tem campo de confirmação e é um
// ZodEffects (por causa do .refine), então não dá para `.extend()` nele. Construímos aqui um
// schema próprio do formulário, reaproveitando `passwordSchema` para a nova senha — sem mudar
// o formato do schema compartilhado.
const formSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual."),
    newPassword: passwordSchema,
    confirmNewPassword: z.string().min(1, "Confirme a nova senha."),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "As senhas não conferem.",
    path: ["confirmNewPassword"],
  });

type FormValues = z.infer<typeof formSchema>;

export function ChangePasswordForm({ mustChangePassword }: { mustChangePassword: boolean }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const onSubmit = handleSubmit((data) => {
    setServerError(null);
    startTransition(async () => {
      const result = await changePasswordAction({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      if (result?.error) setServerError(result.error);
    });
  });

  return (
    <div className="flex flex-col gap-4">
      {mustChangePassword && (
        <p className="text-sm text-muted-foreground">Crie uma senha sua para continuar.</p>
      )}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currentPassword">Senha atual</Label>
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.currentPassword)}
            {...register("currentPassword")}
          />
          {errors.currentPassword && (
            <p className="text-sm text-destructive">{errors.currentPassword.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="newPassword">Nova senha</Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.newPassword)}
            {...register("newPassword")}
          />
          {errors.newPassword && (
            <p className="text-sm text-destructive">{errors.newPassword.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirmNewPassword">Confirmar nova senha</Label>
          <Input
            id="confirmNewPassword"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.confirmNewPassword)}
            {...register("confirmNewPassword")}
          />
          {errors.confirmNewPassword && (
            <p className="text-sm text-destructive">{errors.confirmNewPassword.message}</p>
          )}
        </div>

        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}

        <Button type="submit" disabled={isPending} className="mt-2">
          Salvar nova senha
        </Button>
      </form>
    </div>
  );
}
