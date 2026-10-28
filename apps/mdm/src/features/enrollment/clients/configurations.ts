import { queryParameters, projectedPage, type DirectoryQuery } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  closed,
  count,
  enumeration,
  identifier,
  integer,
  nullable,
  unique,
  uuid,
} from '../../../services/decode'
import { user } from '../../operations/clients/authorization'
import { base64url, platforms, target } from './packages'
import { attachment } from './binary'
import { signedConnections } from '../../settings/clients/connections'
export const configurationFilename = 'rss-agent-enrollment.json'
export function quantity(value: unknown) {
  const v = closed(value, ['kind'], ['count']),
    kind = enumeration(v['kind'], ['finite', 'unlimited'] as const)
  if (kind === 'unlimited') {
    closed(v, ['kind'])
    return { kind }
  }
  closed(v, ['kind', 'count'])
  const n = count(v['count'])
  if (!n || n > 4294967295) throw new Error('Invalid quantity')
  return { kind, count: n }
}
export function configuration(value: unknown, tenant: string, service?: string) {
  const v = closed(value, [
    'wireVersion',
    'configurationId',
    'tenantId',
    'connections',
    'targets',
    'expiresAt',
    'quantity',
    'keyId',
  ])
  const targets = unique(array(v['targets'], target), (v) => `${v.platform}/${v.architecture}`)
  if (
    v['wireVersion'] !== 1 ||
    uuid(v['tenantId']) !== tenant ||
    !targets.length ||
    targets.length > 4 ||
    integer(v['expiresAt']) <= 0 ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(identifier(v['keyId']))
  )
    throw new Error('Invalid configuration')
  return {
    wireVersion: 1 as const,
    configurationId: uuid(v['configurationId']),
    tenantId: tenant,
    connections: signedConnections(v['connections'], tenant, service),
    targets,
    expiresAt: integer(v['expiresAt']),
    quantity: quantity(v['quantity']),
    keyId: identifier(v['keyId']),
  }
}
export function readConfiguration(value: unknown, tenant: string, id?: string, service?: string) {
  const v = closed(value, [
    'configuration',
    'state',
    'createdBy',
    'responsibleUser',
    'reserved',
    'consumed',
    'remaining',
  ])
  const result = {
    configuration: configuration(v['configuration'], tenant, service),
    state: enumeration(v['state'], ['available', 'expired', 'revoked'] as const),
    createdBy: identifier(v['createdBy']),
    responsibleUser: nullable(v['responsibleUser'], (v) => user(v, tenant)),
    reserved: count(v['reserved']),
    consumed: count(v['consumed']),
    remaining: nullable(v['remaining'], count),
  }
  const q = result.configuration.quantity
  if (
    (id && result.configuration.configurationId !== id) ||
    (q.kind === 'unlimited'
      ? result.remaining !== null
      : result.remaining !== q.count! - result.reserved - result.consumed)
  )
    throw new Error('Invalid usage')
  return result
}
function settings(value: unknown) {
  const v = closed(value, [
      'revision',
      'values',
      'grantMaxSeconds',
      'configurationMaxSeconds',
      'configurationFilename',
    ]),
    values = closed(v['values'], ['grantSeconds', 'configurationDefaultSeconds', 'platforms'])
  const result = {
    revision: count(v['revision']),
    values: {
      grantSeconds: count(values['grantSeconds']),
      configurationDefaultSeconds: count(values['configurationDefaultSeconds']),
      platforms: unique(
        array(values['platforms'], (v) => enumeration(v, platforms)),
        (v) => v,
      ),
    },
    grantMaxSeconds: count(v['grantMaxSeconds']),
    configurationMaxSeconds: count(v['configurationMaxSeconds']),
    configurationFilename: identifier(v['configurationFilename']),
  }
  if (
    result.grantMaxSeconds !== 604800 ||
    result.configurationMaxSeconds !== 31536000 ||
    result.configurationFilename !== configurationFilename ||
    !result.values.grantSeconds ||
    result.values.grantSeconds > result.grantMaxSeconds ||
    !result.values.configurationDefaultSeconds ||
    result.values.configurationDefaultSeconds > result.configurationMaxSeconds ||
    result.values.platforms.length > 2
  )
    throw new Error('Invalid settings')
  return result
}
const configurationFields = {
  configurationId: uuid,
  state: (v: unknown) => enumeration(v, ['available', 'revoked', 'expired'] as const),
  createdAt: integer,
  expiresAt: integer,
  createdBy: identifier,
  targets: (v: unknown) => {
    const values = unique(array(v, target), (x) => `${x.platform}/${x.architecture}`)
    if (!values.length || values.length > 4) throw new Error('Invalid targets')
    return values
  },
  quantity,
  reserved: count,
  consumed: count,
  remaining: (v: unknown) => nullable(v, count),
}
export interface ConfigurationInput {
  operationId: string
  secret: string
  lifetimeSeconds: number | null
  quantity: ReturnType<typeof quantity>
  targets: ReturnType<typeof target>[]
}
export function createConfigurationsClient(
  transport: HttpTransport,
  tenant: string,
  service: string,
) {
  return {
    list: <F extends keyof typeof configurationFields = keyof typeof configurationFields>(
      query: DirectoryQuery<F> = {},
    ) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/agent-configurations',
        query: queryParameters({ limit: 20, ...query }),
        successStatus: 200,
        decode(value) {
          const page = projectedPage(value, configurationFields, query.fields, ['configurationId'])
          if (!query.fields)
            for (const item of page.items) {
              const row = item as unknown as {
                quantity: ReturnType<typeof quantity>
                remaining: number | null
                reserved: number
                consumed: number
              }
              if (
                row.quantity.kind === 'unlimited'
                  ? row.remaining !== null
                  : row.remaining !== row.quantity.count! - row.reserved - row.consumed
              )
                throw new Error('Invalid usage')
            }
          return page
        },
      }),
    settings: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/agent-enrollment-settings',
        successStatus: 200,
        decode: settings,
      }),
    saveSettings: (
      operationId: string,
      expectedRevision: number,
      values: ReturnType<typeof settings>['values'],
    ) =>
      transport.request({
        method: 'PUT',
        path: '/api/v1/agent-enrollment-settings',
        body: { operationId: uuid(operationId), expectedRevision, values },
        successStatus: 200,
        decode: (v) => {
          const result = settings(v)
          if (
            result.revision !== expectedRevision + 1 ||
            JSON.stringify(result.values) !== JSON.stringify(values)
          )
            throw new Error('Wrong settings receipt')
          return result
        },
      }),
    create: (body: ConfigurationInput) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/agent-configurations',
        body,
        responseType: 'arraybuffer',
        successStatus: 200,
        decode: (v) => {
          const file = attachment(v, 'application/json', configurationFilename, 16_384)
          try {
            const raw = closed(
              JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes)),
              ['configuration', 'secret', 'signature'],
            )
            const metadata = configuration(raw['configuration'], tenant, service)
            base64url(raw['secret'], 32)
            base64url(raw['signature'], 64)
            if (
              raw['secret'] !== body.secret ||
              JSON.stringify(metadata.targets) !== JSON.stringify(body.targets) ||
              JSON.stringify(metadata.quantity) !== JSON.stringify(body.quantity)
            )
              throw new Error('Wrong configuration receipt')
            return { file, configuration: metadata }
          } catch (error) {
            new Uint8Array(file.bytes).fill(0)
            throw error
          }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/agent-configurations/{id}',
        pathParams: { id: uuid(id) },
        successStatus: 200,
        decode: (v) => readConfiguration(v, tenant, id, service),
      }),
    operation: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/agent-configuration-operations/{id}',
        pathParams: { id: uuid(id) },
        successStatus: 200,
        decode: (v) => nullable(v, (v) => readConfiguration(v, tenant, undefined, service)),
      }),
    revoke: (id: string, operationId: string) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/agent-configurations/{id}/revoke',
        pathParams: { id: uuid(id) },
        body: { operationId: uuid(operationId) },
        successStatus: 204,
      }),
  }
}
