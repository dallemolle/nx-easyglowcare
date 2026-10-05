/**
 * Guarda o convite de instalação do navegador (`beforeinstallprompt`). O Chrome o dispara uma
 * vez por carga de página, logo após o load; quem o recebe é o registrador do service worker,
 * montado desde o início, e a tela "Instalar app" só o lê depois (navegação no cliente).
 * Sem React: serve de fonte externa para `useSyncExternalStore`.
 */
export type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let saved: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return saved;
}

export function setInstallPrompt(event: BeforeInstallPromptEvent | null): void {
  saved = event;
  listeners.forEach((listener) => listener());
}
