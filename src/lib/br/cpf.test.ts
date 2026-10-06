import { describe, expect, it } from "vitest";
import { formatCpf, isValidCpf, maskCpf, normalizeCpf } from "./cpf";

describe("cpf", () => {
  it("valida dígitos verificadores", () => {
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("11144477735")).toBe(true);
    expect(isValidCpf("52998224724")).toBe(false);
    expect(isValidCpf("5299822472")).toBe(false);
  });

  it("recusa sequências repetidas", () => {
    for (let d = 0; d <= 9; d++) expect(isValidCpf(String(d).repeat(11))).toBe(false);
  });

  it("normaliza e formata", () => {
    expect(normalizeCpf(" 529.982.247-25 ")).toBe("52998224725");
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
    expect(formatCpf("5299")).toBe("529.9");
    expect(formatCpf("5299822")).toBe("529.982.2");
    expect(formatCpf("529982247251234")).toBe("529.982.247-25");
  });

  it("mascara", () => {
    expect(maskCpf("52998224725")).toBe("***.982.247-**");
  });
});
