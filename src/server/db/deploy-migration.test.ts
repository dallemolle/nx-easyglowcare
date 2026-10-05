import { describe, expect, it } from "vitest";

import { shouldMigrate } from "./deploy-migration";

describe("shouldMigrate", () => {
  it.each([
    [{ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }, true],
    [{ VERCEL_ENV: "production" }, true],
    [{ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "staging" }, true],
    [{ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feat/fase-0d-pwa-seguranca-ci" }, false],
    [{ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "staging-2" }, false],
    [{ VERCEL_ENV: "preview" }, false],
    [{ VERCEL_ENV: "development" }, false],
    [{}, false],
  ])("%j → migra: %s", (env, expected) => {
    expect(shouldMigrate(env).migrate).toBe(expected);
  });

  it("explica por que pulou num branch de PR", () => {
    expect(shouldMigrate({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feat/x" }).reason).toContain("feat/x");
  });
});
