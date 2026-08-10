import type { HttpTransport } from '@rss/api'
import { identityEndpoints } from '@rss/api/endpoints/identity'
import {
  decodeRoleAssignResponse,
  decodeRoleRevokeResponse,
  decodeRolesListResponse,
} from './decoders'
import { isRoleId, type RoleId } from './role-id'
import type {
  RoleAssignRequest,
  RoleAssignResponse,
  RoleRevokeResponse,
  RolesCallOptions,
  RolesListRequest,
  RolesListResponse,
} from './types'

export interface RolesApi {
  list(request?: RolesListRequest, options?: RolesCallOptions): Promise<RolesListResponse>
  assign(
    roleId: RoleId,
    request: RoleAssignRequest,
    options?: RolesCallOptions,
  ): Promise<RoleAssignResponse>
  revoke(roleId: RoleId, subject: string, options?: RolesCallOptions): Promise<RoleRevokeResponse>
}

function reject(message: string): Promise<never> {
  return Promise.reject(new Error(message))
}

function validSubject(subject: unknown): subject is string {
  return typeof subject === 'string' && subject.length > 0
}

function signal(options?: RolesCallOptions) {
  return options?.signal === undefined ? {} : { signal: options.signal }
}

function query(request?: RolesListRequest) {
  if (request === undefined) return undefined
  const keys = Reflect.ownKeys(request)
  if (keys.some((key) => key !== 'limit' && key !== 'cursor')) return undefined
  if (
    request.limit !== undefined &&
    (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 500)
  ) {
    return undefined
  }
  if (request.cursor !== undefined && typeof request.cursor !== 'string') return undefined
  return { limit: request.limit, cursor: request.cursor }
}

export function createRolesApi(transport: HttpTransport): RolesApi {
  return Object.freeze({
    list(request?: RolesListRequest, options?: RolesCallOptions) {
      const requestQuery = query(request)
      if (request !== undefined && requestQuery === undefined)
        return reject('invalid roles list limit')
      return transport.request({
        ...identityEndpoints.rolesList,
        ...(requestQuery === undefined ? {} : { query: requestQuery }),
        decode: decodeRolesListResponse,
        session: 'required',
        ...signal(options),
      })
    },
    assign(roleId: RoleId, request: RoleAssignRequest, options?: RolesCallOptions) {
      if (!isRoleId(roleId)) return reject('invalid roleId')
      if (
        typeof request !== 'object' ||
        request === null ||
        Reflect.ownKeys(request).length !== 1 ||
        !Object.hasOwn(request, 'subject') ||
        !validSubject(request.subject)
      ) {
        return reject('invalid subject')
      }
      return transport.request({
        ...identityEndpoints.rolesAssign,
        pathParams: { roleId },
        body: { subject: request.subject },
        decode: decodeRoleAssignResponse,
        session: 'required-no-replay',
        ...signal(options),
      })
    },
    revoke(roleId: RoleId, subject: string, options?: RolesCallOptions) {
      if (!isRoleId(roleId)) return reject('invalid roleId')
      if (!validSubject(subject)) return reject('invalid subject')
      return transport.request({
        ...identityEndpoints.rolesRevoke,
        pathParams: { roleId, subject },
        decode: decodeRoleRevokeResponse,
        session: 'required',
        ...signal(options),
      })
    },
  })
}
