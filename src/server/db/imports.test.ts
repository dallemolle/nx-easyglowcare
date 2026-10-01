import { globSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// Services recebem um TenantScope, nunca o `db`. Amplie esta lista explicitamente quando
// um novo módulo precisar do client (ex.: sessão no 0B).
const ALLOWED = ["src/server/services/tenants.ts"];

const CLIENT_IMPORT = /from\s+["'](@\/server\/db\/client|\.{1,2}\/(?:[\w-]+\/)*client)["']/;

describe("guarda de import do client do banco", () => {
  it("só os módulos permitidos importam @/server/db/client", () => {
    const importers = globSync("src/**/*.{ts,tsx}")
      .map((file) => file.replaceAll("\\", "/"))
      .filter((file) => file !== "src/server/db/client.ts")
      .filter((file) => CLIENT_IMPORT.test(readFileSync(file, "utf8")))
      .sort();

    expect(importers).toEqual(ALLOWED);
  });
});
