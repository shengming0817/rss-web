import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import {
  queryParameters,
  nextCursor,
  projectedPage,
  projectedRow,
  type DirectoryQuery,
} from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import {
  record,
  closed,
  boolean,
  array,
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
  if (!wireSchemas.getApiV1ApiKeysResponse.validateUser(value))
    throw new Error('Invalid contract value')

  const v = value
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
  if (!wireSchemas.getApiV1AuthorizationResponse.validateSource(value))
    throw new Error('Invalid contract value')

  const v = value
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
  if (!wireSchemas.getApiV1AuthorizationResponse.validateSubject(value))
    throw new Error('Invalid contract value')

  const kind = value['kind']
  if (kind === 'user') return { kind, user: user(value['user'], tenant) }
  if (kind === 'user_group') return { kind, id: uuid(value['id']) }
  const v = value
  const common = { source: source(v['source']), id: identifier(v['id']) }
  return kind === 'department'
    ? { kind, ...common, matching: v.kind === 'department' ? v.matching : 'exact' }
    : { kind, ...common }
}
export type Subject = ReturnType<typeof subject>
export function grant(value: unknown) {
  if (!wireSchemas.postApiV1ApiKeysBody.validateGrant(value))
    throw new Error('Invalid contract value')

  const v = value,
    operation = enumeration(v['operation'], permissions)
  const raw = v['scope'],
    kind = raw['kind']

  const scope = kind === 'device' ? { kind, id: identifier(raw['id']) } : { kind }
  if ((devicePermissions as readonly string[]).includes(operation) === (kind === 'tenant'))
    throw new Error('Invalid permission scope')
  return { operation, scope }
}
export type Grant = ReturnType<typeof grant>
export function rule(value: unknown, tenant: string) {
  if (!wireSchemas.putApiV1AuthorizationRulesByIdBody.validateRule(value))
    throw new Error('Invalid contract value')

  const v = value,
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
  if (!wireSchemas.putApiV1AuthorizationUserGroupsByIdBody.validateUserGroup(value))
    throw new Error('Invalid contract value')

  const v = value
  if (!Array.isArray(v['members']) || v['members'].length > 10000)
    throw new Error('Invalid group members')
  const members = unique(
    v['members'].map((m) => user(m, tenant)),
    (m) => ('principalId' in m ? String(m.principalId) : JSON.stringify(m)),
  )
  if (new Set(members.map((m) => m.instanceId)).size > 1) throw new Error('Mixed instances')
  return { name: identifier(v['name']), enabled: v['enabled'], members }
}
export type UserGroup = ReturnType<typeof groupDefinition>
function revision<T>(value: unknown, decode: (v: unknown) => T): Revision<T> {
  const v = record(value),
    revision = count(v['revision'])
  if (!revision) throw new Error('Invalid revision')
  return { id: uuid(v['id']), revision, value: nullable(v['value'], decode) }
}
function summary(value: unknown) {
  if (!wireSchemas.getApiV1AuthorizationUserGroupsResponse.validateGroupSummary(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    name: identifier(v['name']),
    enabled: v['enabled'],
    memberCount: count(v['memberCount']),
  }
}
export function departments(value: unknown) {
  if (!wireSchemas.getApiV1AuthorizationDepartmentsResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const status = value['status']
  if (status === 'expired') {
    return { status }
  }
  if (status === 'unavailable') {
    const v = value
    return { status, reason: identifier(v['reason']) }
  }
  const v = value,
    s = v['snapshot']
  if (s['version'] !== 1) throw new Error('Invalid department version')
  const nodes = unique(
    array(s['nodes'], (item) => {
      const n = item
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
  const decodeRule = (value: unknown) => ruleForRealm(value, tenant, realm)
  function tenantOnly() {
    if (realm === 'platform') throw new Error('Directory is not available in the management realm')
  }
  const ruleFields = {
    id: uuid,
    revision: count,
    deleted: boolean,
    subjectKind: (v: unknown) => nullable(v, identifier),
    value: (v: unknown) => nullable(v, decodeRule),
  }
  const groupFields = {
    id: uuid,
    revision: count,
    deleted: boolean,
    name: (v: unknown) => nullable(v, identifier),
    enabled: (v: unknown) => nullable(v, boolean),
    memberCount: (v: unknown) => nullable(v, count),
    value: (v: unknown) => nullable(v, summary),
  }
  const memberFields = {
    principalId: uuid,
    tenantId: (v: unknown) => {
      const id = uuid(v)
      if (id !== tenant) throw new Error('Wrong tenant')
      return id
    },
    instanceId: uuid,
  }
  const detail =
    <T>(id: string, decode: (v: unknown) => T) =>
    (value: unknown) => {
      const row = revision(value, decode)
      if (row.id !== id) throw new Error('Wrong authorization object')
      return row
    }
  const write =
    <T>(id: string, body: Change<T>) =>
    (value: unknown) => {
      if (!wireSchemas.putApiV1AuthorizationRulesByIdResponse.validateRoot(value))
        throw new Error('Invalid authorization receipt')
      const v = value
      const result = {
        id: uuid(v['id']),
        revision: count(v['revision']),
        deleted: v['deleted'],
      }
      if (
        result.id !== id ||
        result.revision !== body.expectedRevision + 1 ||
        result.deleted !== (body.value === null)
      )
        throw new Error('Wrong authorization receipt')
      return result
    }
  function memberPage<F extends keyof typeof memberFields = keyof typeof memberFields>(
    id: string,
    query: DirectoryQuery<F> = {},
  ) {
    tenantOnly()
    return api.getApiV1AuthorizationUserGroupsByIdMembers(
      transport,
      {
        pathParams: { id: uuid(id) },
        query: queryParameters({
          limit: 100,
          ...query,
        }),
      },
      (value) => {
        const v = closed(value, ['id', 'revision', 'items', 'nextCursor'])
        if (uuid(v['id']) !== id || !count(v['revision'])) throw new Error('Wrong member page')
        return {
          id,
          revision: count(v['revision']),
          items: unique(
            array(v['items'], (m) => projectedRow(m, memberFields, query.fields)),
            (m) => ('principalId' in m ? String(m.principalId) : JSON.stringify(m)),
          ),
          nextCursor: nextCursor(v['nextCursor']),
        }
      },
    )
  }
  return {
    effective: () =>
      (realm === 'platform'
        ? api.getApiV1TenantAdministrationAuthorization
        : api.getApiV1Authorization)(transport, {}, (value) => {
        const v = value
        if (uuid(v['tenantId']) !== tenant) throw new Error('Wrong tenant')
        return {
          instanceId: uuid(v['instanceId']),
          tenantId: tenant,
          principalId: uuid(v['principalId']),
          grants: array(v['grants'], (value) => {
            const g = value
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
                const o = value
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
      }),
    rule: (id: string) =>
      (realm === 'platform'
        ? api.getApiV1TenantAdministrationAuthorizationRulesById
        : api.getApiV1AuthorizationRulesById)(
        transport,
        { pathParams: { id: uuid(id) } },
        detail(id, decodeRule),
      ),
    group: (id: string) => {
      tenantOnly()
      return api.getApiV1AuthorizationUserGroupsById(
        transport,
        { pathParams: { id: uuid(id) } },
        detail(id, (v) => groupDefinition(v, tenant)),
      )
    },
    rules: <F extends keyof typeof ruleFields = keyof typeof ruleFields>(
      query: DirectoryQuery<F> = {},
    ) =>
      (realm === 'platform'
        ? api.getApiV1TenantAdministrationAuthorizationRules
        : api.getApiV1AuthorizationRules)(
        transport,
        { query: queryParameters({ limit: 50, ...query }) },
        (value) => projectedPage(value, ruleFields, query.fields, ['id']),
      ),
    groups: <F extends keyof typeof groupFields = keyof typeof groupFields>(
      query: DirectoryQuery<F> = {},
    ) => {
      tenantOnly()
      return api.getApiV1AuthorizationUserGroups(
        transport,
        { query: queryParameters({ limit: 50, ...query }) },
        (value) => projectedPage(value, groupFields, query.fields, ['id']),
      )
    },
    departments: () => {
      tenantOnly()
      return api.getApiV1AuthorizationDepartments(transport, {}, departments)
    },
    members: memberPage,
    changeRule: (id: string, body: Change<Rule>) => {
      if (body.value !== null) decodeRule(body.value)
      return (
        realm === 'platform'
          ? api.putApiV1TenantAdministrationAuthorizationRulesById
          : api.putApiV1AuthorizationRulesById
      )(transport, { pathParams: { id }, body }, write(id, body))
    },
    changeGroup: (id: string, body: Change<UserGroup>) => {
      tenantOnly()
      if (body.value !== null) groupDefinition(body.value, tenant)
      return api.putApiV1AuthorizationUserGroupsById(
        transport,
        { pathParams: { id }, body },
        write(id, body),
      )
    },
  }
}
