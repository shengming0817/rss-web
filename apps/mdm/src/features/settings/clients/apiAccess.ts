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
    keys: (after?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/api-keys',
        query: { after },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['items', 'nextCursor'])
          return {
            items: array(v['items'], (x) => keyRecord(x, tenant)),
            nextCursor: nullable(v['nextCursor'], uuid),
          }
        },
      }),
    key: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/api-keys/{id}',
        pathParams: { id },
        successStatus: 200,
        decode(v) {
          const k = keyRecord(v, tenant)
          if (k.id !== id) throw new Error('Wrong key')
          return k
        },
      }),
    change: (operationId: string, input: KeyIntent) =>
      transport.request({
        method: input.kind === 'update' ? 'PUT' : 'POST',
        path:
          input.kind === 'create'
            ? '/api/v1/api-keys'
            : input.kind === 'update'
              ? '/api/v1/api-keys/{id}'
              : `/api/v1/api-keys/{id}/${input.kind}`,
        ...(input.kind === 'create' ? {} : { pathParams: { id: input.id } }),
        body: {
          operationId,
          ...(input.kind === 'create' ? { id: input.id } : { expectedRevision: input.revision }),
          ...('metadata' in input ? { metadata: keyMetadata(input.metadata) } : {}),
        },
        successStatus: 200,
        decode(value) {
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
              deleted: boolean(r['deleted']),
            },
            secret: nullable(v['secret'], string),
          }
        },
      }),
    network: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/tenant-administration/api-access/network-policy',
        successStatus: 200,
        decode: networkPolicy,
      }),
    changeNetwork: (operationId: string, expectedRevision: number, networks: string[]) =>
      transport.request({
        method: 'PUT',
        path: '/api/v1/tenant-administration/api-access/network-policy',
        body: { operationId, expectedRevision, networks },
        successStatus: 200,
        decode(value) {
          const v = networkPolicy(value)
          if (v.revision !== expectedRevision + 1) throw new Error('Wrong network receipt')
          return v
        },
      }),
  }
}
