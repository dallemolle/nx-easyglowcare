/** Mantém só os dígitos de um texto. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Valida os dígitos verificadores de um CPF já normalizado (11 dígitos). */
export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  for (const length of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(digits[i]) * (length + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== Number(digits[length])) return false;
  }
  return true;
}

/** Remove pontuação e espaços; devolve só os números. */
export function normalizeCpf(value: string): string {
  return onlyDigits(value);
}

/** Máscara progressiva `999.999.999-99`: aceita valor parcial e corta em 11 dígitos. */
export function formatCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** CPF mascarado para exibição: `***.982.247-**`. */
export function maskCpf(digits: string): string {
  const d = onlyDigits(digits);
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}
