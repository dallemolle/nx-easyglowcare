import { expect, test } from "./fixtures";

test("sem internet, a navegação mostra a página Sem conexão", async ({ page, context }) => {
  await page.goto("/easyglowcare");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Depois de ativado, o service worker assume a página na próxima navegação.
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls: string[] = [];
    for (const name of names) {
      for (const request of await (await caches.open(name)).keys()) urls.push(new URL(request.url).pathname);
    }
    return urls;
  });
  // LGPD: nada além da página "Sem conexão" fica no aparelho.
  expect(cached).toEqual(["/offline.html"]);

  await context.setOffline(true);
  await page.goto("/easyglowcare/instalar");
  await expect(page.getByRole("heading", { name: "Sem conexão" })).toBeVisible();

  await context.setOffline(false);
  await page.getByRole("link", { name: "Tentar de novo" }).click();
  await expect(page.getByRole("heading", { name: "Sem conexão" })).toBeHidden();
});
