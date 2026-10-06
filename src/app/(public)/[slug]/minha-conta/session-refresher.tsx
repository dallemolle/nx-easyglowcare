"use client";

import { useEffect } from "react";

import { refreshSessionAction } from "./actions";

/**
 * Renova a sessão do cliente perto do vencimento. A página não pode gravar cookie, então só
 * renderiza este componente quando `shouldRenew`; ele chama a action uma vez.
 */
export function SessionRefresher({ slug }: { slug: string }) {
  useEffect(() => {
    void refreshSessionAction(slug);
  }, [slug]);

  return null;
}
