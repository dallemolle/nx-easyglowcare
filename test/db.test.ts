import { describe, expect, it } from "vitest";

import { testPool } from "./db";

describe("banco de teste", () => {
  it("conecta ao easyglowcare_test", async () => {
    const { rows } = await testPool.query<{ d: string }>("select current_database() as d");
    expect(rows[0].d).toBe("easyglowcare_test");
  });
});
