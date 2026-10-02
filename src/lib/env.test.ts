import { describe, expect, it } from "vitest";

import { getEnv } from "./env";

const base = { DATABASE_URL: "postgres://u:p@h:5432/d", SESSION_SECRET: "x".repeat(32) };

describe("getEnv", () => {
  it("exige DATABASE_URL", () => {
    expect(() => getEnv({ SESSION_SECRET: "x".repeat(32) })).toThrow(/DATABASE_URL/);
  });

  it("rejeita DATABASE_URL que não é URL", () => {
    expect(() => getEnv({ ...base, DATABASE_URL: "nao-e-url" })).toThrow(/DATABASE_URL/);
  });

  it("não expõe o valor inválido na mensagem", () => {
    expect(() => getEnv({ ...base, DATABASE_URL: "segredo-invalido" })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("segredo-invalido") }),
    );
  });

  it("usa localhost:3000 como NEXT_PUBLIC_APP_URL padrão", () => {
    expect(getEnv(base).NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("exige SESSION_SECRET", () => {
    expect(() => getEnv({ DATABASE_URL: "postgres://u:p@h:5432/d" })).toThrow(/SESSION_SECRET/);
  });

  it("rejeita SESSION_SECRET curto", () => {
    expect(() =>
      getEnv({ DATABASE_URL: "postgres://u:p@h:5432/d", SESSION_SECRET: "curta" }),
    ).toThrow(/SESSION_SECRET/);
  });

  it("aceita SESSION_SECRET com 32 caracteres", () => {
    expect(
      getEnv({ DATABASE_URL: "postgres://u:p@h:5432/d", SESSION_SECRET: "x".repeat(32) })
        .SESSION_SECRET,
    ).toHaveLength(32);
  });
});
