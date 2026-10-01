const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "db.localtest.me"]);

/**
 * O seed apaga e recria o tenant de exemplo; só roda em banco local, salvo com `--force`
 * (ex.: popular um branch de preview do Neon de propósito).
 */
export function assertLocalDatabase(url: string, force: boolean): void {
  if (force) return;
  const { hostname } = new URL(url);
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new Error(
      `Seed recusado: banco não local (${hostname}). Use --force se for intencional.`,
    );
  }
}
