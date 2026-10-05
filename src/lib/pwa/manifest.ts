import type { MetadataRoute } from "next";

import { APP_ICONS, PWA_BACKGROUND_COLOR, PWA_THEME_COLOR } from "./constants";

type Manifest = MetadataRoute.Manifest;

function appManifest(fields: { scope: string; name: string; shortName: string }): Manifest {
  return {
    id: fields.scope,
    name: fields.name,
    short_name: fields.shortName,
    start_url: fields.scope,
    scope: fields.scope,
    display: "standalone",
    lang: "pt-BR",
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_THEME_COLOR,
    icons: [...APP_ICONS],
  };
}

/** App de uma clínica: tem o nome dela e abre em /<slug>. Só o nome e o slug saem daqui. */
export function buildTenantManifest(tenant: { slug: string; name: string }): Manifest {
  return appManifest({ scope: `/${tenant.slug}`, name: tenant.name, shortName: tenant.name });
}

/** App do painel da equipe, separado do app das clientes. */
export function buildPanelManifest(): Manifest {
  return appManifest({ scope: "/admin", name: "EasyGlowCare Painel", shortName: "Painel" });
}
