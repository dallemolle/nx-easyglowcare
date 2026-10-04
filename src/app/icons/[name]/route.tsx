import { renderAppIcon } from "@/lib/pwa/icon";

// "icons" vira um caminho reservado: uma clínica com slug "icons" perderia /icons/<arquivo>.
const ICONS: Record<string, { size: number; maskable: boolean }> = {
  "icon-192.png": { size: 192, maskable: false },
  "icon-512.png": { size: 512, maskable: false },
  "maskable-512.png": { size: 512, maskable: true },
  // O iPhone não usa transparência: fundo cheio, como o maskable.
  "apple-touch-icon.png": { size: 180, maskable: true },
};

export async function GET(_request: Request, { params }: RouteContext<"/icons/[name]">) {
  const icon = ICONS[(await params).name];
  if (!icon) return new Response("Not found", { status: 404 });
  return renderAppIcon(icon.size, icon.maskable);
}
