import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";

import { getEnv } from "@/lib/env";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getEnv().SESSION_SECRET);
}

/** Token aleatório de sessão (32 bytes, base64url). Só o hash vai para o banco. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Assina o payload como JWT HS256. Sem `expiresAt`, o JWT não expira (a validade fica no banco). */
export async function signPayload(payload: Record<string, string>, expiresAt?: Date): Promise<string> {
  const jwt = new SignJWT(payload).setProtectedHeader({ alg: "HS256" });
  if (expiresAt) jwt.setExpirationTime(expiresAt);
  return jwt.sign(secretKey());
}

/**
 * Verifica a assinatura e devolve o payload, ou `null` se o valor estiver ausente,
 * malformado, adulterado, vencido ou assinado com outro segredo.
 */
export async function verifyPayload(value: string | undefined): Promise<Record<string, unknown> | null> {
  if (!value) return null;

  // Fora do try: um erro de configuração (ex.: SESSION_SECRET inválido) deve propagar,
  // não ser confundido com uma falha de verificação do JWT e virar "sessão inválida".
  const key = secretKey();

  try {
    const { payload } = await jwtVerify(value, key, { algorithms: ["HS256"] });
    return payload;
  } catch {
    return null;
  }
}
