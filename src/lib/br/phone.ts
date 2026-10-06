import { onlyDigits } from "./cpf";

/** Celular brasileiro: 11 dígitos, DDD de 11 a 99 e nono dígito 9. */
export function isValidMobile(digits: string): boolean {
  return /^[1-9][1-9]9\d{8}$/.test(digits);
}

/** Só dígitos; remove o código do país (55) quando sobram 13 dígitos. */
export function normalizePhone(value: string): string {
  const d = onlyDigits(value);
  return d.length === 13 && d.startsWith("55") ? d.slice(2) : d;
}

/** Máscara progressiva `(99) 99999-9999`: aceita valor parcial. */
export function formatPhone(value: string): string {
  const d = normalizePhone(value).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Número para link do WhatsApp (`https://wa.me/<número>`): telefone com DDD (10 ou 11 dígitos)
 * ganha o 55 do Brasil. Ausente ou com outra quantidade de dígitos: `null` (link escondido).
 */
export function whatsAppNumber(phone: string | null | undefined): string | null {
  const d = onlyDigits(phone ?? "");
  return d.length === 10 || d.length === 11 ? `55${d}` : null;
}

/** Telefone mascarado para exibição: `(11) *****-1234`. */
export function maskPhone(digits: string): string {
  const d = onlyDigits(digits);
  return `(${d.slice(0, 2)}) *****-${d.slice(-4)}`;
}
