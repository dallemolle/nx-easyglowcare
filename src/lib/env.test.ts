import { describe, expect, it } from "vitest";

import { getEnv } from "./env";

describe("getEnv", () => {
  it("exige DATABASE_URL", () => {
    expect(() => getEnv({})).toThrow(/DATABASE_URL/);
  });

  it("rejeita DATABASE_URL que não é URL", () => {
    expect(() => getEnv({ DATABASE_URL: "nao-e-url" })).toThrow(/DATABASE_URL/);
  });

  it("não expõe o valor inválido na mensagem", () => {
    expect(() => getEnv({ DATABASE_URL: "segredo-invalido" })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("segredo-invalido") }),
    );
  });

  it("usa localhost:3000 como NEXT_PUBLIC_APP_URL padrão", () => {
    expect(getEnv({ DATABASE_URL: "postgres://u:p@h:5432/d" }).NEXT_PUBLIC_APP_URL).toBe(
      "http://localhost:3000",
    );
  });
});
