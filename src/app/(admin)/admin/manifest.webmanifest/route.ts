import { buildPanelManifest } from "@/lib/pwa/manifest";

// Fora do proxy (ver src/proxy.ts): o navegador busca o manifest sem cookie de sessão.
export function GET() {
  return Response.json(buildPanelManifest(), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
