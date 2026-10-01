import { describe, expect, it } from "vitest";

import { assertTestDatabase } from "./db-guard";

describe("assertTestDatabase", () => {
  it("aceita banco cujo nome termina em _test", () => {
    expect(() =>
      assertTestDatabase("postgres://postgres:postgres@localhost:5432/easyglowcare_test"),
    ).not.toThrow();
  });

  it.each([
    "postgres://postgres:postgres@localhost:5432/easyglowcare",
    "postgres://u:p@ep-x.sa-east-1.aws.neon.tech/neondb",
  ])("recusa banco que não é de teste: %s", (url) => {
    expect(() => assertTestDatabase(url)).toThrow(/não é um banco de teste/);
  });

  it("não expõe a senha na mensagem", () => {
    expect(() => assertTestDatabase("postgres://u:segredo@host/neondb")).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("segredo") }),
    );
  });
});
