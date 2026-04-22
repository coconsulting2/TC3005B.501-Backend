import type { UserRole } from "@type/roles";

/**
 * Canonical permission code in the form `resource:action`.
 * Kept as `string` (not a union) so the frontend stays decoupled
 * from the backend catalog — the authoritative list lives in the
 * backend seed. Components that need strict checking can narrow
 * via KnownPermission below.
 */
export type PermissionCode = string;

/**
 * Commonly-checked permission codes, provided for typo-safe usage.
 * This is a non-exhaustive allowlist — any string is still valid
 * at runtime; this type just documents the well-known codes.
 */
export type KnownPermission =
  | "travel_request:create"
  | "travel_request:view_own"
  | "travel_request:view_any"
  | "travel_request:edit_own"
  | "travel_request:submit"
  | "travel_request:cancel"
  | "travel_request:authorize"
  | "travel_agent:attend"
  | "accounts_payable:attend"
  | "accounting:export"
  | "receipt:upload"
  | "receipt:delete_own"
  | "receipt:validate"
  | "expense:view"
  | "expense:submit"
  | "authorizer:view_alerts"
  | "user:view_self"
  | "user:list"
  | "user:create"
  | "user:edit"
  | "permission:read"
  | "permission:write"
  | "permission_group:manage"
  | "role:manage_permissions"
  | "user:manage_permissions";

/** Response shape of `GET /api/user/me/permissions`. */
export interface MePermissionsResponse {
  userId: number;
  role: UserRole;
  permissions: PermissionCode[];
}
