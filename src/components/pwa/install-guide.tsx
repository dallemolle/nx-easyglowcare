"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useHydrated } from "@/lib/use-hydrated";
import { detectInstallMode, type InstallMode } from "@/lib/pwa/install-mode";

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

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
  // Só depois da hidratação: o servidor não conhece o aparelho (e a regra de lint recusa
  // setState direto num effect, por isso o modo é derivado no render).
  const hydrated = useHydrated();
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [justInstalled, setJustInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setJustInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    // O convite do navegador só pode ser usado uma vez.
    setPromptEvent(null);
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
