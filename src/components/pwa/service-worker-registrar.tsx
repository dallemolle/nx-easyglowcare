"use client";

import { useEffect } from "react";

/**
 * Registra o service worker (só em produção: no `next dev` ele atrapalharia a atualização
 * automática) e impede o banner automático "instalar app" do navegador. Pela decisão D12, o
 * convite para instalar é só o link discreto da página; a tela /instalar continua oferecendo
 * o botão.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    const blockAutomaticBanner = (event: Event) => event.preventDefault();
    window.addEventListener("beforeinstallprompt", blockAutomaticBanner);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        // Sem service worker o app funciona igual; só perde a página "Sem conexão".
      });
    }

    return () => window.removeEventListener("beforeinstallprompt", blockAutomaticBanner);
  }, []);

  return null;
}
