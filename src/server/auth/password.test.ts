import { describe, expect, it } from "vitest";

import {
  DUMMY_PASSWORD_HASH,
  generateTemporaryPassword,
  hashPassword,
  TEMP_PASSWORD_ALPHABET,
  verifyPassword,
} from "./password";

describe("hashPassword / verifyPassword", () => {
  it("gera hash Argon2id e verifica a senha correta e a incorreta", async () => {
    const hash = await hashPassword("correta-horse-9");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "correta-horse-9")).toBe(true);
    expect(await verifyPassword(hash, "errada")).toBe(false);
  });

  it("devolve false para hash malformado, sem lançar", async () => {
    await expect(verifyPassword("nao-e-hash", "x")).resolves.toBe(false);
  });

  it("DUMMY_PASSWORD_HASH é um hash Argon2id válido que nunca confere", async () => {
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(DUMMY_PASSWORD_HASH, "qualquer")).toBe(false);
  });
});

describe("generateTemporaryPassword", () => {
  it("gera 14 caracteres do alfabeto definido, diferentes a cada chamada", () => {
    const temp = generateTemporaryPassword();
    expect(temp).toHaveLength(14);
    expect([...temp].every((c) => TEMP_PASSWORD_ALPHABET.includes(c))).toBe(true);
    expect(generateTemporaryPassword()).not.toBe(temp);
  });
});
