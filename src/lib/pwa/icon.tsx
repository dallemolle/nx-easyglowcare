import { ImageResponse } from "next/og";

import { PWA_THEME_COLOR } from "./constants";

/**
 * Ícone provisório: "EG" sobre a cor do tema. O `maskable` ocupa o quadrado todo e deixa as
 * letras dentro da área segura (o sistema recorta em círculo ou gota).
 */
export function renderAppIcon(size: number, maskable: boolean): ImageResponse {
  const fontSize = Math.round(size * (maskable ? 0.3 : 0.4));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: PWA_THEME_COLOR,
          color: "#fafafa",
          fontSize,
          fontWeight: 700,
          borderRadius: maskable ? 0 : Math.round(size * 0.22),
        }}
      >
        EG
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800" } },
  );
}
