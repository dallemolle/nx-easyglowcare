import { defineConfig } from "@playwright/test";

import base from "./playwright.config";

// Mesmos testes, contra o app em modo produção (`next start`, depois de `next build`): sem o
// 'unsafe-eval' da CSP de dev e com o service worker ativo. Roda também os `*.prod.spec.ts`.
export default defineConfig({
  ...base,
  testIgnore: undefined,
  webServer: {
    command: "pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
