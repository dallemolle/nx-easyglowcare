export type InstallMode = "installed" | "prompt" | "ios" | "other";

/**
 * O que a tela "Instalar app" mostra. iPad em modo computador se apresenta como "Macintosh";
 * a diferença para um Mac de verdade é a tela de toque.
 */
export function detectInstallMode(input: {
  standalone: boolean;
  canPrompt: boolean;
  userAgent: string;
  maxTouchPoints: number;
}): InstallMode {
  if (input.standalone) return "installed";
  if (input.canPrompt) return "prompt";
  const isIos = /iPhone|iPad|iPod/i.test(input.userAgent);
  const isIpadDesktopMode = /Macintosh/.test(input.userAgent) && input.maxTouchPoints > 1;
  if (isIos || isIpadDesktopMode) return "ios";
  return "other";
}
