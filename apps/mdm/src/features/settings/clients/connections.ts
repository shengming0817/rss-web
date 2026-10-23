/** Current Agent wire DTOs. Browser reads public trust; the backend alone signs it. */
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  record,
  unique,
  uuid,
} from '../../../services/decode'
import { base64url } from '../../enrollment/clients/packages'
import { attachment } from '../../enrollment/clients/binary'
import { origin, positive, sha256 } from './value'

export const connectionsFilename = 'rss-agent-connections.json'
export function connectionConfiguration(value: unknown, tenant: string, service?: string) {
  const v = closed(value, [
    'wireVersion',
    'serviceId',
    'tenantId',
    'revision',
    'preferredOrigin',
    'origins',
    'keyId',
  ])
  const serviceId = uuid(v['serviceId']),
    origins = unique(array(v['origins'], origin), (v) => v)
  const keyId = identifier(v['keyId']),
    preferredOrigin = origin(v['preferredOrigin'])
  if (
    v['wireVersion'] !== 1 ||
    uuid(v['tenantId']) !== tenant ||
    (service && serviceId !== service) ||
    !origins.length ||
    origins.length > 8 ||
    origins.some((v, i) => i > 0 && origins[i - 1]! >= v) ||
    !origins.includes(preferredOrigin) ||
    origins.some((v) => v.length > 2048) ||
    keyId.length > 128 ||
    !/^[A-Za-z0-9._-]+$/.test(keyId)
  )
    throw new Error('Invalid connection binding')
  return {
    wireVersion: 1 as const,
    serviceId,
    tenantId: tenant,
    revision: positive(v['revision']),
    preferredOrigin,
    origins,
    keyId,
  }
}
export function signedConnections(value: unknown, tenant: string, service?: string) {
  const v = closed(value, ['configuration', 'signature'])
  return {
    configuration: connectionConfiguration(v['configuration'], tenant, service),
    signature: base64url(v['signature'], 64),
  }
}
export type SignedConnections = ReturnType<typeof signedConnections>
function draft(value: unknown, tenant: string, service?: string) {
  const v = closed(value, ['configuration'])
  return { configuration: connectionConfiguration(v['configuration'], tenant, service) }
}
export function connectionState(value: unknown, tenant: string) {
  const v = closed(value, [
    'serviceId',
    'draft',
    'published',
    'verificationKeys',
    'deployments',
    'convergence',
    'retirementBlockers',
  ])
  const serviceId = uuid(v['serviceId']),
    c = closed(v['convergence'], ['targetRevision', 'activeDevices', 'confirmedDevices']),
    b = closed(v['retirementBlockers'], ['configurations', 'installations'])
  const verificationKeys = Object.fromEntries(
    Object.entries(record(v['verificationKeys'])).map(([k, v]) => {
      if (!/^[A-Za-z0-9._-]{1,128}$/.test(k)) throw new Error('Invalid connection key')
      return [k, base64url(v, 32)]
    }),
  )
  if (Object.keys(verificationKeys).length > 16) throw new Error('Invalid connection keys')
  const result = {
    serviceId,
    draft: nullable(v['draft'], (v) => draft(v, tenant, serviceId)),
    published: nullable(v['published'], (v) => signedConnections(v, tenant, serviceId)),
    verificationKeys,
    deployments: unique(
      array(v['deployments'], (value) => {
        const d = closed(value, [
          'origin',
          'hostId',
          'revision',
          'observedAt',
          'configurationRevision',
        ])
        return {
          origin: origin(d['origin']),
          hostId: uuid(d['hostId']),
          revision: positive(d['revision']),
          observedAt: count(d['observedAt']),
          configurationRevision: count(d['configurationRevision']),
        }
      }),
      (d) => d.origin,
    ),
    convergence: {
      targetRevision: nullable(c['targetRevision'], positive),
      activeDevices: count(c['activeDevices']),
      confirmedDevices: count(c['confirmedDevices']),
    },
    retirementBlockers: {
      configurations: count(b['configurations']),
      installations: count(b['installations']),
    },
  }
  if (
    result.convergence.confirmedDevices > result.convergence.activeDevices ||
    result.convergence.targetRevision !== (result.published?.configuration.revision ?? null) ||
    (result.draft && !verificationKeys[result.draft.configuration.keyId]) ||
    (result.published && !verificationKeys[result.published.configuration.keyId])
  )
    throw new Error('Invalid connection state')
  return result
}
export type ConnectionState = ReturnType<typeof connectionState>
export function connectionReceipt(value: unknown, tenant: string) {
  return nullable(value, (value) => {
    const v = record(value),
      action = enumeration(v['action'], ['saved', 'published'] as const)
    if (action === 'saved') {
      closed(v, ['action', 'draft'])
      return { action, draft: draft(v['draft'], tenant) }
    }
    closed(v, ['action', 'configuration'])
    return { action, configuration: signedConnections(v['configuration'], tenant) }
  })
}
export function connectionObservation(value: unknown) {
  return nullable(value, (value) => {
    const v = closed(value, [
      'targetRevision',
      'registration',
      'generation',
      'acknowledgement',
      'receivedAt',
      'failure',
    ])
    const acknowledgement = nullable(v['acknowledgement'], (value) => {
      const a = closed(value, ['operationId', 'revision', 'digest', 'origin'])
      return {
        operationId: uuid(a['operationId']),
        revision: positive(a['revision']),
        digest: sha256(a['digest']),
        origin: origin(a['origin']),
      }
    })
    const receivedAt = nullable(v['receivedAt'], count)
    if ((acknowledgement === null) !== (receivedAt === null))
      throw new Error('Unpaired connection ACK')
    return {
      targetRevision: nullable(v['targetRevision'], positive),
      registration: uuid(v['registration']),
      generation: positive(v['generation']),
      acknowledgement,
      receivedAt,
      failure: nullable(v['failure'], (value) => {
        const f = closed(value, ['report', 'origin', 'receivedAt']),
          r = closed(f['report'], ['operationId', 'revision', 'reason'])
        return {
          report: {
            operationId: uuid(r['operationId']),
            revision: positive(r['revision']),
            reason: enumeration(r['reason'], [
              'signature_rejected',
              'identity_mismatch',
              'revision_rejected',
              'persistence_failed',
              'network_unavailable',
            ] as const),
          },
          origin: origin(f['origin']),
          receivedAt: count(f['receivedAt']),
        }
      }),
    }
  })
}
export function connectionDevices(value: unknown, revision: number) {
  const v = closed(value, ['targetRevision', 'items', 'next'])
  if (positive(v['targetRevision']) !== revision) throw new Error('Wrong convergence target')
  return {
    targetRevision: revision,
    items: unique(
      array(v['items'], (value) => {
        const d = closed(value, [
          'device',
          'registration',
          'generation',
          'installedRevision',
          'origin',
          'receivedAt',
        ])
        return {
          device: identifier(d['device']),
          registration: uuid(d['registration']),
          generation: positive(d['generation']),
          installedRevision: nullable(d['installedRevision'], positive),
          origin: nullable(d['origin'], origin),
          receivedAt: nullable(d['receivedAt'], count),
        }
      }),
      (d) => d.registration,
    ),
    next: nullable(v['next'], uuid),
  }
}
export function createConnectionsClient(transport: HttpTransport, tenant: string) {
  return {
    read: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/agent-connections',
        successStatus: 200,
        decode: (v) => connectionState(v, tenant),
      }),
    save: (
      operationId: string,
      expectedRevision: number,
      preferredOrigin: string,
      origins: string[],
    ) =>
      transport.request({
        method: 'PUT',
        path: '/api/v1/agent-connections',
        body: {
          operationId: uuid(operationId),
          expectedRevision: count(expectedRevision),
          preferredOrigin: origin(preferredOrigin),
          origins: origins.map(origin),
        },
        successStatus: 200,
        decode: (v) => {
          const d = draft(v, tenant)
          if (
            d.configuration.revision !== expectedRevision + 1 ||
            d.configuration.preferredOrigin !== preferredOrigin ||
            JSON.stringify(d.configuration.origins) !== JSON.stringify(origins)
          )
            throw new Error('Wrong saved connection receipt')
          return d
        },
      }),
    publish: (operationId: string, expectedRevision: number) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/agent-connections/publish',
        body: { operationId: uuid(operationId), expectedRevision: positive(expectedRevision) },
        successStatus: 200,
        decode: (v) => {
          const c = signedConnections(v, tenant)
          if (c.configuration.revision !== expectedRevision)
            throw new Error('Wrong published connection receipt')
          return c
        },
      }),
    operation: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/agent-connection-operations/{id}',
        pathParams: { id: uuid(id) },
        successStatus: 200,
        decode: (v) => connectionReceipt(v, tenant),
      }),
    devices: (revision: number, after?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/agent-connections/devices',
        query: { revision: positive(revision), ...(after ? { after: uuid(after) } : {}) },
        successStatus: 200,
        decode: (v) => connectionDevices(v, revision),
      }),
    observation: (device: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/agent-connections/devices/{device}/observation',
        pathParams: { device: identifier(device) },
        successStatus: 200,
        decode: connectionObservation,
      }),
    download: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/agent-connections/configuration',
        responseType: 'arraybuffer',
        successStatus: 200,
        decode: (v) => {
          const file = attachment(v, 'application/json', connectionsFilename, 65_536)
          signedConnections(
            JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes)),
            tenant,
          )
          return file
        },
      }),
  }
}
