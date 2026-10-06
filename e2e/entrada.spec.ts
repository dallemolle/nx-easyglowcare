import { expect, test } from "./fixtures";

// Os cookies da clínica usam path=/<slug canônico>; em /EasyGlowCare eles nunca chegariam.
// As páginas redirecionam para o slug canônico mantendo a query.
test.describe("slug fora do padrão vai para o canônico", () => {
  test("catálogo mantém a query", async ({ page }) => {
    await page.goto("/EasyGlowCare?utm_source=ig");
    await expect(page).toHaveURL(/\/easyglowcare\?utm_source=ig$/);
  });

  test("entrar mantém o voltar", async ({ page }) => {
    await page.goto("/EasyGlowCare/entrar?voltar=%2Feasyglowcare%2Finstalar");
    await expect(page).toHaveURL(/\/easyglowcare\/entrar\?voltar=%2Feasyglowcare%2Finstalar$/);
    await expect(page.getByLabel("CPF")).toBeVisible();
  });

  test("minha conta sem sessão cai em entrar no slug canônico", async ({ page }) => {
    await page.goto("/EasyGlowCare/minha-conta");
    await expect(page).toHaveURL(/\/easyglowcare\/entrar\?voltar=%2Feasyglowcare%2Fminha-conta$/);
  });
});
