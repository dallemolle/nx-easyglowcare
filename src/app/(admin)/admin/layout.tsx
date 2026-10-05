import type { Metadata } from "next";

/** Todas as páginas de /admin (login, troca de senha, painel) apontam para o app do painel. */
export const metadata: Metadata = { manifest: "/admin/manifest.webmanifest" };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
