/**
 * Frontend permission helpers. The backend is the source of truth — these
 * helpers exist only for UX (hide/show affordances). Never rely on them
 * for security; every sensitive action must be gated server-side.
 */
import type { PermissionCode } from "@type/permissions";

/** Normalises input into a Set for O(1) lookups. */
const toSet = (perms: Iterable<PermissionCode> | null | undefined): Set<PermissionCode> => {
  if (!perms) return new Set();
  if (perms instanceof Set) return perms;
  return new Set(perms);
};

/**
 * Returns true if the provided permission set contains every required code.
 */
export function hasAllPermissions(
  userPermissions: Iterable<PermissionCode> | null | undefined,
  required: PermissionCode[]
): boolean {
  const set = toSet(userPermissions);
  return required.every((code) => set.has(code));
}

/**
 * Returns true if the provided permission set contains at least one required code.
 */
export function hasAnyPermission(
  userPermissions: Iterable<PermissionCode> | null | undefined,
  required: PermissionCode[]
): boolean {
  const set = toSet(userPermissions);
  return required.some((code) => set.has(code));
}

/**
 * Returns true if the provided permission set contains the single required code.
 */
export function hasPermission(
  userPermissions: Iterable<PermissionCode> | null | undefined,
  required: PermissionCode
): boolean {
  return toSet(userPermissions).has(required);
}
