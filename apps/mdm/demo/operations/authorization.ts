import { randomUUID } from 'node:crypto'
import { TENANT, type DemoRequest, type DomainHandler } from '../scenario'
import { createReceipts, error, ok } from '../http'
import { closed, count, uuid } from '../../src/services/decode'
import {
  rule,
  groupDefinition,
  permissions,
  devicePermissions,
  type Rule,
  type UserGroup,
  type Permission,
  type Revision,
} from '../../src/features/operations/clients/authorization'
import type { AuditEntry } from '../../src/features/operations/clients/model'
export const INSTANCE = '44444444-4444-4444-8444-444444444444'
export const ADMIN = '22222222-2222-4222-8222-222222222222'
export const ADMIN_RULE = '55555555-5555-4555-8555-555555555555'
export const REVIEWER = '33333333-3333-4333-8333-333333333333'
const provider = '66666666-6666-4666-8666-666666666666'
export function createAuthorizationDemo(
  now: () => number,
  record: (input: Omit<AuditEntry, 'id' | 'stream' | 'stage' | 'status'>) => unknown,
) {
  const rules = new Map<string, Revision<Rule>>(),
    groups = new Map<string, Revision<UserGroup>>(),
    receipts = createReceipts()
  const source = {
    providerId: provider,
    issuer: 'https://idp.example.test',
    configurationVersion: 1,
  }
  let snapshot = randomUUID()
  function reset() {
    rules.clear()
    groups.clear()
    receipts.reset()
    snapshot = randomUUID()
    const user = (id: string) => ({
      kind: 'user' as const,
      user: { instanceId: INSTANCE, tenantId: TENANT, principalId: id },
    })
    rules.set(ADMIN_RULE, {
      id: ADMIN_RULE,
      revision: 1,
      value: {
        subject: user(ADMIN),
        grants: permissions.map((operation) => ({
          operation,
          scope: (devicePermissions as readonly string[]).includes(operation)
            ? { kind: 'all_devices' as const }
            : { kind: 'tenant' as const },
        })),
      },
    })
    const id = '77777777-7777-4777-8777-777777777777'
    rules.set(id, {
      id,
      revision: 1,
      value: {
        subject: user(REVIEWER),
        grants: [
          'authorization_read',
          'user_group_read',
          'department_read',
          'inventory_read',
          'operation_read',
        ].map((name) => ({
          operation: name as Permission,
          scope: (devicePermissions as readonly string[]).includes(name)
            ? { kind: 'all_devices' as const }
            : { kind: 'tenant' as const },
        })),
      },
    })
  }
  function effective(actor: string) {
    return [...rules.values()].flatMap((r) => {
      const value = r.value
      if (!value) return []
      const s = value.subject
      const matches =
        s.kind === 'user'
          ? s.user.principalId === actor && s.user.instanceId === INSTANCE
          : s.kind === 'user_group'
            ? groups.get(s.id)?.value?.enabled &&
              groups.get(s.id)?.value?.members.some((m) => m.principalId === actor)
            : actor === ADMIN &&
              s.source.providerId === provider &&
              s.source.issuer === source.issuer &&
              s.source.configurationVersion === 1 &&
              (s.kind === 'idp_group'
                ? s.id === 'it-admins'
                : s.id === 'it' || (s.matching === 'subtree' && s.id === 'root'))
      return matches
        ? value.grants.map((g) => ({
            ...g,
            ruleId: r.id,
            ruleRevision: r.revision,
            subject: s,
            observation:
              s.kind === 'department' || s.kind === 'idp_group'
                ? {
                    snapshotId: snapshot,
                    observedAt: now(),
                    expiresAt: now() + 3600,
                    sourceRevision: 'demo-1',
                  }
                : null,
          }))
        : []
    })
  }
  function can(actor: string, permission: Permission, device?: string) {
    return effective(actor).some(
      (g) =>
        g.operation === permission &&
        (device
          ? g.scope.kind === 'all_devices' || (g.scope.kind === 'device' && g.scope.id === device)
          : g.scope.kind === 'tenant'),
    )
  }
  function guard(request: DemoRequest) {
    const path = request.path
    if (path.startsWith('/api/v1/authorization')) return
    if (path.startsWith('/api/mdm-candidate/v1/devices')) {
      const device = /^\/api\/mdm-candidate\/v1\/devices\/([^/]+)$/.exec(path)?.[1]
      if (
        request.method === 'GET' &&
        (device
          ? !can(request.actor.principalId, 'inventory_read', device)
          : !effective(request.actor.principalId).some(
              (g) => g.operation === 'inventory_read' && g.scope.kind === 'all_devices',
            ))
      )
        return error('permission_denied', 403)
    }
    if (/^\/api\/mdm-candidate\/v1\/(?:authorization|integrations|operations)(?:\/|$)/.test(path)) {
      // Candidate management grants are demo decisions, never added to the real Permission enum.
      const permission = request.method === 'GET' ? 'authorization_read' : 'authorization_write'
      if (!can(request.actor.principalId, permission)) return error('permission_denied', 403)
    }
  }
  const handle: DomainHandler = (request, scenario) => {
    const match =
      /^\/api\/v1\/authorization(?:\/(rules|user-groups|departments)(?:\/([^/]+)(?:\/(members))?)?)?$/.exec(
        request.path,
      )
    if (!match) return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      const [, kind, id, members] = match,
        actor = request.actor.principalId
      if (request.method === 'GET') {
        if (!kind)
          return ok({
            instanceId: INSTANCE,
            tenantId: TENANT,
            principalId: actor,
            grants: effective(actor),
          })
        const permission =
          kind === 'rules'
            ? 'authorization_read'
            : kind === 'departments'
              ? 'department_read'
              : 'user_group_read'
        if (!can(actor, permission)) return error('permission_denied', 403)
        if (kind === 'departments') {
          if (scenario === 'partial') return ok({ status: 'expired' })
          if (actor !== ADMIN || scenario === 'empty')
            return ok({ status: 'unavailable', reason: 'not_observed' })
          return ok({
            status: 'available',
            source,
            snapshotId: snapshot,
            observedAt: now(),
            expiresAt: now() + 3600,
            snapshot: {
              version: 1,
              sourceRevision: 'demo-1',
              nodes: [
                { id: 'root', displayName: 'Example organization', parentId: null },
                { id: 'it', displayName: 'IT', parentId: 'root' },
              ],
              memberships: ['it'],
            },
          })
        }
        if (id) {
          if (kind !== 'user-groups' || !members) return error('malformed_request', 400)
          uuid(id)
          const value = groups.get(id)
          if (!value?.value) return error('group_not_found', 404)
          const offset = count(Number(request.query.get('offset') ?? 0)),
            revision = request.query.has('expectedRevision')
              ? count(Number(request.query.get('expectedRevision')))
              : null
          if (offset > 10000) return error('malformed_request', 400)
          if (
            (offset > 0 && revision === null) ||
            (revision !== null && revision !== value.revision)
          )
            return error('operation_conflict')
          return ok({
            id,
            revision: value.revision,
            items: value.value.members.slice(offset, offset + 100),
            nextOffset: offset + 100 < value.value.members.length ? offset + 100 : null,
          })
        }
        const after = request.query.has('after') ? uuid(request.query.get('after')) : null
        const values =
          kind === 'rules'
            ? [...rules.values()]
            : [...groups.values()].map((r) => ({
                ...r,
                value: r.value
                  ? {
                      name: r.value.name,
                      enabled: r.value.enabled,
                      memberCount: r.value.members.length,
                    }
                  : null,
              }))
        const selected = (scenario === 'empty' ? [] : values)
          .sort((a, b) => a.id.localeCompare(b.id))
          .filter((r) => !after || r.id > after)
          .slice(0, 101)
        return ok({
          items: selected.slice(0, 100),
          nextCursor: selected.length > 100 ? selected[99]!.id : null,
        })
      }
      if (request.method !== 'PUT' || !id || members || kind === 'departments')
        return error('malformed_request', 400)
      if (
        !can(actor, 'authorization_write') ||
        (kind === 'user-groups' && !can(actor, 'user_group_write'))
      )
        return error('permission_denied', 403)
      uuid(id)
      const raw = closed(request.body, ['operationId', 'expectedRevision', 'value']),
        operationId = uuid(raw['operationId']),
        expectedRevision = count(raw['expectedRevision'])
      if (kind === 'rules') {
        const value = raw['value'] === null ? null : rule(raw['value'], TENANT)
        if (value?.subject.kind === 'user' && value.subject.user.instanceId !== INSTANCE)
          return error('malformed_request', 400)
        return receipts.write(request, operationId, () =>
          change(rules, id, expectedRevision, value, operationId, actor, 'authorization_rule'),
        )
      }
      const value = raw['value'] === null ? null : groupDefinition(raw['value'], TENANT)
      if (value?.members.some((m) => m.instanceId !== INSTANCE))
        return error('malformed_request', 400)
      return receipts.write(request, operationId, () =>
        change(groups, id, expectedRevision, value, operationId, actor, 'user_group'),
      )
    } catch {
      return error('malformed_request', 400)
    }
  }
  function change<T>(
    map: Map<string, Revision<T>>,
    id: string,
    expected: number,
    value: T | null,
    operationId: string,
    actor: string,
    targetKind: 'authorization_rule' | 'user_group',
  ) {
    const old = map.get(id)
    if (
      (old?.revision ?? 0) !== expected ||
      (old && old.value === null) ||
      (!old && value === null)
    )
      return error('operation_conflict')
    const revision = expected + 1
    map.set(id, { id, revision, value: structuredClone(value) })
    record({
      at: now(),
      actor,
      action: targetKind === 'authorization_rule' ? 'authorization_changed' : 'user_group_changed',
      target: { kind: targetKind, id, device: null, revision },
      operation: operationId,
      outcome: 'accepted',
    })
    return ok({ id, revision, deleted: value === null })
  }
  reset()
  return { handle, reset, can, effective, guard }
}
