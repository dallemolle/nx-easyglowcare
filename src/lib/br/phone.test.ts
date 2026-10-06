import { describe, expect, it } from "vitest";
import { formatPhone, isValidMobile, maskPhone, normalizePhone, whatsAppNumber } from "./phone";

describe("whatsAppNumber", () => {
  it("prefixa 55 em telefone com DDD (10 ou 11 dígitos)", () => {
    expect(whatsAppNumber("11999990000")).toBe("5511999990000");
    expect(whatsAppNumber("(11) 3333-4444")).toBe("551133334444");
  });

  it("sem telefone ou com outra quantidade de dígitos: null", () => {
    expect(whatsAppNumber(null)).toBeNull();
    expect(whatsAppNumber(undefined)).toBeNull();
    expect(whatsAppNumber("")).toBeNull();
    expect(whatsAppNumber("3333-4444")).toBeNull();
    expect(whatsAppNumber("+55 11 99999-0000")).toBeNull();
  });
});

describe("phone", () => {
  it("valida celular com DDD", () => {
    expect(isValidMobile("11987654321")).toBe(true);
    expect(isValidMobile("1187654321")).toBe(false);
    expect(isValidMobile("11887654321")).toBe(false);
    expect(isValidMobile("01987654321")).toBe(false);
  });

  it("normaliza", () => {
    expect(normalizePhone("(11) 98765-4321")).toBe("11987654321");
    expect(normalizePhone("+55 11 98765-4321")).toBe("11987654321");
  });

  it("formata e mascara", () => {
    expect(formatPhone("11987654321")).toBe("(11) 98765-4321");
    expect(formatPhone("119")).toBe("(11) 9");
    expect(maskPhone("11987651234")).toBe("(11) *****-1234");
  });
});
