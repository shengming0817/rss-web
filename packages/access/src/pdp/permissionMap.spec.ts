import { describe, it, expect } from 'vitest'
import { toPermission } from './permissionMap'

describe('toPermission — UI (action, resource) → backend permission name', () => {
  describe('route-gate page checks (all read) map to registered permissions', () => {
    // Every value below is a registered backend permission
    // (../gocell/framework/pkg/authz/permission.go). Drift here = 400 → route hidden.
    it.each([
      ['read', 'identity', 'user:read'],
      ['read', 'policy', 'policy:read'],
      ['read', 'audit', 'audit:read'],
      ['read', 'config', 'config:read'],
      ['read', 'flag', 'flag:read'],
      ['read', 'cell', 'system:read'],
    ])('%s + %s → %s', (action, resource, expected) => {
      expect(toPermission(action, resource)).toBe(expected)
    })
  })

  describe('resource-domain alias (frontend name → backend domain)', () => {
    it('identity → user', () => {
      expect(toPermission('create', 'identity')).toBe('user:write')
    })
    it('cell → system', () => {
      expect(toPermission('read', 'cell')).toBe('system:read')
    })
  })

  describe('<Can> write-family actions collapse to the domain :write', () => {
    it.each([
      ['create', 'identity', 'user:write'],
      ['update', 'identity', 'user:write'],
      ['delete', 'identity', 'user:write'],
      ['lock', 'identity', 'user:write'],
      ['unlock', 'identity', 'user:write'],
      ['change-password', 'identity', 'user:write'],
      ['rollback', 'config', 'config:write'],
      ['delete', 'flag', 'flag:write'],
    ])('%s + %s → %s', (action, resource, expected) => {
      expect(toPermission(action, resource)).toBe(expected)
    })
  })

  describe('actions with a distinct registered permission keep it', () => {
    it.each([
      ['write', 'config', 'config:write'],
      ['publish', 'config', 'config:publish'],
      ['delete', 'config', 'config:delete'],
      ['write', 'flag', 'flag:write'],
    ])('%s + %s → %s', (action, resource, expected) => {
      expect(toPermission(action, resource)).toBe(expected)
    })
  })

  it('audit verify maps to audit:read (no separate verify permission)', () => {
    expect(toPermission('verify', 'audit')).toBe('audit:read')
  })

  describe('unmapped pairs → best-effort compose (backend rejects → fail-closed)', () => {
    it('role assign/revoke have no user-facing permission → composed → backend 400s', () => {
      // accesscore role assign/revoke is an internal RequireCallerCell route, not a
      // user permission. The composed name is unregistered → 400 → fail-closed hide.
      expect(toPermission('assign', 'role')).toBe('role:assign')
      expect(toPermission('revoke', 'role')).toBe('role:revoke')
    })
    it('unknown resource composes ${resource}:${action}', () => {
      expect(toPermission('read', 'unknown')).toBe('unknown:read')
    })
    it('known resource + unknown action composes ${resource}:${action}', () => {
      expect(toPermission('frobnicate', 'config')).toBe('config:frobnicate')
    })
  })

  describe('no resource → action passed through unchanged', () => {
    it('a bare permission name is forwarded as-is', () => {
      expect(toPermission('system:read', undefined)).toBe('system:read')
    })
    it('a bare action is forwarded as-is (backend validates)', () => {
      expect(toPermission('read', undefined)).toBe('read')
    })
  })
})
