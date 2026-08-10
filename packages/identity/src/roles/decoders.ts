import { decodeCursorPage } from '@rss/api'
import { parseRoleId } from './role-id'
import type { RoleAssignResponse, RoleRevokeResponse, RolesListResponse, RoleView } from './types'

function invalid(kind: 'roles list' | 'role command'): never {
  throw new Error(`invalid ${kind} response`)
}

function exactRecord(value: unknown, keys: readonly string[], kind: 'roles list' | 'role command') {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(kind)
  const record = value as Record<string, unknown>
  if (
    Object.keys(record).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(record, key))
  ) {
    invalid(kind)
  }
  return record
}

function text(value: unknown): string {
  if (typeof value !== 'string') invalid('roles list')
  return value
}

function role(value: unknown): RoleView {
  const record = exactRecord(value, ['roleId', 'name', 'permissions'], 'roles list')
  if (!Array.isArray(record.permissions)) invalid('roles list')
  const roleId = parseRoleId(record.roleId)
  if (roleId === undefined) invalid('roles list')
  return Object.freeze({
    roleId,
    name: text(record.name),
    permissions: Object.freeze(record.permissions.map(text)),
  })
}

const decodePage = decodeCursorPage(role)

export function decodeRolesListResponse(value: unknown): RolesListResponse {
  try {
    const page = decodePage(value)
    return Object.freeze({
      data: Object.freeze([...page.data]),
      hasMore: page.hasMore,
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
    })
  } catch {
    return invalid('roles list')
  }
}

function receipt(value: unknown, field: 'assigned' | 'revoked') {
  const envelope = exactRecord(value, ['data'], 'role command')
  const data = exactRecord(envelope.data, [field], 'role command')
  if (typeof data[field] !== 'boolean') invalid('role command')
  return data[field] as boolean
}

export function decodeRoleAssignResponse(value: unknown): RoleAssignResponse {
  return Object.freeze({ data: Object.freeze({ assigned: receipt(value, 'assigned') }) })
}

export function decodeRoleRevokeResponse(value: unknown): RoleRevokeResponse {
  return Object.freeze({ data: Object.freeze({ revoked: receipt(value, 'revoked') }) })
}
