import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getTestDb, resetDb } from "../../../test/db";
import { hashPassword, verifyPassword } from "../auth/password";
import { createSession, validateSession } from "../auth/session";
import { professionals, sessions, staffUsers, tenants, type StaffUser, type Tenant } from "../db/schema";
import { tenantScope, type TenantScope } from "../db/tenant-scope";

import {
  changeOwnPassword,
  changeStaffRole,
  createStaff,
  listStaff,
  resetStaffPassword,
  setStaffActive,
  StaffError,
} from "./staff";

const db = getTestDb();
const META = { ip: "127.0.0.1", userAgent: "vitest" };
const OWNER_A_PASSWORD = "senhaAtualDaDona1";

let tenantA: Tenant;
let tenantB: Tenant;
let scopeA: TenantScope;
let scopeB: TenantScope;
let ownerA: StaffUser;
let ownerB: StaffUser;
let ownerAPasswordHash: string;

beforeAll(async () => {
  ownerAPasswordHash = await hashPassword(OWNER_A_PASSWORD);
});

beforeEach(async () => {
  await resetDb();

  [tenantA] = await db.insert(tenants).values({ slug: "clinica-a", name: "Clínica A" }).returning();
  [tenantB] = await db.insert(tenants).values({ slug: "clinica-b", name: "Clínica B" }).returning();
  scopeA = tenantScope(db, tenantA.id);
  scopeB = tenantScope(db, tenantB.id);
  void scopeB;

  [ownerA] = await db
    .insert(staffUsers)
    .values({
      tenantId: tenantA.id,
      name: "Ana Dona",
      email: "ana@clinica-a.test",
      passwordHash: ownerAPasswordHash,
      role: "owner",
    })
    .returning();

  [ownerB] = await db
    .insert(staffUsers)
    .values({
      tenantId: tenantB.id,
      name: "Beto Dono",
      email: "beto@clinica-b.test",
      passwordHash: ownerAPasswordHash,
      role: "owner",
    })
    .returning();
});

describe("createStaff", () => {
  it("cadastra recepção com senha provisória e sem linha em professionals", async () => {
    const { user, temporaryPassword } = await createStaff(scopeA, {
      name: "Rita Recepção",
      email: "rita@clinica-a.test",
      role: "reception",
    });

    expect(user.mustChangePassword).toBe(true);
    expect(temporaryPassword).toHaveLength(14);

    const [row] = await db.select().from(staffUsers).where(eq(staffUsers.id, user.id));
    expect(await verifyPassword(row.passwordHash, temporaryPassword)).toBe(true);

    const profRows = await db.select().from(professionals).where(eq(professionals.staffUserId, user.id));
    expect(profRows).toHaveLength(0);
  });

  it("cadastra profissional e cria o professionals vinculado", async () => {
    const { user } = await createStaff(scopeA, {
      name: "Paula Profissional",
      email: "paula@clinica-a.test",
      role: "professional",
    });

    const [prof] = await db.select().from(professionals).where(eq(professionals.staffUserId, user.id));
    expect(prof).toBeDefined();
    expect(prof.displayName).toBe("Paula Profissional");
  });

  it("normaliza o e-mail", async () => {
    const { user } = await createStaff(scopeA, {
      name: "Ana Teste",
      email: " Ana@Clinica.TEST ",
      role: "reception",
    });

    expect(user.email).toBe("ana@clinica.test");
  });

  it("rejeita e-mail duplicado no mesmo tenant", async () => {
    await createStaff(scopeA, { name: "Dup Um", email: "dup@clinica-a.test", role: "reception" });

    await expect(
      createStaff(scopeA, { name: "Dup Dois", email: "dup@clinica-a.test", role: "reception" }),
    ).rejects.toThrow("Este e-mail já está em uso.");
  });

  it("rejeita e-mail duplicado em outro tenant", async () => {
    await expect(
      createStaff(scopeA, { name: "Clone do Dono B", email: ownerB.email, role: "reception" }),
    ).rejects.toThrow("Este e-mail já está em uso.");
  });

  it("rejeita entrada inválida (nome com 1 caractere)", async () => {
    await expect(
      createStaff(scopeA, { name: "A", email: "a@clinica-a.test", role: "reception" }),
    ).rejects.toThrow("Informe o nome.");
  });
});

describe("listStaff", () => {
  it("não expõe o hash, ordena por nome e só traz usuários do tenant do escopo", async () => {
    await createStaff(scopeA, { name: "Zeca", email: "zeca@clinica-a.test", role: "reception" });
    await createStaff(scopeA, { name: "Beatriz", email: "bea@clinica-a.test", role: "reception" });

    const list = await listStaff(scopeA);

    expect(list.every((item) => !("passwordHash" in item))).toBe(true);
    expect(list.map((item) => item.name)).toEqual(["Ana Dona", "Beatriz", "Zeca"]);
    expect(list.some((item) => item.id === ownerB.id)).toBe(false);
  });
});

describe("não altera a si mesmo", () => {
  it("changeStaffRole recusa quando o alvo é o próprio actor", async () => {
    await expect(changeStaffRole(scopeA, ownerA, ownerA.id, "reception")).rejects.toThrow(
      "Você não pode alterar a sua própria conta por aqui.",
    );
  });

  it("setStaffActive recusa quando o alvo é o próprio actor", async () => {
    await expect(setStaffActive(scopeA, ownerA, ownerA.id, false)).rejects.toThrow(
      "Você não pode alterar a sua própria conta por aqui.",
    );
  });

  it("resetStaffPassword recusa quando o alvo é o próprio actor", async () => {
    await expect(resetStaffPassword(scopeA, ownerA, ownerA.id)).rejects.toThrow(
      "Você não pode alterar a sua própria conta por aqui.",
    );
  });
});

describe("id de outro tenant", () => {
  it("changeStaffRole não encontra o usuário de outro tenant e não o altera", async () => {
    await expect(changeStaffRole(scopeA, ownerA, ownerB.id, "reception")).rejects.toThrow(
      "Usuário não encontrado.",
    );

    const [stillOwner] = await db.select().from(staffUsers).where(eq(staffUsers.id, ownerB.id));
    expect(stillOwner.role).toBe("owner");
  });
});

describe("regra do último dono ativo", () => {
  let reception: StaffUser;

  beforeEach(async () => {
    const created = await createStaff(scopeA, {
      name: "Recepção A",
      email: "recepcao@clinica-a.test",
      role: "reception",
    });
    [reception] = await db.select().from(staffUsers).where(eq(staffUsers.id, created.user.id));
  });

  it("recusa rebaixar o último dono ativo", async () => {
    await expect(changeStaffRole(scopeA, reception, ownerA.id, "reception")).rejects.toThrow(
      "A clínica precisa de pelo menos um(a) dono(a) ativo(a).",
    );

    const [stillOwner] = await db.select().from(staffUsers).where(eq(staffUsers.id, ownerA.id));
    expect(stillOwner.role).toBe("owner");
  });

  it("recusa desativar o último dono ativo", async () => {
    await expect(setStaffActive(scopeA, reception, ownerA.id, false)).rejects.toThrow(
      "A clínica precisa de pelo menos um(a) dono(a) ativo(a).",
    );

    const [stillActive] = await db.select().from(staffUsers).where(eq(staffUsers.id, ownerA.id));
    expect(stillActive.isActive).toBe(true);
  });

  it("dono desativado não conta: rebaixar o único dono ativo continua recusado", async () => {
    await db.insert(staffUsers).values({
      tenantId: tenantA.id,
      name: "Dono Desativado",
      email: "desativado@clinica-a.test",
      passwordHash: ownerAPasswordHash,
      role: "owner",
      isActive: false,
    });

    await expect(changeStaffRole(scopeA, reception, ownerA.id, "reception")).rejects.toThrow(
      "A clínica precisa de pelo menos um(a) dono(a) ativo(a).",
    );
  });

  it("permite rebaixar outro dono quando há mais de um dono ativo", async () => {
    const [secondOwner] = await db
      .insert(staffUsers)
      .values({
        tenantId: tenantA.id,
        name: "Segundo Dono",
        email: "segundo@clinica-a.test",
        passwordHash: ownerAPasswordHash,
        role: "owner",
      })
      .returning();

    await changeStaffRole(scopeA, ownerA, secondOwner.id, "reception");

    const [after] = await db.select().from(staffUsers).where(eq(staffUsers.id, secondOwner.id));
    expect(after.role).toBe("reception");
  });

  it("permite desativar outro dono quando há mais de um dono ativo e revoga as sessões dele", async () => {
    const [secondOwner] = await db
      .insert(staffUsers)
      .values({
        tenantId: tenantA.id,
        name: "Terceiro Dono",
        email: "terceiro@clinica-a.test",
        passwordHash: ownerAPasswordHash,
        role: "owner",
      })
      .returning();
    const { cookieValue } = await createSession(db, secondOwner, META);
    const beforeDeactivation = await validateSession(db, cookieValue);

    await setStaffActive(scopeA, ownerA, secondOwner.id, false);

    const [after] = await db.select().from(staffUsers).where(eq(staffUsers.id, secondOwner.id));
    expect(after.isActive).toBe(false);
    // Verifica a sessão diretamente (não só via validateSession): validateSession também
    // devolveria null só por causa de isActive = false, mesmo sem a sessão ser revogada.
    const [sessionRow] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, beforeDeactivation!.sessionId));
    expect(sessionRow.revokedAt).not.toBeNull();
  });
});

describe("changeStaffRole para professional", () => {
  it("cria o professionals vinculado se não existir", async () => {
    const { user } = await createStaff(scopeA, {
      name: "Clara Recepção",
      email: "clara@clinica-a.test",
      role: "reception",
    });

    await changeStaffRole(scopeA, ownerA, user.id, "professional");

    const rows = await db.select().from(professionals).where(eq(professionals.staffUserId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe("Clara Recepção");
  });

  it("não duplica se já existir", async () => {
    const { user } = await createStaff(scopeA, {
      name: "Davi Profissional",
      email: "davi@clinica-a.test",
      role: "professional",
    });

    await changeStaffRole(scopeA, ownerA, user.id, "reception");
    await changeStaffRole(scopeA, ownerA, user.id, "professional");

    const rows = await db.select().from(professionals).where(eq(professionals.staffUserId, user.id));
    expect(rows).toHaveLength(1);
  });
});

describe("o papel novo vale na próxima validação de sessão", () => {
  it("validateSession devolve o papel atualizado", async () => {
    const { user } = await createStaff(scopeA, {
      name: "Fabio Recepção",
      email: "fabio@clinica-a.test",
      role: "reception",
    });
    const [fullUser] = await db.select().from(staffUsers).where(eq(staffUsers.id, user.id));
    const { cookieValue } = await createSession(db, fullUser, META);

    await changeStaffRole(scopeA, ownerA, user.id, "professional");

    const result = await validateSession(db, cookieValue);
    expect(result?.user.role).toBe("professional");
  });
});

describe("resetStaffPassword", () => {
  it("gera provisória de 14 caracteres, invalida a antiga, exige troca e revoga sessões", async () => {
    const { user, temporaryPassword: oldPassword } = await createStaff(scopeA, {
      name: "Gustavo Recepção",
      email: "gustavo@clinica-a.test",
      role: "reception",
    });
    const [fullUser] = await db.select().from(staffUsers).where(eq(staffUsers.id, user.id));
    const { cookieValue } = await createSession(db, fullUser, META);

    const { temporaryPassword } = await resetStaffPassword(scopeA, ownerA, user.id);

    expect(temporaryPassword).toHaveLength(14);

    const [updated] = await db.select().from(staffUsers).where(eq(staffUsers.id, user.id));
    expect(await verifyPassword(updated.passwordHash, oldPassword)).toBe(false);
    expect(await verifyPassword(updated.passwordHash, temporaryPassword)).toBe(true);
    expect(updated.mustChangePassword).toBe(true);

    expect(await validateSession(db, cookieValue)).toBeNull();
  });
});

describe("changeOwnPassword", () => {
  it("recusa quando a senha atual está errada", async () => {
    await expect(
      changeOwnPassword(scopeA, ownerA, "sessao-qualquer", {
        currentPassword: "senha-errada-123",
        newPassword: "senha-nova-456",
      }),
    ).rejects.toThrow("Senha atual incorreta.");
  });

  it("rejeita entrada inválida (nova senha igual à atual)", async () => {
    await expect(
      changeOwnPassword(scopeA, ownerA, "sessao-qualquer", {
        currentPassword: OWNER_A_PASSWORD,
        newPassword: OWNER_A_PASSWORD,
      }),
    ).rejects.toThrow("A nova senha deve ser diferente da atual.");
  });

  it("troca o hash, limpa mustChangePassword, mantém a sessão atual e revoga as outras", async () => {
    const otherSession = await createSession(db, ownerA, META);
    const currentSession = await createSession(db, ownerA, META);
    const current = await validateSession(db, currentSession.cookieValue);

    await changeOwnPassword(scopeA, ownerA, current!.sessionId, {
      currentPassword: OWNER_A_PASSWORD,
      newPassword: "senhaNovaDaConta1",
    });

    const [updated] = await db.select().from(staffUsers).where(eq(staffUsers.id, ownerA.id));
    expect(await verifyPassword(updated.passwordHash, "senhaNovaDaConta1")).toBe(true);
    expect(updated.mustChangePassword).toBe(false);

    expect(await validateSession(db, currentSession.cookieValue)).not.toBeNull();
    expect(await validateSession(db, otherSession.cookieValue)).toBeNull();
  });
});

describe("StaffError", () => {
  it("é uma instância de Error com a mensagem pronta para exibir", () => {
    const error = new StaffError("mensagem de teste");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("mensagem de teste");
  });
});
