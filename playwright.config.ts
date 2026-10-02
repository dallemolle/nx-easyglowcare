import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Série: os testes compartilham o banco de dev (seed + login_attempts) e a sessão não deve
  // ser disputada por workers em paralelo.
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    // Chrome instalado no sistema — nunca `playwright install`.
    channel: "chrome",
    viewport: { width: 375, height: 812 },
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
});
