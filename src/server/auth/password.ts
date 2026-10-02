import "server-only";

import { randomInt } from "node:crypto";

import { hash, verify } from "@node-rs/argon2";

const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export const TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

const TEMP_PASSWORD_LENGTH = 14;

/**
 * Hash Argon2id válido de uma senha descartável, usado para igualar o tempo de
 * resposta do login quando o e-mail informado não existe (evita enumeração por timing).
 */
export const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$y3alhtdKTPgXBNa8+R6wGw$g3xli3AbTGqVZO+A9D+MBuRE9z1joe1/ZahBOzsNxi4";

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

export function generateTemporaryPassword(): string {
  let result = "";
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
    result += TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)];
  }
  return result;
}
