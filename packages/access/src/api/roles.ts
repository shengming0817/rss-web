/**
 * roles.ts — role-management API (accesscore `rolebinding` slice).
 *
 * ## Per-user list shape
 * The backend exposes `GET /api/v1/access/roles/{userId}` which returns the roles
 * assigned to ONE user, not a global role catalogue. The response envelope follows
 * the established cursor-pagination convention shared by HttpAuthRoleListV1Response
 * (`{ data, nextCursor, hasMore }`). `listUserRoles` unwraps `res.data.data` so
 * callers receive a flat `Role[]` — they only need the assigned-roles array.
 *
 * ## assign / revoke: internal → public path gap
 * The backend currently exposes assign/revoke only as internal service routes:
 *   - internal: POST /internal/v1/access/roles/assign
 *   - internal: POST /internal/v1/access/roles/revoke
 * These are not yet browser-reachable. Per the project directive "忽略后端缺口，先实现"
 * and the precedent set by `identities.ts` (BR-005 provisional envelope), this module
 * wires against the intended PUBLIC mirror paths:
 *   - POST /api/v1/access/roles/assign
 *   - POST /api/v1/access/roles/revoke
 * Once the backend ships the public routes under `/api/v1/access/roles/`, remove this
 * comment and update `docs/backend-requirements/` accordingly.
 */
import { http } from '@gocell/request'
import type {
  HttpAuthRoleListV1Response,
  HttpAuthRoleAssignV1Request,
  HttpAuthRoleAssignV1Response,
  HttpAuthRoleRevokeV1Request,
  HttpAuthRoleRevokeV1Response,
} from '@gocell/contracts'

/** Collection base URL for role operations. */
export const ROLES_URL = '/api/v1/access/roles'

/**
 * A single role row. Derived from the codegen contract so it stays
 * synchronized with the backend schema without manual duplication.
 */
export type Role = HttpAuthRoleListV1Response['data'][number]

/**
 * GET /api/v1/access/roles/{userId} — roles assigned to that user.
 * Returns the flat role array from the cursor-paginated envelope.
 * userId is percent-encoded to handle special characters safely.
 */
export async function listUserRoles(userId: string): Promise<Role[]> {
  const res = await http.get<HttpAuthRoleListV1Response>(
    `${ROLES_URL}/${encodeURIComponent(userId)}`,
  )
  return res.data.data
}

/**
 * POST /api/v1/access/roles/assign — assign a role to a user.
 * Resolves void on success; rejects with the interceptor-mapped error
 * for the caller (modal / panel) to surface inline.
 *
 * Note: the backend currently exposes this as an internal route
 * (/internal/v1/access/roles/assign). See module-level comment above.
 */
export async function assignRole(body: HttpAuthRoleAssignV1Request): Promise<void> {
  await http.post<HttpAuthRoleAssignV1Response>(`${ROLES_URL}/assign`, body)
}

/**
 * POST /api/v1/access/roles/revoke — revoke a role from a user.
 * Resolves void on success; rejects with the interceptor-mapped error
 * for the caller to surface inline.
 *
 * Note: the backend currently exposes this as an internal route
 * (/internal/v1/access/roles/revoke). See module-level comment above.
 */
export async function revokeRole(body: HttpAuthRoleRevokeV1Request): Promise<void> {
  await http.post<HttpAuthRoleRevokeV1Response>(`${ROLES_URL}/revoke`, body)
}
