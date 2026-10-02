import type { StaffRole } from "../db/schema";

export const PERMISSIONS = [
  "staff.manage",
  "settings.manage",
  "catalog.manage",
  "finance.view",
  "agenda.manage",
  "agenda.view_own",
  "clients.manage",
  "clinical.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  reception: ["agenda.manage", "agenda.view_own", "clients.manage"],
  professional: ["agenda.view_own", "clinical.manage"],
};

export function can(role: StaffRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Dono(a)",
  reception: "Recepção",
  professional: "Profissional",
};
