/**
 * identities.ts — identity-management API (accesscore `identitymanage` slice).
 *
 * MVP scope: `type=user`. List (BR-005 provisional envelope) + the mutation
 * surface backing the operation modals: create / edit (PATCH) / lock / unlock /
 * change-password / delete. Edits go through PATCH (a superset of the email-only
 * PUT `update`), so no separate `update` wrapper is needed by the UI.
 */
import { http } from '@gocell/request'
import type {
  HttpAuthUserGetV1Response,
  HttpAuthUserCreateV1Request,
  HttpAuthUserPatchV1Request,
  HttpAuthUserChangePasswordV1Request,
} from '@gocell/contracts'

/** Collection endpoint for user identities (shared by list + create). */
export const USERS_URL = '/api/v1/access/users'

/** Item endpoint for a single identity (edit / delete / lock / unlock / password). */
const userUrl = (id: string): string => `${USERS_URL}/${encodeURIComponent(id)}`

/**
 * A single identity row. Reuses the real get-contract `data` shape
 * (id/username/email/status/createdAt/updatedAt) so the row type stays
 * codegen-derived even while the list envelope is provisional.
 */
export type Identity = HttpAuthUserGetV1Response['data']

/**
 * BR-005 pending: `http.auth.user.list` is not yet delivered by the backend
 * (see docs/backend-requirements/BR-005-user-list.md — the `/users` route group
 * registers 8 handlers, no `list`). The envelope mirrors the established
 * cursor-pagination convention shared by HttpAuditListV1Response and
 * HttpAuthRoleListV1Response (`{ data, nextCursor, hasMore }`). Once the backend
 * ships the schema and `pnpm codegen` derives HttpAuthUserListV1Response, delete
 * this interface and import the generated type instead.
 */
export interface UserListPage {
  data: Identity[]
  nextCursor: string
  hasMore: boolean
}

export interface ListUsersParams {
  cursor?: string
  limit?: number
}

/** GET /users — cursor-paginated identity list. */
export async function listUsers(params: ListUsersParams = {}): Promise<UserListPage> {
  const res = await http.get<UserListPage>(USERS_URL, { params })
  return res.data
}

/** POST /users — create a user identity. Resolves on success; rejects with the
 *  interceptor-mapped error for the caller (modal) to surface inline. */
export async function createUser(body: HttpAuthUserCreateV1Request): Promise<void> {
  await http.post(USERS_URL, body)
}

/** PATCH /users/{id} — partial edit (email / status / requirePasswordReset). */
export async function patchUser(id: string, body: HttpAuthUserPatchV1Request): Promise<void> {
  await http.patch(userUrl(id), body)
}

/** DELETE /users/{id}. */
export async function deleteUser(id: string): Promise<void> {
  await http.delete(userUrl(id))
}

/** POST /users/{id}/lock. */
export async function lockUser(id: string): Promise<void> {
  await http.post(`${userUrl(id)}/lock`)
}

/** POST /users/{id}/unlock. */
export async function unlockUser(id: string): Promise<void> {
  await http.post(`${userUrl(id)}/unlock`)
}

/** POST /users/{id}/password — change password (old + new; rotates the session
 *  for self-service changes). */
export async function changeUserPassword(
  id: string,
  body: HttpAuthUserChangePasswordV1Request,
): Promise<void> {
  await http.post(`${userUrl(id)}/password`, body)
}
