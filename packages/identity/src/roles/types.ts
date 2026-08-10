import type { CursorPage } from '@rss/api'
import type { RoleId } from './role-id'

export interface RoleView {
  readonly roleId: RoleId
  readonly name: string
  readonly permissions: readonly string[]
}

export type RolesListResponse = CursorPage<RoleView>

export interface RolesListRequest {
  readonly limit?: number
  readonly cursor?: string
}

export interface RoleAssignRequest {
  readonly subject: string
}

export interface RoleAssignResponse {
  readonly data: { readonly assigned: boolean }
}

export interface RoleRevokeResponse {
  readonly data: { readonly revoked: boolean }
}

export interface RolesCallOptions {
  readonly signal?: AbortSignal
}
