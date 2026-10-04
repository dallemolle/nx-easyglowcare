import { describe, expect, it } from "vitest";

import { GET } from "./route";

const call = (name: string) => GET(new Request(`http://localhost/icons/${name}`), { params: Promise.resolve({ name }) });

describe("GET /icons/[name]", () => {
  it.each([
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["maskable-512.png", 512],
    ["apple-touch-icon.png", 180],
  ])("%s é um PNG", async (name) => {
    const response = await call(name);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(1, 4)].map((b) => String.fromCharCode(b)).join("")).toBe("PNG");
  });

  it("nome desconhecido dá 404", async () => {
    expect((await call("icone-qualquer.png")).status).toBe(404);
  });
});
