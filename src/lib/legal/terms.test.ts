import { describe, expect, it } from "vitest";

import { privacyPolicy, TERMS_VERSION, termsOfUse } from "./terms";

const CLINIC = "Clínica Aurora";

describe("textos legais", () => {
  it("a versão atual é v1", () => {
    expect(TERMS_VERSION).toBe("v1");
  });

  it.each([
    ["termos de uso", termsOfUse],
    ["política de privacidade", privacyPolicy],
  ])("%s citam o nome da clínica", (_nome, build) => {
    const text = JSON.stringify(build(CLINIC));
    expect(text).toContain(CLINIC);
  });

  it("o código de acesso vai por WhatsApp ou SMS", () => {
    const section = termsOfUse(CLINIC).find((s) => s.title === "Cadastro e código de acesso");
    expect(section?.paragraphs.join(" ")).toContain("por WhatsApp ou SMS");
  });

  it.each([
    ["termos de uso", termsOfUse],
    ["política de privacidade", privacyPolicy],
  ])("%s não têm seção vazia", (_nome, build) => {
    const sections = build(CLINIC);
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      expect(section.title.trim()).not.toBe("");
      expect(section.paragraphs.length).toBeGreaterThan(0);
      for (const paragraph of section.paragraphs) expect(paragraph.trim()).not.toBe("");
    }
  });
});
