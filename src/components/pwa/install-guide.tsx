"use client";

import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { detectInstallMode, type InstallMode } from "@/lib/pwa/install-mode";
import { getInstallPrompt, setInstallPrompt, subscribe } from "@/lib/pwa/install-prompt";
import { useHydrated } from "@/lib/use-hydrated";

function currentMode(canPrompt: boolean): InstallMode {
  return detectInstallMode({
    standalone: window.matchMedia("(display-mode: standalone)").matches,
    canPrompt,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
  });
}

/** Instruções de instalação. Instalar é opcional (D12): o texto sempre lembra disso. */
export function InstallGuide({ appName }: { appName: string }) {
  // Só depois da hidratação: o servidor não conhece o aparelho. O convite do navegador vem do
  // registrador do service worker (que o recebe logo após o load), não de um listener próprio.
  const hydrated = useHydrated();
  const promptEvent = useSyncExternalStore(subscribe, getInstallPrompt, () => null);
  const [justInstalled, setJustInstalled] = useState(false);

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    // O convite do navegador só pode ser usado uma vez.
    setInstallPrompt(null);
    if (outcome === "accepted") setJustInstalled(true);
  }

  if (!hydrated) return null;
  const mode: InstallMode = justInstalled ? "installed" : currentMode(promptEvent !== null);

  if (mode === "installed") {
    return <p>O app {appName} já está instalado neste aparelho.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {mode === "prompt" && (
        <Button className="self-start" onClick={install}>
          Instalar
        </Button>
      )}

      {mode === "ios" && (
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>Abra esta página no Safari.</li>
          <li>Toque em Compartilhar (o quadrado com uma seta para cima).</li>
          <li>Escolha &ldquo;Adicionar à Tela de Início&rdquo; e toque em &ldquo;Adicionar&rdquo;.</li>
        </ol>
      )}

      {mode === "other" && (
        <p>
          Abra o menu do navegador (os três pontinhos) e escolha &ldquo;Instalar app&rdquo; ou
          &ldquo;Adicionar à tela inicial&rdquo;.
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        Você também pode continuar usando pelo navegador, sem instalar.
      </p>
    </div>
  );
}
