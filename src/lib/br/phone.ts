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

/** Telefone mascarado para exibição: `(11) *****-1234`. */
export function maskPhone(digits: string): string {
  const d = onlyDigits(digits);
  return `(${d.slice(0, 2)}) *****-${d.slice(-4)}`;
}
