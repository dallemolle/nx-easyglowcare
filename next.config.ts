import type { NextConfig } from "next";

import { SECURITY_HEADERS } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // Atualizações do service worker precisam chegar logo.
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
