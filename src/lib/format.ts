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

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/** Data `dd/MM/yyyy` no fuso informado (o do tenant), igual no servidor e no navegador. */
export function formatDate(date: Date, timeZone: string): string {
  let formatter = dateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    dateFormatters.set(timeZone, formatter);
  }
  return formatter.format(date);
}

/**
 * Destinatário para log: telefone mostra só os 4 últimos dígitos; e-mail, a primeira letra e o
 * domínio. Qualquer outro valor (curto, vazio, assinatura de push) fica totalmente oculto.
 */
export function maskRecipient(recipient: string): string {
  const at = recipient.lastIndexOf("@");
  if (at > 0) return `${recipient[0]}***${recipient.slice(at)}`;
  if (at === 0) return "****";

  const digits = recipient.replace(/\D/g, "");
  const looksLikePhone = digits.length > 4 && /^[\d\s()+-]+$/.test(recipient);
  if (!looksLikePhone) return "****";
  return "*".repeat(digits.length - 4) + digits.slice(-4);
}
