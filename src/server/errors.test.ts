import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "./errors";

describe("isUniqueViolation", () => {
  it("reconhece o código 23505 direto ou na causa", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation(Object.assign(new Error("x"), { cause: { code: "23505" } }))).toBe(true);
  });

  it("recusa outros erros e valores", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(new Error("x"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });
});
