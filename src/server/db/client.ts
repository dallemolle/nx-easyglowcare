import "server-only";

import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import { getEnv } from "@/lib/env";

import * as schema from "./schema";

const { DATABASE_URL } = getEnv();

// Dev local: o driver do Neon fala com o local-neon-http-proxy (docker-compose.yml).
if (new URL(DATABASE_URL).hostname === "db.localtest.me") {
  neonConfig.fetchEndpoint = (host) => `http://${host}:4444/sql`;
  neonConfig.wsProxy = (host) => `${host}:4444/v2`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}

const pool = new Pool({ connectionString: DATABASE_URL });

export const db = drizzle({ client: pool, schema, casing: "snake_case" });
export type Db = typeof db;
