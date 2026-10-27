import * as api from '@rss/api/mdm-operations'
import { queryParameters, windowPage, type DirectoryQuery } from '../../../services/directory-query'
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  closed,
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
  const v = closed(value, ['name', 'enabled', 'expiresAt', 'grants'])
  const grants = unique(array(v['grants'], grant), (g) => JSON.stringify(g))
  if (
    !grants.length ||
    grants.length > 256 ||
    grants.some((g) => !keyPermissions.includes(g.operation))
  )
    throw new Error('Invalid key grants')
  const expiresAt = nullable(v['expiresAt'], count)
  if (expiresAt === 0) throw new Error('Invalid key expiry')
  return { name: identifier(v['name']), enabled: boolean(v['enabled']), expiresAt, grants }
}
export type KeyMetadata = ReturnType<typeof keyMetadata>
export type KeyIntent =
  | { kind: 'create' | 'update'; id: string; revision: number; metadata: KeyMetadata }
  | { kind: 'rotate' | 'revoke'; id: string; revision: number }
export function keyRecord(value: unknown, tenant: string) {
  const v = closed(value, [
    'id',
    'revision',
    'authorityRevision',
    'credentialRevision',
    'metadata',
    'createdBy',
    'createdAt',
    'revoked',
  ])
  return {
    id: uuid(v['id']),
    revision: count(v['revision']),
    authorityRevision: count(v['authorityRevision']),
    credentialRevision: count(v['credentialRevision']),
    metadata: keyMetadata(v['metadata']),
    createdBy: user(v['createdBy'], tenant),
    createdAt: count(v['createdAt']),
    revoked: boolean(v['revoked']),
  }
}
export function networkPolicy(value: unknown) {
  const v = closed(value, ['revision', 'networks'])
  return { revision: count(v['revision']), networks: array(v['networks'], identifier) }
}
export function createApiAccess(transport: HttpTransport, tenant: string) {
  return {
    keys: (query: Omit<DirectoryQuery, 'fields'> = {}) =>
      api.getApiV1ApiKeys(
        transport,
        {
          query: queryParameters({
            limit: 100,
            ...query,
            fields: [
              'id',
              'revision',
              'authorityRevision',
              'credentialRevision',
              'metadata',
              'createdBy',
              'createdAt',
              'revoked',
            ],
          }),
        },
        (value) => {
          return windowPage(value, (x) => keyRecord(x, tenant))
        },
      ),
    key: (id: string) =>
      api.getApiV1ApiKeysById(transport, { pathParams: { id } }, (v) => {
        const k = keyRecord(v, tenant)
        if (k.id !== id) throw new Error('Wrong key')
        return k
      }),
    change: (operationId: string, input: KeyIntent) => {
      const project = (value: unknown) => {
        const v = closed(value, ['receipt', 'secret']),
          r = closed(v['receipt'], ['id', 'revision', 'deleted'])
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
