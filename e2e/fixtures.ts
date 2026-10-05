import { expect, test as base } from "@playwright/test";

/**
 * `test` com uma verificação automática: qualquer bloqueio da CSP registrado no console da
 * página derruba o teste. É assim que um script legítimo barrado pela política aparece antes
 * de chegar em produção.
 */
export const test = base.extend<{ cspViolations: string[] }>({
  cspViolations: [
    async ({ page }, use) => {
      const violations: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
          violations.push(message.text());
        }
      });
      await use(violations);
      expect(violations, "a CSP bloqueou algo nesta página").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
