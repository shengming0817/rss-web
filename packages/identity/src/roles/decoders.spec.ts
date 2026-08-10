import { describe, expect, it } from 'vitest'
import {
  decodeRoleAssignResponse,
  decodeRoleRevokeResponse,
  decodeRolesListResponse,
} from './decoders'

const page = {
  data: [
    {
      roleId: 'ops:admin',
      name: 'Operations administrator',
      permissions: ['identity:role:read', 'settings.config-get'],
    },
  ],
  hasMore: true,
  nextCursor: 'opaque-cursor',
}

describe('Roles decoders', () => {
  it('keeps role permissions and cursor as opaque server facts', () => {
    expect(decodeRolesListResponse(page)).toEqual(page)
  })

  it.each([
    { ...page, extra: true },
    { ...page, data: [{ ...page.data[0], extra: true }] },
    { ...page, data: [{ ...page.data[0], permissions: [1] }] },
    { ...page, hasMore: 'true' },
    { ...page, nextCursor: 1 },
  ])('rejects drifted list response %#', (value) => {
    expect(() => decodeRolesListResponse(value)).toThrow('roles list')
  })

  it.each([
    [decodeRoleAssignResponse, { data: { assigned: true } }, { data: { assigned: true } }],
    [decodeRoleAssignResponse, { data: { assigned: false } }, { data: { assigned: false } }],
    [decodeRoleRevokeResponse, { data: { revoked: true } }, { data: { revoked: true } }],
    [decodeRoleRevokeResponse, { data: { revoked: false } }, { data: { revoked: false } }],
  ] as const)('decodes an exact independent command receipt', (decode, value, expected) => {
    expect(decode(value)).toEqual(expected)
  })

  it.each([
    [decodeRoleAssignResponse, { data: { assigned: true, binding: {} } }],
    [decodeRoleAssignResponse, { data: { assigned: 'true' } }],
    [decodeRoleRevokeResponse, { data: { revoked: true }, history: [] }],
    [decodeRoleRevokeResponse, { data: {} }],
  ] as const)('rejects command receipt drift %#', (decode, value) => {
    expect(() => decode(value)).toThrow('role command')
  })
})
