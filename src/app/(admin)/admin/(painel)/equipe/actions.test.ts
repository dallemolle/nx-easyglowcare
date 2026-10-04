import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  refreshSessionCookie: vi.fn(),
  recordStaffAudit: vi.fn(),
  revalidatePath: vi.fn(),
  createStaff: vi.fn(),
  changeStaffRole: vi.fn(),
  setStaffActive: vi.fn(),
  resetStaffPassword: vi.fn(),
}));

vi.mock("@/server/auth/current", () => ({
  requirePermission: mocks.requirePermission,
  refreshSessionCookie: mocks.refreshSessionCookie,
  recordStaffAudit: mocks.recordStaffAudit,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/services/staff", () => {
  class StaffError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "StaffError";
    }
  }
  return {
    StaffError,
    createStaff: mocks.createStaff,
    changeStaffRole: mocks.changeStaffRole,
    setStaffActive: mocks.setStaffActive,
    resetStaffPassword: mocks.resetStaffPassword,
  };
});

import { StaffError } from "@/server/services/staff";

import {
  changeRoleAction,
  createStaffAction,
  resetPasswordAction,
  setActiveAction,
} from "./actions";

const ID = "3f2b8c1e-5d4a-4b7e-9a1c-2d6e8f0a1b3c";
const staff = { scope: { tag: "scope" }, user: { id: "actor-id" } };

const cases = [
  {
    name: "createStaffAction",
    service: mocks.createStaff,
    call: () => createStaffAction({ name: "Ana", email: "a@b.co", role: "owner" }),
    resolved: { user: { id: ID, role: "owner" }, temporaryPassword: "senha-provisoria" },
    audit: { action: "staff.created", entity: "staff_user", entityId: ID, metadata: { role: "owner" } },
  },
  {
    name: "changeRoleAction",
    service: mocks.changeStaffRole,
    call: () => changeRoleAction(ID, "owner"),
    resolved: { previousRole: "reception" },
    audit: {
      action: "staff.role_changed",
      entity: "staff_user",
      entityId: ID,
      metadata: { from: "reception", to: "owner" },
    },
  },
  {
    name: "setActiveAction",
    service: mocks.setStaffActive,
    call: () => setActiveAction(ID, false),
    resolved: undefined,
    audit: { action: "staff.deactivated", entity: "staff_user", entityId: ID },
  },
  {
    name: "resetPasswordAction",
    service: mocks.resetStaffPassword,
    call: () => resetPasswordAction(ID),
    resolved: { temporaryPassword: "senha-provisoria" },
    audit: { action: "staff.password_reset", entity: "staff_user", entityId: ID },
  },
];

const services = [
  mocks.createStaff,
  mocks.changeStaffRole,
  mocks.setStaffActive,
  mocks.resetStaffPassword,
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requirePermission.mockResolvedValue(staff);
  mocks.refreshSessionCookie.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(cases)("$name", ({ service, call, resolved, audit }) => {
  it("sem permissão, a rejeição propaga e nenhum serviço é chamado", async () => {
    const denied = new Error("NEXT_NOT_FOUND");
    mocks.requirePermission.mockRejectedValue(denied);

    await expect(call()).rejects.toBe(denied);

    for (const fn of services) expect(fn).not.toHaveBeenCalled();
    expect(mocks.refreshSessionCookie).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.recordStaffAudit).not.toHaveBeenCalled();
  });

  it("depois do sucesso registra a auditoria, sem a senha provisória", async () => {
    service.mockResolvedValue(resolved);

    await call();

    expect(mocks.recordStaffAudit).toHaveBeenCalledExactlyOnceWith(staff, audit);
    expect(JSON.stringify(mocks.recordStaffAudit.mock.calls)).not.toContain("senha-provisoria");
    expect(service.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.recordStaffAudit.mock.invocationCallOrder[0],
    );
  });

  it("se o serviço falhar, nada é auditado", async () => {
    service.mockRejectedValue(new StaffError("Usuário não encontrado."));

    await call();

    expect(mocks.recordStaffAudit).not.toHaveBeenCalled();
  });

  it("exige exatamente staff.manage", async () => {
    service.mockResolvedValue(resolved);
    await call();
    expect(mocks.requirePermission).toHaveBeenCalledExactlyOnceWith("staff.manage");
  });

  it("caminho feliz: serviço recebe scope e usuário, renova antes e revalida", async () => {
    service.mockResolvedValue(resolved);

    const result = await call();

    expect(result.ok).toBe(true);
    expect(service.mock.calls[0][0]).toBe(staff.scope);
    if (service !== mocks.createStaff) expect(service.mock.calls[0][1]).toBe(staff.user);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/equipe");
    expect(mocks.refreshSessionCookie.mock.invocationCallOrder[0]).toBeLessThan(
      service.mock.invocationCallOrder[0],
    );
  });

  it("se renovar o cookie falhar, o serviço não é chamado", async () => {
    mocks.refreshSessionCookie.mockRejectedValue(new Error("falha"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await call();

    expect(result.ok).toBe(false);
    expect(service).not.toHaveBeenCalled();
  });

  it("StaffError vira mensagem pronta", async () => {
    service.mockRejectedValue(new StaffError("Este e-mail já está em uso."));
    expect(await call()).toEqual({ ok: false, error: "Este e-mail já está em uso." });
  });

  it("erro desconhecido vira mensagem genérica e o log não carrega a mensagem", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = "Failed query: insert ... params: hash-secreto";
    service.mockRejectedValue(Object.assign(new Error(secret), { cause: { code: "08006" } }));

    expect(await call()).toEqual({
      ok: false,
      error: "Não foi possível concluir. Tente novamente.",
    });

    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain("hash-secreto");
    expect(logged).not.toContain("Failed query");
    expect(logged).toContain("08006");
  });
});

it("setActiveAction(id, true) registra staff.reactivated", async () => {
  mocks.setStaffActive.mockResolvedValue(undefined);

  await setActiveAction(ID, true);

  expect(mocks.recordStaffAudit).toHaveBeenCalledExactlyOnceWith(staff, {
    action: "staff.reactivated",
    entity: "staff_user",
    entityId: ID,
  });
});

describe("validação dos argumentos (depois da permissão)", () => {
  const invalid = { ok: false, error: "Dados inválidos." };

  it("changeRoleAction recusa id que não é UUID e papel inválido", async () => {
    expect(await changeRoleAction("não-uuid", "owner")).toEqual(invalid);
    expect(await changeRoleAction(ID, "admin")).toEqual(invalid);
    expect(mocks.changeStaffRole).not.toHaveBeenCalled();
  });

  it("setActiveAction recusa id inválido e isActive não booleano", async () => {
    expect(await setActiveAction("x", true)).toEqual(invalid);
    expect(await setActiveAction(ID, "false")).toEqual(invalid);
    expect(mocks.setStaffActive).not.toHaveBeenCalled();
  });

  it("resetPasswordAction recusa id inválido", async () => {
    expect(await resetPasswordAction(42)).toEqual(invalid);
    expect(mocks.resetStaffPassword).not.toHaveBeenCalled();
  });
});
