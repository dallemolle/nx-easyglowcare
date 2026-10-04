import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  refreshSessionCookie: vi.fn(),
  recordStaffAudit: vi.fn(),
  changeOwnPassword: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/server/auth/current", () => ({
  requireStaff: mocks.requireStaff,
  refreshSessionCookie: mocks.refreshSessionCookie,
  recordStaffAudit: mocks.recordStaffAudit,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/services/staff", () => {
  class StaffError extends Error {}
  return { StaffError, changeOwnPassword: mocks.changeOwnPassword };
});

import { StaffError } from "@/server/services/staff";

import { changePasswordAction } from "./actions";

const staff = { sessionId: "sessao-1", scope: { tag: "scope" }, user: { id: "actor-id" } };
const input = { currentPassword: "senha-atual-123", newPassword: "senha-nova-456" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireStaff.mockResolvedValue(staff);
});

describe("changePasswordAction", () => {
  it("depois de trocar a senha registra auth.password_changed, sem as senhas", async () => {
    await changePasswordAction(input);

    expect(mocks.requireStaff).toHaveBeenCalledExactlyOnceWith({ allowPasswordChange: true });
    expect(mocks.recordStaffAudit).toHaveBeenCalledExactlyOnceWith(staff, {
      action: "auth.password_changed",
      entity: "staff_user",
      entityId: "actor-id",
    });
    const logged = JSON.stringify(mocks.recordStaffAudit.mock.calls);
    expect(logged).not.toContain("senha-atual-123");
    expect(logged).not.toContain("senha-nova-456");
    expect(mocks.redirect).toHaveBeenCalledWith("/admin");
  });

  it("senha atual errada não é auditada nem redireciona", async () => {
    mocks.changeOwnPassword.mockRejectedValue(new StaffError("Senha atual incorreta."));

    expect(await changePasswordAction(input)).toEqual({ error: "Senha atual incorreta." });
    expect(mocks.recordStaffAudit).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
