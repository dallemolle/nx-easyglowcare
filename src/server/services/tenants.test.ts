import { beforeEach, describe, expect, it } from "vitest";

import { getTestDb, resetDb } from "../../../test/db";
import { tenants } from "../db/schema";

import { findTenantBySlug, normalizeSlug } from "./tenants";

describe("normalizeSlug", () => {
  it("normaliza maiúsculas", () => {
    expect(normalizeSlug("EasyGlowCare")).toBe("easyglowcare");
  });

  it.each(["favicon.ico", "a%20b", "%E0%A4%A", "", "a".repeat(64), "-a", "a--b"])(
    "rejeita %j",
    (raw) => {
      expect(normalizeSlug(raw)).toBeNull();
    },
  );

  it("aceita slug com hífen", () => {
    expect(normalizeSlug("clinica-bela-vista")).toBe("clinica-bela-vista");
  });
});

describe("findTenantBySlug", () => {
  const db = getTestDb();

  beforeEach(async () => {
    await resetDb();
    await db.insert(tenants).values({ slug: "easyglowcare", name: "EasyGlowCare" });
  });

  it("encontra o tenant ignorando maiúsculas e devolve o escopo dele", async () => {
    const found = await findTenantBySlug(db, "EasyGlowCare");
    expect(found?.tenant.slug).toBe("easyglowcare");
    expect(found?.scope.tenantId).toBe(found?.tenant.id);
  });

  it("devolve null para slug inexistente", async () => {
    expect(await findTenantBySlug(db, "nao-existe")).toBeNull();
  });

  it("devolve null para slug inválido", async () => {
    expect(await findTenantBySlug(db, "favicon.ico")).toBeNull();
  });
});
