import { decodeJwt, SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";

import { generateToken, hashToken, signPayload, verifyPayload } from "./token";

describe("generateToken / hashToken", () => {
  it("gera tokens base64url de 32 bytes, diferentes a cada chamada", () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(a);
  });

  it("hashToken devolve sha256 em hex, determinístico", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("signPayload / verifyPayload", () => {
  it("devolve o payload igual ao assinado", async () => {
    const value = await signPayload({ t: "meu-token" });
    expect((await verifyPayload(value))?.t).toBe("meu-token");
  });

  it("sem expiresAt o JWT não tem exp e não expira", async () => {
    const value = await signPayload({ t: "x" });
    expect(decodeJwt(value).exp).toBeUndefined();
    vi.useFakeTimers({ now: new Date("2099-01-01T00:00:00Z"), toFake: ["Date"] });
    try {
      expect(await verifyPayload(value)).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("devolve null quando expiresAt já passou", async () => {
    const value = await signPayload({ t: "x" }, new Date(Date.now() - 60_000));
    expect(await verifyPayload(value)).toBeNull();
  });

  it("aceita expiresAt no futuro", async () => {
    const value = await signPayload({ t: "x" }, new Date(Date.now() + 60_000));
    expect(await verifyPayload(value)).not.toBeNull();
  });

  it.each([["lixo"], [""], [undefined]])("devolve null para valor inválido (%j)", async (bad) => {
    expect(await verifyPayload(bad)).toBeNull();
  });

  it("devolve null para assinatura de outro segredo", async () => {
    const other = await new SignJWT({ t: "x" })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode("outro-segredo-com-mais-de-32-caracteres"));
    expect(await verifyPayload(other)).toBeNull();
  });

  it("propaga erro de configuração do segredo", async () => {
    const value = await signPayload({ t: "x" });
    vi.stubEnv("SESSION_SECRET", "curta");
    try {
      await expect(verifyPayload(value)).rejects.toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
