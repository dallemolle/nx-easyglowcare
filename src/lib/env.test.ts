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

  it("CRON_SECRET é opcional e vazio conta como ausente", () => {
    expect(getEnv(base).CRON_SECRET).toBeUndefined();
    expect(getEnv({ ...base, CRON_SECRET: "" }).CRON_SECRET).toBeUndefined();
  });

  it("rejeita CRON_SECRET com menos de 16 caracteres", () => {
    expect(() => getEnv({ ...base, CRON_SECRET: "x".repeat(15) })).toThrow(/CRON_SECRET/);
  });

  it("aceita CRON_SECRET com 16 caracteres", () => {
    expect(getEnv({ ...base, CRON_SECRET: "x".repeat(16) }).CRON_SECRET).toHaveLength(16);
  });

  it("aceita SESSION_SECRET com 32 caracteres", () => {
    expect(
      getEnv({ DATABASE_URL: "postgres://u:p@h:5432/d", SESSION_SECRET: "x".repeat(32) })
        .SESSION_SECRET,
    ).toHaveLength(32);
  });

  it("OTP_TEST_PHONES é ausente por padrão", () => {
    expect(getEnv(base).OTP_TEST_PHONES).toEqual([]);
  });

  it("OTP_TEST_PHONES vazio conta como ausente", () => {
    expect(getEnv({ ...base, OTP_TEST_PHONES: "" }).OTP_TEST_PHONES).toEqual([]);
  });

  it("OTP_TEST_PHONES aceita celulares válidos separados por vírgula", () => {
    expect(
      getEnv({ ...base, OTP_TEST_PHONES: "11900000001, 11900000002" }).OTP_TEST_PHONES,
    ).toEqual(["11900000001", "11900000002"]);
  });

  it("OTP_TEST_PHONES rejeita celular inválido", () => {
    expect(() => getEnv({ ...base, OTP_TEST_PHONES: "1190000" })).toThrow(/OTP_TEST_PHONES/);
  });

  it("OTP_TEST_PHONES é aceito em preview", () => {
    expect(
      getEnv({ ...base, VERCEL_ENV: "preview", OTP_TEST_PHONES: "11900000001" })
        .OTP_TEST_PHONES,
    ).toHaveLength(1);
  });

  it("OTP_TEST_PHONES é proibido em produção", () => {
    expect(() =>
      getEnv({ ...base, VERCEL_ENV: "production", OTP_TEST_PHONES: "11900000001" }),
    ).toThrow(/OTP_TEST_PHONES.*produção/);
  });

  it("OTP_TEST_PHONES é permitido vazio em produção", () => {
    expect(getEnv({ ...base, VERCEL_ENV: "production" }).OTP_TEST_PHONES).toEqual([]);
  });

  it("VERCEL_ENV é opcional", () => {
    expect(getEnv(base).VERCEL_ENV).toBeUndefined();
  });

  it("VERCEL_ENV aceita production, preview e development", () => {
    expect(getEnv({ ...base, VERCEL_ENV: "production" }).VERCEL_ENV).toBe("production");
    expect(getEnv({ ...base, VERCEL_ENV: "preview" }).VERCEL_ENV).toBe("preview");
    expect(getEnv({ ...base, VERCEL_ENV: "development" }).VERCEL_ENV).toBe("development");
  });

  // --- Testes de mutação (verificam se as proteções funcionam) ---

  it("mutação: rejeita todos os tipos de celulares inválidos", () => {
    // DDD inválido (menor que 11)
    expect(() => getEnv({ ...base, OTP_TEST_PHONES: "10900000001" })).toThrow(/OTP_TEST_PHONES/);
    // Falta o 9 no 4º dígito
    expect(() => getEnv({ ...base, OTP_TEST_PHONES: "11800000001" })).toThrow(/OTP_TEST_PHONES/);
    // Apenas dígitos (menos de 11)
    expect(() => getEnv({ ...base, OTP_TEST_PHONES: "119000000" })).toThrow(/OTP_TEST_PHONES/);
  });

  it("mutação: rejeita qualquer telefone inválido em uma lista", () => {
    expect(() =>
      getEnv({ ...base, OTP_TEST_PHONES: "11900000001, 1190000, 11900000002" }),
    ).toThrow(/OTP_TEST_PHONES/);
  });

  it("mutação: proibição em produção não depende de VERCEL_ENV existir", () => {
    // Sem VERCEL_ENV definido, a lista é permitida
    expect(getEnv({ ...base, OTP_TEST_PHONES: "11900000001" }).OTP_TEST_PHONES).toHaveLength(1);
  });

  it("mutação: proibição em produção é específica para 'production'", () => {
    // preview e development são permitidos
    expect(getEnv({ ...base, VERCEL_ENV: "preview", OTP_TEST_PHONES: "11900000001" }).OTP_TEST_PHONES).toHaveLength(1);
    expect(getEnv({ ...base, VERCEL_ENV: "development", OTP_TEST_PHONES: "11900000001" }).OTP_TEST_PHONES).toHaveLength(1);
  });

  it("mutação: vazio é sempre permitido, mesmo em produção", () => {
    expect(getEnv({ ...base, VERCEL_ENV: "production" }).OTP_TEST_PHONES).toEqual([]);
    expect(getEnv({ ...base, VERCEL_ENV: "production", OTP_TEST_PHONES: "" }).OTP_TEST_PHONES).toEqual([]);
  });

  it("mutação: erro contém 'produção' e 'OTP_TEST_PHONES'", () => {
    try {
      getEnv({ ...base, VERCEL_ENV: "production", OTP_TEST_PHONES: "11900000001" });
      throw new Error("Should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toMatch(/OTP_TEST_PHONES/);
      expect(message).toMatch(/produção/);
    }
  });
});
