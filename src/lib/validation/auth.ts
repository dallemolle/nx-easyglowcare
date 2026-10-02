import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .max(254, "E-mail inválido.")
  .toLowerCase()
  .pipe(z.email("E-mail inválido."));

export const passwordSchema = z
  .string()
  .min(10, "A senha deve ter ao menos 10 caracteres.")
  .max(128, "A senha deve ter no máximo 128 caracteres.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe a senha.").max(128, "A senha deve ter no máximo 128 caracteres."),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual.").max(128, "A senha deve ter no máximo 128 caracteres."),
    newPassword: passwordSchema,
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "A nova senha deve ser diferente da atual.",
    path: ["newPassword"],
  });
