import { describe, expect, it } from "vitest";
import { formatPhone, isValidMobile, maskPhone, normalizePhone } from "./phone";

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
