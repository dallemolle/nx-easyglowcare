import { expect, test } from "./fixtures";

test("página da clínica sai com CSP por nonce e cabeçalhos de segurança", async ({ page }) => {
  const response = await page.goto("/easyglowcare");
  const headers = response!.headers();

  const csp = headers["content-security-policy"];
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  expect(csp).toContain("frame-ancestors 'none'");

  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");

  // Os scripts do Next recebem o nonce desta resposta. Exceção: o cliente de HMR do Turbopack
  // (só existe no `next dev`) é injetado pelo próprio Next sem nonce e roda via 'strict-dynamic'.
  const scriptNonces = await page.locator("script[src]").evaluateAll((scripts) =>
    scripts
      .filter((script) => !(script as HTMLScriptElement).src.includes("%5Bturbopack%5D_browser_dev"))
      .map((script) => (script as HTMLScriptElement).nonce),
  );
  expect(scriptNonces.length).toBeGreaterThan(0);
  expect(new Set(scriptNonces)).toEqual(new Set([nonce]));
});

test("rotas /api não recebem CSP, mas recebem os cabeçalhos fixos", async ({ request }) => {
  const response = await request.get("/api/cron/outbox");
  expect(response.status()).toBe(401);
  expect(response.headers()["content-security-policy"]).toBeUndefined();
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
});
