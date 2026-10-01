import { describe, expect, it } from "vitest";

import { assertLocalDatabase } from "./seed-guard";

const NEON = "postgres://u:p@ep-x-pooler.sa-east-1.aws.neon.tech/neondb";

describe("assertLocalDatabase", () => {
  it.each([
    "postgres://u:p@localhost:5432/x",
    "postgres://u:p@127.0.0.1:5432/x",
    "postgres://u:p@db.localtest.me:5432/x",
  ])("aceita banco local %s", (url) => {
    expect(() => assertLocalDatabase(url, false)).not.toThrow();
  });

  it("recusa banco não local", () => {
    expect(() => assertLocalDatabase(NEON, false)).toThrow(/banco não local/);
  });

  it("não expõe a senha na mensagem", () => {
    expect(() => assertLocalDatabase(NEON, false)).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("u:p") }),
    );
  });

  it("aceita banco não local com --force", () => {
    expect(() => assertLocalDatabase(NEON, true)).not.toThrow();
  });
});
