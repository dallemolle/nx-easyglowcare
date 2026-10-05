"use client";

import { useEffect } from "react";

import { setInstallPrompt, type BeforeInstallPromptEvent } from "@/lib/pwa/install-prompt";

/**
 * Registra o service worker (só em produção: no `next dev` ele atrapalharia a atualização
 * automática) e cuida do convite de instalação do navegador. Pela decisão D12, o banner
 * automático é suprimido (`preventDefault`); o evento fica guardado para a tela /instalar,
 * que oferece o botão. O Chrome só o dispara uma vez por carga, então quem guarda tem de estar
 * montado desde o início.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    const keepInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const clearInstallPrompt = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", keepInstallPrompt);
    window.addEventListener("appinstalled", clearInstallPrompt);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        // Sem service worker o app funciona igual; só perde a página "Sem conexão".
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", keepInstallPrompt);
      window.removeEventListener("appinstalled", clearInstallPrompt);
    };
  }, []);

  return null;
}
