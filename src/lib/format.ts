const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Formata um valor em centavos como moeda brasileira (ex.: 120000 → "R$ 1.200,00"). */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

/** Preço de serviço; `isFrom` indica preço inicial ("a partir de"). */
export function formatServicePrice(cents: number, isFrom: boolean): string {
  const value = formatBRL(cents);
  return isFrom ? `a partir de ${value}` : value;
}

export function formatDuration(minutes: number): string {
  return `${minutes} min`;
}
