import type { UserRole } from "./types";

export type Permission =
  | "catalog:view"
  | "catalog:edit"
  | "catalog:publish"
  | "supplier:import"
  | "users:manage"
  | "audit:view";

export const rolePermissions: Record<UserRole, Permission[]> = {
  owner: [
    "catalog:view",
    "catalog:edit",
    "catalog:publish",
    "supplier:import",
    "users:manage",
    "audit:view",
  ],
  manager: [
    "catalog:view",
    "catalog:edit",
    "catalog:publish",
    "supplier:import",
    "audit:view",
  ],
  seller: ["catalog:view"],
};

export function roleCan(role: UserRole, permission: Permission) {
  return rolePermissions[role].includes(permission);
}
