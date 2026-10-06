import { z } from "zod";
import { isValidCpf, normalizeCpf } from "@/lib/br/cpf";
import { isValidMobile, normalizePhone } from "@/lib/br/phone";
import { leadOriginParamsSchema } from "@/lib/lead-origin";

export const cpfSchema = z
  .string("CPF inválido. Confira os números.")
  .transform(normalizeCpf)
  .refine(isValidCpf, "CPF inválido. Confira os números.");

export const phoneSchema = z
  .string("Informe um celular com DDD, como (11) 98765-4321.")
  .transform(normalizePhone)
  .refine(isValidMobile, "Informe um celular com DDD, como (11) 98765-4321.");

export const nameSchema = z
  .string("Informe seu nome.")
  .trim()
  .min(2, "Informe seu nome.")
  .max(100, "Use no máximo 100 caracteres.");

export const codeSchema = z
  .string("Digite os 6 números do código.")
  .transform((value) => value.replace(/\D/g, ""))
  .refine((value) => value.length === 6, "Digite os 6 números do código.");

export const otpChannelSchema = z.enum(["whatsapp", "sms"]);
export type OtpChannel = z.infer<typeof otpChannelSchema>;

export const startEntrySchema = z.object({ cpf: cpfSchema });

export const signupSchema = z.object({
  cpf: cpfSchema,
  name: nameSchema,
  phone: phoneSchema,
  acceptTerms: z.literal(true, "Para continuar, aceite os Termos de Uso e a Política de Privacidade."),
  marketing: z.boolean().default(false),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const verifyCodeSchema = z.object({ code: codeSchema });

export const resendSchema = z.object({ channel: otpChannelSchema });

/** Dados do cadastro guardados no desafio de código até a verificação. */
export const pendingSignupSchema = z.object({
  name: z.string(),
  cpf: z.string(),
  phone: z.string(),
  marketing: z.boolean(),
  termsVersion: z.string(),
  origin: leadOriginParamsSchema,
});
export type PendingSignup = z.infer<typeof pendingSignupSchema>;
