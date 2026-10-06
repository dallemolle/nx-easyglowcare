import { describe, expect, it } from "vitest";

import { canonicalTenantPath } from "./tenant-path";

describe("canonicalTenantPath", () => {
  it("slug já canônico: null (nada a redirecionar)", () => {
    expect(canonicalTenantPath("easyglowcare", "easyglowcare", "/entrar", { voltar: "/easyglowcare" })).toBeNull();
  });

  it("slug com maiúsculas: troca pelo canônico e mantém o resto do caminho", () => {
    expect(canonicalTenantPath("EasyGlowCare", "easyglowcare", "/entrar", {})).toBe("/easyglowcare/entrar");
    expect(canonicalTenantPath("EasyGlowCare", "easyglowcare", "", {})).toBe("/easyglowcare");
  });

  it("mantém a query (voltar, utm, valores repetidos) com o encoding certo", () => {
    expect(
      canonicalTenantPath("EASYGLOWCARE", "easyglowcare", "/entrar", {
        voltar: "/easyglowcare/minha-conta",
        utm_source: "instagram",
        ref: ["a", "b"],
        vazio: undefined,
      }),
    ).toBe("/easyglowcare/entrar?voltar=%2Feasyglowcare%2Fminha-conta&utm_source=instagram&ref=a&ref=b");
  });
});
