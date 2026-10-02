import { describe, expect, it } from "vitest";

import type { StaffRole } from "../db/schema";

import { can, PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS, type Permission } from "./permissions";

const MATRIX: Array<[Permission, StaffRole, boolean]> = [
  ["staff.manage", "owner", true],
  ["staff.manage", "reception", false],
  ["staff.manage", "professional", false],

  ["settings.manage", "owner", true],
  ["settings.manage", "reception", false],
  ["settings.manage", "professional", false],

  ["catalog.manage", "owner", true],
  ["catalog.manage", "reception", false],
  ["catalog.manage", "professional", false],

  ["finance.view", "owner", true],
  ["finance.view", "reception", false],
  ["finance.view", "professional", false],

  ["agenda.manage", "owner", true],
  ["agenda.manage", "reception", true],
  ["agenda.manage", "professional", false],

  ["agenda.view_own", "owner", true],
  ["agenda.view_own", "reception", true],
  ["agenda.view_own", "professional", true],

  ["clients.manage", "owner", true],
  ["clients.manage", "reception", true],
  ["clients.manage", "professional", false],

  ["clinical.manage", "owner", true],
  ["clinical.manage", "reception", false],
  ["clinical.manage", "professional", true],
];

describe("can", () => {
  it.each(MATRIX)("%s para %s deve ser %s", (permission, role, expected) => {
    expect(can(role, permission)).toBe(expected);
  });

  it("owner tem todas as permissões", () => {
    for (const permission of PERMISSIONS) {
      expect(can("owner", permission)).toBe(true);
    }
  });
});

describe("ROLE_LABELS", () => {
  it("traz os rótulos em português para cada papel", () => {
    expect(ROLE_LABELS).toEqual({
      owner: "Dono(a)",
      reception: "Recepção",
      professional: "Profissional",
    });
  });
});

describe("ROLE_PERMISSIONS", () => {
  it("tem uma entrada para cada papel", () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(["owner", "professional", "reception"]);
  });
});
