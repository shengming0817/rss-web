import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import { queryParameters, projectedPage, type DirectoryQuery } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  count,
  identifier,
  nullable,
  string,
  unique,
  uuid,
} from '../../../services/decode'
import { grant, permissions, user } from '../../operations/clients/authorization'
export const keyPermissions = permissions.filter(
  (p) =>
    ![
      'tenant_create',
      'tenant_read',
      'tenant_update',
      'tenant_delete',
      'tenant_administrator_create',
      'identity_accounts_manage',
      'identity_providers_manage',
      'authorization_read',
      'authorization_write',
      'user_group_read',
      'user_group_write',
      'department_read',
    ].includes(p),
)
export function keyMetadata(value: unknown) {
  if (!wireSchemas.getApiV1ApiKeysResponse.validateKeyMetadata(value))
    throw new Error('Invalid contract value')

  const v = value
  const grants = unique(array(v['grants'], grant), (g) => JSON.stringify(g))
  if (
    !grants.length ||
    grants.length > 256 ||
    grants.some((g) => !keyPermissions.includes(g.operation))
  )
    throw new Error('Invalid key grants')
  const expiresAt = nullable(v['expiresAt'], count)
  if (expiresAt === 0) throw new Error('Invalid key expiry')
  return { name: identifier(v['name']), enabled: v['enabled'], expiresAt, grants }
}
export type KeyMetadata = ReturnType<typeof keyMetadata>
export type KeyIntent =
  | { kind: 'create' | 'update'; id: string; revision: number; metadata: KeyMetadata }
  | { kind: 'rotate' | 'revoke'; id: string; revision: number }
export function keyRecord(value: unknown, tenant: string) {
  if (!wireSchemas.getApiV1ApiKeysByIdResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    id: uuid(v['id']),
    revision: count(v['revision']),
    authorityRevision: count(v['authorityRevision']),
    credentialRevision: count(v['credentialRevision']),
    metadata: keyMetadata(v['metadata']),
    createdBy: user(v['createdBy'], tenant),
    createdAt: count(v['createdAt']),
    revoked: v['revoked'],
  }
}
export function networkPolicy(value: unknown) {
  if (!wireSchemas.getApiV1TenantAdministrationApiAccessNetworkPolicyResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  return { revision: count(v['revision']), networks: array(v['networks'], identifier) }
}
function keyFields(tenant: string) {
  return {
    id: uuid,
    revision: count,
    authorityRevision: count,
    credentialRevision: count,
    metadata: keyMetadata,
    createdBy: (v: unknown) => user(v, tenant),
    createdAt: count,
    revoked: boolean,
    name: identifier,
    enabled: boolean,
    expiresAt: (v: unknown) => nullable(v, count),
  }
}
export function createApiAccess(transport: HttpTransport, tenant: string) {
  return {
    keys: <F extends keyof ReturnType<typeof keyFields> = keyof ReturnType<typeof keyFields>>(
      query: DirectoryQuery<F> = {},
    ) =>
      api.getApiV1ApiKeys(transport, { query: queryParameters({ limit: 50, ...query }) }, (value) =>
        projectedPage(value, keyFields(tenant), query.fields, ['id']),
      ),
    key: (id: string) =>
      api.getApiV1ApiKeysById(transport, { pathParams: { id } }, (v) => {
        const k = keyRecord(v, tenant)
        if (k.id !== id) throw new Error('Wrong key')
        return k
      }),
    change: (operationId: string, input: KeyIntent) => {
      const project = (value: unknown) => {
        if (!wireSchemas.postApiV1ApiKeysResponse.validateKeyChangeResult(value))
          throw new Error('Invalid contract value')

        const v = value,
          r = v['receipt']
        if (
          r['id'] !== input.id ||
          r['revision'] !== input.revision + 1 ||
          r['deleted'] !== (input.kind === 'revoke')
        )
          throw new Error('Wrong key receipt')
        return {
          receipt: {
            id: uuid(r['id']),
            revision: count(r['revision']),
            deleted: r['deleted'],
          },
          secret: nullable(v['secret'], string),
        }
      }
      if (input.kind === 'create')
        return api.postApiV1ApiKeys(
          transport,
          { body: { operationId, id: input.id, metadata: keyMetadata(input.metadata) } },
          project,
        )
      if (input.kind === 'update')
        return api.putApiV1ApiKeysById(
          transport,
          {
            pathParams: { id: input.id },
            body: {
              operationId,
              expectedRevision: input.revision,
              metadata: keyMetadata(input.metadata),
            },
          },
          project,
        )
      const parameters = {
        pathParams: { id: input.id },
        body: { operationId, expectedRevision: input.revision },
      }
      return input.kind === 'rotate'
        ? api.postApiV1ApiKeysByIdRotate(transport, parameters, project)
        : api.postApiV1ApiKeysByIdRevoke(transport, parameters, project)
    },
    network: () =>
      api.getApiV1TenantAdministrationApiAccessNetworkPolicy(transport, {}, networkPolicy),
    changeNetwork: (operationId: string, expectedRevision: number, networks: string[]) =>
      api.putApiV1TenantAdministrationApiAccessNetworkPolicy(
        transport,
        { body: { operationId, expectedRevision, networks } },
        (value) => {
          const v = networkPolicy(value)
          if (v.revision !== expectedRevision + 1) throw new Error('Wrong network receipt')
          return v
        },
      ),
  }
}
