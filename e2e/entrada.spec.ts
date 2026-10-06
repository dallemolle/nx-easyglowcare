import { CLIENT_COOKIE_NAME, E2E_NEW_CPF } from "./constants";
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

// Envia no máximo 3 códigos ao celular de teste por execução (limite: 3 em 15 min); o global-setup
// limpa os desafios. Aqui são 2 (cadastro e login). Teste novo que envie código usa outro celular.
test.describe("entrada sem senha", () => {
  test("o catálogo grava a origem do lead com path no slug", async ({ page, context }) => {
    await page.goto("/easyglowcare?utm_source=instagram");
    const cookies = await context.cookies();
    const origem = cookies.find((cookie) => cookie.name === "egc_origem");
    expect(origem?.path).toBe("/easyglowcare");
  });

  test("termos e política abrem como rascunho", async ({ page }) => {
    for (const [path, title] of [
      ["/easyglowcare/termos", "Termos de uso"],
      ["/easyglowcare/privacidade", "Política de privacidade"],
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByText("Rascunho em revisão jurídica.")).toBeVisible();
    }
  });

  test("CPF inválido e termos não aceitos mostram o erro", async ({ page }) => {
    await page.goto("/easyglowcare/entrar");
    await page.getByLabel("CPF").fill("529.982.247-24");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("CPF inválido. Confira os números.")).toBeVisible();

    // CPF válido e desconhecido (o do cadastro do teste seguinte, ainda não criado): vai ao cadastro.
    await page.getByLabel("CPF").fill(E2E_NEW_CPF);
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByLabel("Nome").fill("Cliente E2E");
    await page.getByLabel("Celular (WhatsApp)").fill("(11) 90000-0001");
    await page.getByRole("button", { name: "Enviar código" }).click();
    await expect(
      page.getByText("Para continuar, aceite os Termos de Uso e a Política de Privacidade."),
    ).toBeVisible();
  });

  test("pessoa nova se cadastra, entra e sai", async ({ page, context }) => {
    await page.goto("/easyglowcare?utm_source=instagram");
    await page.getByRole("link", { name: "Entrar" }).click();
    await page.getByLabel("CPF").fill("529.982.247-25");
    await page.getByRole("button", { name: "Continuar" }).click();

    await page.getByLabel("Nome").fill("Cliente E2E");
    await page.getByLabel("Celular (WhatsApp)").fill("(11) 90000-0001");
    await page.getByRole("checkbox", { name: /Li e aceito/ }).check();
    await page.getByRole("button", { name: "Enviar código" }).click();

    await expect(page.getByText("Enviamos um código por WhatsApp para (11) *****-0001")).toBeVisible();
    await page.getByLabel("Código").fill("000000");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/easyglowcare\/minha-conta$/);
    await expect(page.getByText("Olá, Cliente")).toBeVisible();
    expect((await context.cookies()).some((cookie) => cookie.name === CLIENT_COOKIE_NAME)).toBe(true);

    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/easyglowcare$/);
    await expect(page.getByRole("link", { name: "Entrar" })).toBeVisible();
  });

  test("pessoa existente erra o código e depois entra", async ({ page }) => {
    await page.goto("/easyglowcare/entrar");
    await page.getByLabel("CPF").fill("529.982.247-25");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("Enviamos um código por WhatsApp para (11) *****-0001")).toBeVisible();

    await page.getByLabel("Código").fill("111111");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("Código incorreto. Restam 4 tentativas.")).toBeVisible();

    await page.getByLabel("Código").fill("000000");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/easyglowcare\/minha-conta$/);
    await expect(page.getByText("Olá, Cliente")).toBeVisible();
  });
});
