import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  string,
  unique,
  uuid,
} from '../../../services/decode'
export const devicePermissions = [
  'inventory_read',
  'compliance_read',
  'inventory_collect',
  'inventory_assign',
  'enrollment',
  'credentials',
  'device_wipe',
  'state_verify',
  'firewall_write',
  'script_execute',
  'software_deploy',
  'operation_read',
  'operation_cancel',
] as const
export const tenantPermissions = [
  'compliance_rule_read',
  'compliance_write',
  'compliance_recompute',
  'authorization_read',
  'authorization_write',
  'user_group_read',
  'user_group_write',
  'department_read',
  'group_read',
  'group_write',
  'group_recompute',
  'scope_read',
  'scope_write',
  'policy_read',
  'policy_write',
  'resource_read',
  'resource_write',
  'software_read',
  'software_write',
  'software_approve',
  'software_withdraw',
  'release_read',
  'release_write',
  'release_validate',
  'release_approve',
  'release_publish',
  'release_withdraw',
  'release_recover',
] as const
export const permissions = [...devicePermissions, ...tenantPermissions] as const
export type Permission = (typeof permissions)[number]
export function user(value: unknown, tenant: string, instance?: string) {
  const v = closed(value, ['instanceId', 'tenantId', 'principalId'])
  const result = {
    instanceId: uuid(v['instanceId']),
    tenantId: uuid(v['tenantId']),
    principalId: uuid(v['principalId']),
  }
  if (result.tenantId !== tenant || (instance && result.instanceId !== instance))
    throw new Error('Wrong user binding')
  return result
}
export type User = ReturnType<typeof user>
export function source(value: unknown) {
  const v = closed(value, ['providerId', 'issuer', 'configurationVersion'])
  const result = {
    providerId: uuid(v['providerId']),
    issuer: string(v['issuer']),
    configurationVersion: count(v['configurationVersion']),
  }
  const url = new URL(result.issuer)
  if (
    !result.configurationVersion ||
    result.issuer.length > 2048 ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Invalid identity source')
  return result
}
export function subject(value: unknown, tenant: string) {
  const kind = enumeration(closed(value, ['kind'], ['user', 'id', 'source', 'matching'])['kind'], [
    'user',
    'idp_group',
    'department',
    'user_group',
  ] as const)
  if (kind === 'user') return { kind, user: user(closed(value, ['kind', 'user'])['user'], tenant) }
  if (kind === 'user_group') return { kind, id: uuid(closed(value, ['kind', 'id'])['id']) }
  const v = closed(value, ['kind', 'source', 'id'], kind === 'department' ? ['matching'] : [])
  const common = { source: source(v['source']), id: identifier(v['id']) }
  return kind === 'department'
    ? { kind, ...common, matching: enumeration(v['matching'], ['exact', 'subtree'] as const) }
    : { kind, ...common }
}
export type Subject = ReturnType<typeof subject>
export function grant(value: unknown) {
  const v = closed(value, ['operation', 'scope']),
    operation = enumeration(v['operation'], permissions)
  const raw = closed(v['scope'], ['kind'], ['id']),
    kind = enumeration(raw['kind'], ['tenant', 'all_devices', 'device'] as const)
  closed(raw, kind === 'device' ? ['kind', 'id'] : ['kind'])
  const scope = kind === 'device' ? { kind, id: identifier(raw['id']) } : { kind }
  if ((devicePermissions as readonly string[]).includes(operation) === (kind === 'tenant'))
    throw new Error('Invalid permission scope')
  return { operation, scope }
}
export type Grant = ReturnType<typeof grant>
export function rule(value: unknown, tenant: string) {
  const v = closed(value, ['subject', 'grants']),
    grants = unique(array(v['grants'], grant), (v) => JSON.stringify(v))
  if (!grants.length || grants.length > 256) throw new Error('Invalid grants')
  return { subject: subject(v['subject'], tenant), grants }
}
export type Rule = ReturnType<typeof rule>
export interface Change<T> {
  operationId: string
  expectedRevision: number
  value: T | null
}
export interface Revision<T> {
  id: string
  revision: number
  value: T | null
}
export function groupDefinition(value: unknown, tenant: string) {
  const v = closed(value, ['name', 'enabled', 'members'])
  if (!Array.isArray(v['members']) || v['members'].length > 10000)
    throw new Error('Invalid group members')
  const members = unique(
    v['members'].map((m) => user(m, tenant)),
    (m) => m.principalId,
  )
  if (new Set(members.map((m) => m.instanceId)).size > 1) throw new Error('Mixed instances')
  return { name: identifier(v['name']), enabled: boolean(v['enabled']), members }
}
export type UserGroup = ReturnType<typeof groupDefinition>
function revision<T>(value: unknown, decode: (v: unknown) => T): Revision<T> {
  const v = closed(value, ['id', 'revision', 'value']),
    revision = count(v['revision'])
  if (!revision) throw new Error('Invalid revision')
  return { id: uuid(v['id']), revision, value: nullable(v['value'], decode) }
}
function summary(value: unknown) {
  const v = closed(value, ['name', 'enabled', 'memberCount'])
  return {
    name: identifier(v['name']),
    enabled: boolean(v['enabled']),
    memberCount: count(v['memberCount']),
  }
}
export function departments(value: unknown) {
  const status = enumeration(
    closed(
      value,
      ['status'],
      ['source', 'snapshotId', 'observedAt', 'expiresAt', 'snapshot', 'reason'],
    )['status'],
    ['available', 'expired', 'unavailable'] as const,
  )
  if (status === 'expired') {
    closed(value, ['status'])
    return { status }
  }
  if (status === 'unavailable') {
    const v = closed(value, ['status', 'reason'])
    return { status, reason: identifier(v['reason']) }
  }
  const v = closed(value, [
      'status',
      'source',
      'snapshotId',
      'observedAt',
      'expiresAt',
      'snapshot',
    ]),
    s = closed(v['snapshot'], ['version', 'sourceRevision', 'nodes', 'memberships'])
  if (s['version'] !== 1) throw new Error('Invalid department version')
  const nodes = unique(
    array(s['nodes'], (item) => {
      const n = closed(item, ['id', 'displayName', 'parentId'])
      return {
        id: identifier(n['id']),
        displayName: identifier(n['displayName']),
        parentId: nullable(n['parentId'], identifier),
      }
    }),
    (n) => n.id,
  )
  const observedAt = count(v['observedAt']),
    expiresAt = count(v['expiresAt'])
  if (expiresAt < observedAt) throw new Error('Invalid snapshot time')
  return {
    status,
    source: source(v['source']),
    snapshotId: uuid(v['snapshotId']),
    observedAt,
    expiresAt,
    snapshot: {
      version: 1,
      sourceRevision: identifier(s['sourceRevision']),
      nodes,
      memberships: unique(array(s['memberships'], identifier), (x) => x),
    },
  }
}
export function createAuthorizationClient(transport: HttpTransport, tenant: string) {
  function list<T>(path: string, decode: (v: unknown) => T, after?: string) {
    return transport.request({
      method: 'GET',
      path,
      query: { after },
      successStatus: 200,
      decode(value) {
        const v = closed(value, ['items', 'nextCursor'])
        return {
          items: unique(
            array(v['items'], (x) => revision(x, decode)),
            (x) => x.id,
          ),
          nextCursor: nullable(v['nextCursor'], uuid),
        }
      },
    })
  }
  function write<T>(kind: string, id: string, body: Change<T>) {
    uuid(id)
    uuid(body.operationId)
    count(body.expectedRevision)
    return transport.request({
      method: 'PUT',
      path: `/api/v1/authorization/${kind}/{id}`,
      pathParams: { id },
      body,
      successStatus: 200,
      decode(value) {
        const v = closed(value, ['id', 'revision', 'deleted']),
          result = {
            id: uuid(v['id']),
            revision: count(v['revision']),
            deleted: boolean(v['deleted']),
          }
        if (
          result.id !== id ||
          result.revision !== body.expectedRevision + 1 ||
          result.deleted !== (body.value === null)
        )
          throw new Error('Wrong authorization receipt')
        return result
      },
    })
  }
  async function memberPage(id: string, offset = 0, expectedRevision?: number) {
    return transport.request({
      method: 'GET',
      path: '/api/v1/authorization/user-groups/{id}/members',
      pathParams: { id },
      query: { offset, expectedRevision },
      successStatus: 200,
      decode(value) {
        const v = closed(value, ['id', 'revision', 'items', 'nextOffset']),
          revision = count(v['revision']),
          items = unique(
            array(v['items'], (m) => user(m, tenant)),
            (m) => m.principalId,
          ),
          nextOffset = nullable(v['nextOffset'], count)
        if (
          uuid(v['id']) !== id ||
          !revision ||
          (expectedRevision !== undefined && revision !== expectedRevision) ||
          items.length > 100 ||
          (nextOffset !== null &&
            (nextOffset !== offset + 100 || nextOffset >= 10000 || items.length !== 100))
        )
          throw new Error('Invalid member page')
        return { id, revision, items, nextOffset }
      },
    })
  }
  return {
    effective: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/authorization',
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['instanceId', 'tenantId', 'principalId', 'grants'])
          if (uuid(v['tenantId']) !== tenant) throw new Error('Wrong tenant')
          return {
            instanceId: uuid(v['instanceId']),
            tenantId: tenant,
            principalId: uuid(v['principalId']),
            grants: array(v['grants'], (value) => {
              const g = closed(value, [
                'ruleId',
                'ruleRevision',
                'subject',
                'operation',
                'scope',
                'observation',
              ])
              return {
                ...grant({ operation: g['operation'], scope: g['scope'] }),
                ruleId: uuid(g['ruleId']),
                ruleRevision: count(g['ruleRevision']),
                subject: subject(g['subject'], tenant),
                observation: nullable(g['observation'], (value) => {
                  const o = closed(value, [
                    'snapshotId',
                    'observedAt',
                    'expiresAt',
                    'sourceRevision',
                  ])
                  return {
                    snapshotId: uuid(o['snapshotId']),
                    observedAt: count(o['observedAt']),
                    expiresAt: count(o['expiresAt']),
                    sourceRevision: nullable(o['sourceRevision'], string),
                  }
                }),
              }
            }),
          }
        },
      }),
    rules: (after?: string) => list('/api/v1/authorization/rules', (v) => rule(v, tenant), after),
    groups: (after?: string) => list('/api/v1/authorization/user-groups', summary, after),
    departments: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/authorization/departments',
        successStatus: 200,
        decode: departments,
      }),
    members: memberPage,
    async allMembers(id: string, revision: number) {
      const items: User[] = []
      let offset = 0
      do {
        const page = await memberPage(id, offset, revision)
        items.push(...page.items)
        if (page.nextOffset === null) break
        offset = page.nextOffset
      } while (offset < 10000)
      if (items.length > 10000) throw new Error('Invalid members')
      return unique(items, (m) => m.principalId)
    },
    changeRule: (id: string, body: Change<Rule>) => {
      if (body.value !== null) rule(body.value, tenant)
      return write('rules', id, body)
    },
    changeGroup: (id: string, body: Change<UserGroup>) => {
      if (body.value !== null) groupDefinition(body.value, tenant)
      return write('user-groups', id, body)
    },
  }
}
