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
import { base64url, httpsOrigin, platforms, releaseChannels, target } from './packages'
import { attachment } from './binary'
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
export function configuration(value: unknown, tenant: string) {
  const v = closed(value, [
    'wireVersion',
    'configurationId',
    'tenantId',
    'origin',
    'targets',
    'channels',
    'expiresAt',
    'quantity',
    'keyId',
  ])
  const targets = unique(array(v['targets'], target), (v) => `${v.platform}/${v.architecture}`),
    channels = unique(
      array(v['channels'], (v) => enumeration(v, releaseChannels)),
      (v) => v,
    )
  if (
    v['wireVersion'] !== 1 ||
    uuid(v['tenantId']) !== tenant ||
    !targets.length ||
    targets.length > 4 ||
    !channels.length ||
    channels.length > 3 ||
    integer(v['expiresAt']) <= 0 ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(identifier(v['keyId']))
  )
    throw new Error('Invalid configuration')
  return {
    wireVersion: 1 as const,
    configurationId: uuid(v['configurationId']),
    tenantId: tenant,
    origin: httpsOrigin(v['origin']),
    targets,
    channels,
    expiresAt: integer(v['expiresAt']),
    quantity: quantity(v['quantity']),
    keyId: identifier(v['keyId']),
  }
}
export function readConfiguration(value: unknown, tenant: string, id?: string) {
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
    configuration: configuration(v['configuration'], tenant),
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
export interface ConfigurationInput {
  operationId: string
  secret: string
  lifetimeSeconds: number | null
  quantity: ReturnType<typeof quantity>
  targets: ReturnType<typeof target>[]
  channels: (typeof releaseChannels)[number][]
}
export function createConfigurationsClient(transport: HttpTransport, tenant: string) {
  return {
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
            const metadata = configuration(raw['configuration'], tenant)
            base64url(raw['secret'], 32)
            base64url(raw['signature'], 64)
            if (
              raw['secret'] !== body.secret ||
              JSON.stringify(metadata.targets) !== JSON.stringify(body.targets) ||
              JSON.stringify(metadata.channels) !== JSON.stringify(body.channels) ||
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
        decode: (v) => readConfiguration(v, tenant, id),
      }),
    operation: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/agent-configuration-operations/{id}',
        pathParams: { id: uuid(id) },
        successStatus: 200,
        decode: (v) => nullable(v, (v) => readConfiguration(v, tenant)),
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
