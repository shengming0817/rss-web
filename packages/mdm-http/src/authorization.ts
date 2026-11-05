import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { projectedPage, projectedRow, queryParameters, nextCursor } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import {
  validateRule,
  validateGroup,
  validateGrant,
  validateKey,
  validateSubject,
  validateUser,
  type AuthorizationPort,
  type Rule,
  type Realm,
  type Revision,
  type Change,
  type UserGroup,
  type User,
  type Receipt,
  type Departments,
  type ApiKey,
  type KeyMetadata,
  type EffectiveAuthorization,
  type NetworkPolicy,
} from '@rss/mdm-authorization'
import { uuid, text, count, positive, boolean, nullable, record, enumeration } from './decode'

function rule(value: unknown, tenant: string, realm: Realm): Rule {
  if (!schema.putApiV1AuthorizationRulesByIdBody.validateRule(value))
    throw new Error('Invalid rule contract')
  validateRule(value, tenant, realm)
  return value
}
function group(value: unknown, tenant: string): UserGroup {
  if (!schema.putApiV1AuthorizationUserGroupsByIdBody.validateUserGroup(value))
    throw new Error('Invalid group contract')
  validateGroup(value, tenant)
  return value
}
function user(value: unknown, tenant: string): User {
  if (!schema.getApiV1ApiKeysResponse.validateUser(value)) throw new Error('Invalid user contract')
  validateUser(value, tenant)
  return value
}
function revision<T>(value: unknown, id: string, project: (v: unknown) => T): Revision<T> {
  const v = record(value)
  if (uuid(v['id']) !== id) throw new Error('Wrong authorization object')
  return { id, revision: positive(v['revision']), value: nullable(v['value'], project) }
}
function receipt<T>(value: unknown, id: string, change: Change<T>): Receipt {
  if (!schema.putApiV1AuthorizationRulesByIdResponse.validateRoot(value))
    throw new Error('Invalid receipt contract')
  if (
    value.id !== id ||
    value.revision !== change.expectedRevision + 1 ||
    value.deleted !== (change.value === null)
  )
    throw new Error('Wrong authorization receipt')
  return value
}
function keyMetadata(value: unknown): KeyMetadata {
  if (!schema.getApiV1ApiKeysResponse.validateKeyMetadata(value))
    throw new Error('Invalid key contract')
  validateKey(value)
  return value
}
function key(value: unknown, tenant: string): ApiKey {
  if (!schema.getApiV1ApiKeysByIdResponse.validateRoot(value))
    throw new Error('Invalid key contract')
  keyMetadata(value.metadata)
  user(value.createdBy, tenant)
  return value
}
function network(value: unknown): NetworkPolicy {
  if (!schema.getApiV1TenantAdministrationApiAccessNetworkPolicyResponse.validateRoot(value))
    throw new Error('Invalid network contract')
  return value
}
function departments(value: unknown): Departments {
  if (!schema.getApiV1AuthorizationDepartmentsResponse.validateRoot(value))
    throw new Error('Invalid department contract')
  if (value.status === 'available') {
    const ids = value.snapshot.nodes.map((n) => n.id)
    if (value.expiresAt < value.observedAt || new Set(ids).size !== ids.length)
      throw new Error('Invalid department snapshot')
  }
  return value
}
/** Generated operations execute through the already session-bound transport. */
export function createAuthorizationAdapter(
  transport: HttpTransport,
  tenant: string,
  realm: Realm,
  principal: string,
): AuthorizationPort {
  uuid(tenant)
  uuid(principal)
  const tenantOnly = () => {
    if (realm !== 'tenant') throw new Error('Business tenant operation required')
  }
  const decodeRule = (v: unknown) => rule(v, tenant, realm)
  const rules = {
    id: uuid,
    revision: positive,
    deleted: boolean,
    subjectKind: (v: unknown) =>
      nullable(v, (s) =>
        enumeration(s, ['user', 'user_group', 'idp_group', 'department'] as const),
      ),
    value: (v: unknown) => nullable(v, decodeRule),
  }
  const groups = {
    id: uuid,
    revision: positive,
    deleted: boolean,
    name: (v: unknown) => nullable(v, text),
    enabled: (v: unknown) => nullable(v, boolean),
    memberCount: (v: unknown) => nullable(v, count),
    value: (v: unknown) =>
      nullable(v, (value) => {
        if (!schema.getApiV1AuthorizationUserGroupsResponse.validateGroupSummary(value))
          throw new Error('Invalid group summary')
        return value
      }),
  }
  const members = {
    principalId: uuid,
    instanceId: uuid,
    tenantId: (v: unknown) => {
      if (uuid(v) !== tenant) throw new Error('Wrong member tenant')
      return tenant
    },
  }
  const keys = {
    id: uuid,
    revision: positive,
    authorityRevision: positive,
    credentialRevision: positive,
    metadata: keyMetadata,
    createdBy: (v: unknown) => user(v, tenant),
    createdAt: count,
    revoked: boolean,
    name: text,
    enabled: boolean,
    expiresAt: (v: unknown) => nullable(v, positive),
  }
  return {
    effective: () =>
      (realm === 'management'
        ? api.getApiV1TenantAdministrationAuthorization
        : api.getApiV1Authorization)(transport, {}, (value): EffectiveAuthorization => {
        if (value.tenantId !== tenant || value.principalId !== principal)
          throw new Error('Wrong effective authorization tenant')
        value.grants.forEach((g) => {
          validateGrant(g, realm)
          validateSubject(g.subject, tenant, realm)
          if (g.observation && g.observation.expiresAt < g.observation.observedAt)
            throw new Error('Invalid observation')
        })
        return value
      }),
    rules: (query = {}) =>
      (realm === 'management'
        ? api.getApiV1TenantAdministrationAuthorizationRules
        : api.getApiV1AuthorizationRules)(
        transport,
        { query: queryParameters({ limit: 50, ...query }) },
        (v) => projectedPage(v, rules, query.fields, ['id']),
      ),
    rule: (id) =>
      (realm === 'management'
        ? api.getApiV1TenantAdministrationAuthorizationRulesById
        : api.getApiV1AuthorizationRulesById)(transport, { pathParams: { id: uuid(id) } }, (v) =>
        revision(v, id, decodeRule),
      ),
    changeRule: (id, change) =>
      (realm === 'management'
        ? api.putApiV1TenantAdministrationAuthorizationRulesById
        : api.putApiV1AuthorizationRulesById)(
        transport,
        {
          pathParams: { id: uuid(id) },
          body: {
            ...change,
            value:
              change.value === null
                ? null
                : {
                    subject: change.value.subject,
                    grants: change.value.grants.map((g) => ({ ...g })),
                  },
          },
        },
        (v) => receipt(v, id, change),
      ),
    groups: (query = {}) => {
      tenantOnly()
      return api.getApiV1AuthorizationUserGroups(
        transport,
        { query: queryParameters({ limit: 50, ...query }) },
        (v) => projectedPage(v, groups, query.fields, ['id']),
      )
    },
    group: (id) => {
      tenantOnly()
      return api.getApiV1AuthorizationUserGroupsById(
        transport,
        { pathParams: { id: uuid(id) } },
        (v) => revision(v, id, (v) => group(v, tenant)),
      )
    },
    changeGroup: (id, change) => {
      tenantOnly()
      return api.putApiV1AuthorizationUserGroupsById(
        transport,
        {
          pathParams: { id: uuid(id) },
          body: {
            ...change,
            value:
              change.value === null
                ? null
                : { ...change.value, members: [...change.value.members] },
          },
        },
        (v) => receipt(v, id, change),
      )
    },
    members: (id, query = {}) => {
      tenantOnly()
      return api.getApiV1AuthorizationUserGroupsByIdMembers(
        transport,
        { pathParams: { id: uuid(id) }, query: queryParameters({ limit: 100, ...query }) },
        (value) => {
          if (value.id !== id || !value.revision) throw new Error('Wrong group member page')
          const items = value.items.map((v) => projectedRow(v, members, query.fields))
          if (!query.fields || query.fields.includes('principalId' as never)) {
            const ids = items.map((item) => Reflect.get(item, 'principalId'))
            if (new Set(ids).size !== ids.length) throw new Error('Duplicate member')
          }
          return { id, revision: value.revision, items, nextCursor: nextCursor(value.nextCursor) }
        },
      )
    },
    departments: () => {
      tenantOnly()
      return api.getApiV1AuthorizationDepartments(transport, {}, departments)
    },
    keys: (query = {}) => {
      tenantOnly()
      return api.getApiV1ApiKeys(
        transport,
        { query: queryParameters({ limit: 50, ...query }) },
        (v) => projectedPage(v, keys, query.fields, ['id']),
      )
    },
    key: (id) => {
      tenantOnly()
      return api.getApiV1ApiKeysById(transport, { pathParams: { id: uuid(id) } }, (v) => {
        const result = key(v, tenant)
        if (result.id !== id) throw new Error('Wrong API key')
        return result
      })
    },
    changeKey: (operationId, intent) => {
      tenantOnly()
      const project = (value: unknown) => {
        if (!schema.postApiV1ApiKeysResponse.validateKeyChangeResult(value))
          throw new Error('Invalid key receipt')
        if (
          value.receipt.id !== intent.id ||
          value.receipt.revision !== intent.revision + 1 ||
          value.receipt.deleted !== (intent.kind === 'revoke') ||
          (value.secret !== null && intent.kind !== 'create' && intent.kind !== 'rotate')
        )
          throw new Error('Wrong key receipt')
        return value
      }
      if (intent.kind === 'create' || intent.kind === 'update') {
        const metadata = { ...intent.metadata, grants: [...intent.metadata.grants] }
        return intent.kind === 'create'
          ? api.postApiV1ApiKeys(
              transport,
              { body: { id: intent.id, operationId, metadata } },
              project,
            )
          : api.putApiV1ApiKeysById(
              transport,
              {
                pathParams: { id: intent.id },
                body: { operationId, expectedRevision: intent.revision, metadata },
              },
              project,
            )
      }
      const parameters = {
        pathParams: { id: intent.id },
        body: { operationId, expectedRevision: intent.revision },
      }
      return (
        intent.kind === 'rotate' ? api.postApiV1ApiKeysByIdRotate : api.postApiV1ApiKeysByIdRevoke
      )(transport, parameters, project)
    },
    network: () => {
      if (realm !== 'management') throw new Error('Management realm required')
      return api.getApiV1TenantAdministrationApiAccessNetworkPolicy(transport, {}, network)
    },
    changeNetwork: (operationId, expectedRevision, networks) => {
      if (realm !== 'management') throw new Error('Management realm required')
      return api.putApiV1TenantAdministrationApiAccessNetworkPolicy(
        transport,
        { body: { operationId, expectedRevision, networks: [...networks] } },
        (value) => {
          const result = network(value)
          if (result.revision !== expectedRevision + 1) throw new Error('Wrong network revision')
          return result
        },
      )
    },
  }
}
