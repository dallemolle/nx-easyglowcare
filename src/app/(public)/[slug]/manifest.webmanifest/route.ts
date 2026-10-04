import { buildTenantManifest } from "@/lib/pwa/manifest";
import { getTenantBySlug } from "@/server/services/tenants";

const MANIFEST_HEADERS = {
  "Content-Type": "application/manifest+json; charset=utf-8",
  "Cache-Control": "public, max-age=3600",
};

export async function GET(_request: Request, { params }: RouteContext<"/[slug]/manifest.webmanifest">) {
  const found = await getTenantBySlug((await params).slug);
  if (!found) return new Response("Not found", { status: 404 });
  return Response.json(buildTenantManifest(found.tenant), { headers: MANIFEST_HEADERS });
}
