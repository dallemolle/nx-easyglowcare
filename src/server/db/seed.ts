/**
 * Seed de desenvolvimento: recria o tenant de exemplo "EasyGlowCare".
 * Uso: pnpm db:seed            (só banco local)
 *      pnpm db:seed -- --force (outro banco, ex.: branch de preview do Neon)
 * Os dados são exemplo; cada clínica cadastra os seus pelo admin.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { passwordSchema } from "@/lib/validation/auth";
import { generateTemporaryPassword, hashPassword } from "@/server/auth/password";

import * as schema from "./schema";
import { assertLocalDatabase } from "./seed-guard";
import { tenantScope } from "./tenant-scope";

const { equipment, locations, professionals, rooms, serviceCategories, services, staffUsers, tenants } = schema;

const TENANT = { slug: "easyglowcare", name: "EasyGlowCare" } as const;

/** Dono(a) e recepção da clínica de exemplo. */
const STAFF_SEED = [
  { name: "Dono(a)", email: "dono@easyglowcare.test", role: "owner" as const },
  { name: "Recepção", email: "recepcao@easyglowcare.test", role: "reception" as const },
];

/** Profissionais da clínica de exemplo: cada um ganha um usuário da equipe vinculado. */
const PROFESSIONAL_SEED = [
  { name: "Ana Souza", email: "ana@easyglowcare.test", bio: "Esteticista facial e corporal.", color: "#E11D48" },
  { name: "Beatriz Lima", email: "beatriz@easyglowcare.test", bio: "Especialista em depilação a laser.", color: "#7C3AED" },
  { name: "Dra. Carla Mendes", email: "carla@easyglowcare.test", bio: "Biomédica esteta (injetáveis).", color: "#0891B2" },
];

/**
 * Senha da equipe de exemplo: usa `SEED_STAFF_PASSWORD` quando definida (precisa passar
 * nas mesmas regras da senha de login), senão gera uma e avisa que deve ser impressa.
 */
function resolveSeedPassword(): { value: string; generated: boolean } {
  const fromEnv = process.env.SEED_STAFF_PASSWORD;
  if (!fromEnv) return { value: generateTemporaryPassword(), generated: true };

  const parsed = passwordSchema.safeParse(fromEnv);
  if (!parsed.success) {
    throw new Error(`SEED_STAFF_PASSWORD inválida: ${parsed.error.issues[0].message}`);
  }
  return { value: fromEnv, generated: false };
}

type ServiceSeed = {
  name: string;
  slug: string;
  description: string;
  durationMin: number;
  priceCents: number;
  priceIsFrom?: boolean;
  cleanupBufferMin: number;
  requiresAssessment?: boolean;
};

const CATALOG: { name: string; slug: string; services: ServiceSeed[] }[] = [
  {
    name: "Facial",
    slug: "facial",
    services: [
      { name: "Limpeza de pele profunda", slug: "limpeza-de-pele", description: "Higienização, extração e máscara calmante.", durationMin: 60, priceCents: 18000, cleanupBufferMin: 15 },
      { name: "Peeling químico", slug: "peeling-quimico", description: "Renovação celular para manchas e textura.", durationMin: 45, priceCents: 25000, priceIsFrom: true, cleanupBufferMin: 15 },
      { name: "Microagulhamento facial", slug: "microagulhamento-facial", description: "Estímulo de colágeno para cicatrizes e poros.", durationMin: 60, priceCents: 35000, cleanupBufferMin: 15 },
    ],
  },
  {
    name: "Corporal",
    slug: "corporal",
    services: [
      { name: "Drenagem linfática", slug: "drenagem-linfatica", description: "Massagem para redução de inchaço e retenção.", durationMin: 60, priceCents: 15000, cleanupBufferMin: 10 },
      { name: "Massagem modeladora", slug: "massagem-modeladora", description: "Manobras vigorosas para contorno corporal.", durationMin: 50, priceCents: 14000, cleanupBufferMin: 10 },
      { name: "Radiofrequência corporal", slug: "radiofrequencia-corporal", description: "Tratamento de flacidez com calor controlado.", durationMin: 40, priceCents: 22000, cleanupBufferMin: 10 },
    ],
  },
  {
    name: "Depilação",
    slug: "depilacao",
    services: [
      { name: "Depilação a laser – axilas", slug: "laser-axilas", description: "Laser de diodo, sessão única.", durationMin: 20, priceCents: 12000, cleanupBufferMin: 10 },
      { name: "Depilação a laser – pernas completas", slug: "laser-pernas", description: "Laser de diodo, sessão única.", durationMin: 60, priceCents: 38000, cleanupBufferMin: 10 },
      { name: "Depilação com cera – virilha", slug: "cera-virilha", description: "Cera quente hipoalergênica.", durationMin: 30, priceCents: 7000, cleanupBufferMin: 10 },
    ],
  },
  {
    name: "Injetáveis",
    slug: "injetaveis",
    services: [
      { name: "Toxina botulínica", slug: "toxina-botulinica", description: "Suavização de linhas de expressão.", durationMin: 30, priceCents: 120000, priceIsFrom: true, cleanupBufferMin: 15, requiresAssessment: true },
      { name: "Preenchimento com ácido hialurônico", slug: "preenchimento-acido-hialuronico", description: "Volume e contorno.", durationMin: 45, priceCents: 150000, priceIsFrom: true, cleanupBufferMin: 15, requiresAssessment: true },
      { name: "Bioestimulador de colágeno", slug: "bioestimulador-colageno", description: "Firmeza progressiva da pele.", durationMin: 45, priceCents: 180000, priceIsFrom: true, cleanupBufferMin: 15, requiresAssessment: true },
    ],
  },
  {
    name: "Capilar",
    slug: "capilar",
    services: [
      { name: "Hidratação capilar profunda", slug: "hidratacao-capilar", description: "Reposição de água e nutrientes.", durationMin: 45, priceCents: 9000, cleanupBufferMin: 10 },
      { name: "Terapia capilar antiqueda", slug: "terapia-antiqueda", description: "Tratamento do couro cabeludo com ativos.", durationMin: 50, priceCents: 16000, cleanupBufferMin: 10 },
      { name: "Cauterização capilar", slug: "cauterizacao-capilar", description: "Reconstrução da fibra danificada.", durationMin: 60, priceCents: 13000, cleanupBufferMin: 10 },
    ],
  },
];

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) throw new Error("Defina DATABASE_URL_UNPOOLED (veja .env.example).");
  assertLocalDatabase(url, process.argv.includes("--force"));

  const seedPassword = resolveSeedPassword();
  const passwordHash = await hashPassword(seedPassword.value);

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const db = drizzle({ client: pool, schema, casing: "snake_case" });

  try {
    await db.transaction(async (tx) => {
      await tx.delete(tenants).where(eq(tenants.slug, TENANT.slug));
      const [tenant] = await tx
        .insert(tenants)
        .values({ ...TENANT, segment: "aesthetics", timezone: "America/Sao_Paulo" })
        .returning();
      const scope = tenantScope(tx, tenant.id);

      const [location] = await scope.insert(locations, {
        name: "Unidade Centro",
        address: "Rua das Flores, 123 – Centro, São Paulo/SP",
        phone: "11999990000",
      });
      await scope.insert(rooms, [
        { locationId: location.id, name: "Sala 1" },
        { locationId: location.id, name: "Sala 2" },
      ]);
      await scope.insert(equipment, { locationId: location.id, name: "Laser de diodo" });

      await scope.insert(
        staffUsers,
        STAFF_SEED.map((s) => ({
          name: s.name,
          email: s.email,
          role: s.role,
          passwordHash,
          mustChangePassword: false,
        })),
      );

      const professionalUsers = await scope.insert(
        staffUsers,
        PROFESSIONAL_SEED.map((p) => ({
          name: p.name,
          email: p.email,
          role: "professional" as const,
          passwordHash,
          mustChangePassword: false,
        })),
      );
      const staffIdByEmail = new Map(professionalUsers.map((u) => [u.email, u.id]));

      await scope.insert(
        professionals,
        PROFESSIONAL_SEED.map((p) => ({
          displayName: p.name,
          bio: p.bio,
          color: p.color,
          staffUserId: staffIdByEmail.get(p.email)!,
        })),
      );

      for (const [position, category] of CATALOG.entries()) {
        const [row] = await scope.insert(serviceCategories, {
          name: category.name,
          slug: category.slug,
          position,
        });
        await scope.insert(
          services,
          category.services.map((service) => ({ ...service, categoryId: row.id })),
        );
      }
    });

    if (seedPassword.generated) {
      console.log(`Senha gerada para a equipe de exemplo: ${seedPassword.value}`);
    }

    const serviceCount = CATALOG.reduce((total, c) => total + c.services.length, 0);
    const userCount = STAFF_SEED.length + PROFESSIONAL_SEED.length;
    console.log(
      `Seed ok: /${TENANT.slug} (${CATALOG.length} categorias, ${serviceCount} serviços, ${userCount} usuários)`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
