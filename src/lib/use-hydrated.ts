"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * `false` no render do servidor e no primeiro render do cliente (hidratação); vira `true`
 * logo depois, sem divergência de hidratação. Usado para manter o botão de envio desabilitado
 * até o React assumir o formulário, evitando um envio nativo (GET com senha na URL) antes disso.
 * (`useSyncExternalStore` em vez de setState num effect: a regra react-hooks/set-state-in-effect
 * do lint recusa o segundo.)
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
