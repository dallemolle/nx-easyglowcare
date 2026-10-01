import { describe, expect, it } from "vitest";

import { pool } from "./client";

describe("client do banco", () => {
  it("um erro em conexão ociosa do pool não derruba o processo", () => {
    // Sem listener de 'error', o EventEmitter lança e o Node encerra a instância.
    expect(() => pool.emit("error", new Error("conexão encerrada"))).not.toThrow();
  });
});
