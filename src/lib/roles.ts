import type { MessageKey } from "./i18n";

/**
 * User roles — `staff` orders, `admin` manages catalog/users/settings,
 * `owner` is an admin who can also run destructive maintenance (database
 * reset). Owners are created/assigned only from the CLI, never via the API.
 */
export const USER_ROLES = ["owner", "admin", "staff"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const ASSIGNABLE_ROLES = ["admin", "staff"] as const;

export const hasAdminAccess = (role: UserRole | undefined) => role === "admin" || role === "owner";

export const ROLE_LABEL: Record<UserRole, MessageKey> = {
  owner: "users.roleOwner",
  admin: "users.roleAdmin",
  staff: "users.roleStaff",
};
