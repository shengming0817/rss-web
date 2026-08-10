import type { CursorPage } from '@rss/api'

export interface RoleView {
  readonly roleId: string
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
