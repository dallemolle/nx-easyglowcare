// Cores e ícone provisórios, iguais para todas as clínicas: logo e cor por clínica entram com o
// upload de imagens (Etapa 2).
export const PWA_THEME_COLOR = "#18181b";
export const PWA_BACKGROUND_COLOR = "#ffffff";

export const APP_ICONS = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
] as const;

export const APPLE_TOUCH_ICON = "/icons/apple-touch-icon.png";
