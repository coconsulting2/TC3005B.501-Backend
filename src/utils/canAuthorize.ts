/**
 * Author: Emiliano Deyta Illescas
 *
 * Description:
 * Single source of truth for "is this role allowed to take an
 * approve / reject action on a travel request". Used by the
 * approval inbox (`/autorizaciones`) and the request detail page
 * (`/autorizar-solicitud/:id`) to drive the read-only mode for
 * notification roles such as `Administrador` and to keep route
 * access decisions in sync.
 *
 * The frontend is *not* the source of truth for permissions —
 * the backend always re-checks before mutating state. This helper
 * exists purely to hide affordances the user can't use.
 */

import type { UserRole } from "@type/roles";

const APPROVER_ROLES = new Set<UserRole>(["N1", "N2"]);

export function canAuthorizeRequest(role: UserRole | string | undefined): boolean {
  if (!role) return false;
  return APPROVER_ROLES.has(role as UserRole);
}
