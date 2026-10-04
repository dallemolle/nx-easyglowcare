import { describe, expect, it } from "vitest";

import { formatBRL, formatDate, formatDuration, formatServicePrice, maskRecipient } from "./format";

// Intl em pt-BR separa "R$" do valor com espaço não separável ( ).
describe("formatBRL", () => {
  it("formata centavos como reais", () => {
    expect(formatBRL(120000)).toBe("R$ 1.200,00");
    expect(formatBRL(0)).toBe("R$ 0,00");
    expect(formatBRL(123456789)).toBe("R$ 1.234.567,89");
  });
});

describe("formatServicePrice", () => {
  it("prefixa 'a partir de' quando o preço é inicial", () => {
    expect(formatServicePrice(120000, true)).toBe("a partir de R$ 1.200,00");
  });

  it("mostra só o valor quando o preço é fechado", () => {
    expect(formatServicePrice(9990, false)).toBe("R$ 99,90");
  });
});

describe("formatDuration", () => {
  it("mostra a duração em minutos", () => {
    expect(formatDuration(60)).toBe("60 min");
    expect(formatDuration(90)).toBe("90 min");
  });
});

describe("formatDate", () => {
  it("usa o fuso informado para decidir o dia", () => {
    const instant = new Date("2026-10-03T01:30:00Z");
    expect(formatDate(instant, "America/Sao_Paulo")).toBe("02/10/2026");
    expect(formatDate(instant, "UTC")).toBe("03/10/2026");
  });
});

describe("maskRecipient", () => {
  it("telefone: mostra só os 4 últimos dígitos", () => {
    expect(maskRecipient("11987651234")).toBe("*******1234");
    expect(maskRecipient("+55 (11) 98765-1234")).toBe("*********1234");
  });

  it("e-mail: primeira letra e domínio", () => {
    expect(maskRecipient("marina@exemplo.com")).toBe("m***@exemplo.com");
  });

  it("valores curtos ou desconhecidos ficam totalmente ocultos", () => {
    expect(maskRecipient("1234")).toBe("****");
    expect(maskRecipient("12")).toBe("****");
    expect(maskRecipient("")).toBe("****");
    expect(maskRecipient("@exemplo.com")).toBe("****");
    expect(maskRecipient("assinatura-push-abc")).toBe("****");
  });
});
