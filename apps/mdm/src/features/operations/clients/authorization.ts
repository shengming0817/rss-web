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
  'device_association_write',
  'compliance_read',
  'inventory_collect',
  'inventory_assign',
  'telemetry_delete',
  'telemetry_maintain',
  'enrollment',
  'credentials',
  'device_unmanage',
  'device_wipe',
  'configuration_write',
  'windows_mi_execute',
  'device_control',
  'device_update',
  'account_write',
  'security_operate',
  'device_diagnostics',
  'script_execute',
  'software_deploy',
  'operation_read',
  'operation_cancel',
] as const
export const tenantPermissions = [
  'user_attribute_definitions_read',
  'user_attribute_definitions_write',
  'user_profiles_read',
  'webhook_read',
  'webhook_write',
  'webhook_replay',
  'tenant_create',
  'tenant_read',
  'tenant_update',
  'tenant_delete',
  'tenant_administrator_create',
  'identity_accounts_manage',
  'identity_providers_manage',
  'enterprise_applications_read',
  'enterprise_applications_write',
  'storage_configuration_read',
  'storage_configuration_write',
  'registration_configuration_read',
  'registration_configuration_write',
  'audit_read',
  'runtime_diagnostics_read',
  'inventory_sensitive_read',
  'inventory_fields_write',
  'certificate_archive_read',
  'certificate_archive_write',
  'certificate_archive_unlock',
  'certificate_archive_export',
  'compliance_rule_read',
  'compliance_write',
  'compliance_recompute',
  'agent_enrollment_read',
  'agent_enrollment_write',
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
  'software_withdraw',
  'release_read',
  'release_publish',
  'release_withdraw',
  'release_recover',
] as const
export const platformPermissions = [
  'tenant_create',
  'tenant_read',
  'tenant_update',
  'tenant_delete',
  'tenant_administrator_create',
  'authorization_read',
  'authorization_write',
  'identity_accounts_manage',
] as const
export const tenantAdministrationPermissions = [
  'tenant_create',
  'tenant_read',
  'tenant_update',
  'tenant_delete',
  'tenant_administrator_create',
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
export type AuthorizationRealm = 'tenant' | 'platform'
export function grantForRealm(value: unknown, realm: AuthorizationRealm) {
  const g = grant(value)
  if (
    realm === 'platform'
      ? !(platformPermissions as readonly string[]).includes(g.operation) ||
        g.scope.kind !== 'tenant'
      : (tenantAdministrationPermissions as readonly string[]).includes(g.operation)
  )
    throw new Error('Permission belongs to another realm')
  return g
}
export function ruleForRealm(value: unknown, tenant: string, realm: AuthorizationRealm) {
  const result = rule(value, tenant)
  if (realm === 'platform' && result.subject.kind !== 'user')
    throw new Error('Management rules require a local user')
  result.grants.forEach((g) => grantForRealm(g, realm))
  return result
}
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
export function createAuthorizationClient(
  transport: HttpTransport,
  tenant: string,
  realm: AuthorizationRealm = 'tenant',
) {
  const prefix =
    realm === 'platform' ? '/api/v1/tenant-administration/authorization' : '/api/v1/authorization'
  const decodeRule = (value: unknown) => ruleForRealm(value, tenant, realm)
  function tenantOnly() {
    if (realm === 'platform') throw new Error('Directory is not available in the management realm')
  }
  function list<T>(path: string, decode: (v: unknown) => T, after?: string) {
    return transport.request({
      method: 'GET',
      path,
      query: { after },
      successStatus: 200,
      decode(value) {
        const v = closed(value, ['items', 'nextCursor'])
        const items = unique(
            array(v['items'], (x) => revision(x, decode)),
            (x) => x.id,
          ),
          nextCursor = nullable(v['nextCursor'], uuid)
        if (
          items.length > 100 ||
          (nextCursor !== null && (items.length !== 100 || items.at(-1)?.id !== nextCursor))
        )
          throw new Error('Invalid authorization page')
        return { items, nextCursor }
      },
    })
  }
  function write<T>(kind: string, id: string, body: Change<T>) {
    closed(body, ['operationId', 'expectedRevision', 'value'])
    uuid(id)
    uuid(body.operationId)
    count(body.expectedRevision)
    return transport.request({
      method: 'PUT',
      path: `${prefix}/${kind}/{id}`,
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
    tenantOnly()
    return transport.request({
      method: 'GET',
      path: `${prefix}/user-groups/{id}/members`,
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
  async function find<T>(path: string, decode: (value: unknown) => T, id: string) {
    uuid(id)
    let after: string | undefined
    const seen = new Set<string>()
    for (let pages = 0; pages < 100; pages++) {
      const page = await list(path, decode, after),
        value = page.items.find((v) => v.id === id)
      if (value) return value
      if (!page.nextCursor) return null
      if (seen.has(page.nextCursor)) throw new Error('Repeated authorization cursor')
      seen.add(page.nextCursor)
      after = page.nextCursor
    }
    throw new Error('Authorization scan did not complete')
  }
  return {
    effective: () =>
      transport.request({
        method: 'GET',
        path: `${prefix}`,
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
                ...grantForRealm({ operation: g['operation'], scope: g['scope'] }, realm),
                ruleId: uuid(g['ruleId']),
                ruleRevision: count(g['ruleRevision']),
                subject: (() => {
                  const s = subject(g['subject'], tenant)
                  if (realm === 'platform' && s.kind !== 'user')
                    throw new Error('Wrong management subject')
                  return s
                })(),
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
    findRule: (id: string) => find(`${prefix}/rules`, decodeRule, id),
    findGroup: (id: string) => {
      tenantOnly()
      return find(`${prefix}/user-groups`, summary, id)
    },
    rules: (after?: string) => list(`${prefix}/rules`, decodeRule, after),
    groups: (after?: string) => {
      tenantOnly()
      return list(`${prefix}/user-groups`, summary, after)
    },
    departments: () => {
      tenantOnly()
      return transport.request({
        method: 'GET',
        path: `${prefix}/departments`,
        successStatus: 200,
        decode: departments,
      })
    },
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
      if (body.value !== null) decodeRule(body.value)
      return write('rules', id, body)
    },
    changeGroup: (id: string, body: Change<UserGroup>) => {
      tenantOnly()
      if (body.value !== null) groupDefinition(body.value, tenant)
      return write('user-groups', id, body)
    },
  }
}
