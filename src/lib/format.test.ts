import { describe, expect, it } from "vitest";

import { formatBRL, formatDuration, formatServicePrice } from "./format";

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
