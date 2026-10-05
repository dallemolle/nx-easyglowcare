import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./return-path";

describe("safeReturnPath", () => {
  it("aceita caminhos da própria clínica", () => {
    expect(safeReturnPath("easyglowcare", "/easyglowcare/minha-conta")).toBe("/easyglowcare/minha-conta");
    expect(safeReturnPath("easyglowcare", "/easyglowcare")).toBe("/easyglowcare");
  });

  it("recusa o que é inseguro", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "//evil.com",
      "https://evil.com",
      "/\\evil.com",
      "/easyglowcare/\\evil.com",
      "/outra/minha-conta",
      "/easyglowcare/../admin",
      "/easyglowcarex",
      "/easyglowcare/entrar",
    ]) {
      expect(safeReturnPath("easyglowcare", bad)).toBe("/easyglowcare/minha-conta");
    }
  });
});
