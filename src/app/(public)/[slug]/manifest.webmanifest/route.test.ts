import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getTenantBySlug: vi.fn() }));
vi.mock("@/server/services/tenants", () => ({ getTenantBySlug: mocks.getTenantBySlug }));

import { GET } from "./route";

const TENANT_ID = "3f2b8c1e-5d4a-4b7e-9a1c-2d6e8f0a1b3c";
const call = (slug: string) =>
  GET(new Request(`http://localhost/${slug}/manifest.webmanifest`), { params: Promise.resolve({ slug }) });

beforeEach(() => {
  mocks.getTenantBySlug.mockReset();
});

describe("GET /[slug]/manifest.webmanifest", () => {
  it("devolve o manifest da clínica, sem dados internos", async () => {
    mocks.getTenantBySlug.mockResolvedValue({
      tenant: { id: TENANT_ID, slug: "easyglowcare", name: "EasyGlowCare", config: { segredo: 1 } },
      scope: {},
    });

    const response = await call("easyglowcare");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/manifest+json; charset=utf-8");
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({ name: "EasyGlowCare", start_url: "/easyglowcare" });
    expect(body).not.toContain(TENANT_ID);
    expect(body).not.toContain("segredo");
  });

  it("clínica inexistente dá 404", async () => {
    mocks.getTenantBySlug.mockResolvedValue(null);
    expect((await call("nao-existe")).status).toBe(404);
  });
});
