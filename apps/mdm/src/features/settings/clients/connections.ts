import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
/** Current Agent wire DTOs. Browser reads public trust; the backend alone signs it. */
import type { HttpTransport } from '@rss/api/mdm'
import { array, count, identifier, nullable, unique, uuid } from '../../../services/decode'
import { base64url } from '../../enrollment/clients/packages'
import { attachment } from '../../enrollment/clients/binary'
import { origin, positive, sha256 } from './value'

export const connectionsFilename = 'rss-agent-connections.json'
export function connectionConfiguration(value: unknown, tenant: string, service?: string) {
  if (!wireSchemas.getApiV1AgentConnectionsResponse.validateConfiguration(value))
    throw new Error('Invalid contract value')

  const v = value
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
  if (!wireSchemas.postApiV1AgentConnectionsPublishResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    configuration: connectionConfiguration(v['configuration'], tenant, service),
    signature: base64url(v['signature'], 64),
  }
}
export type SignedConnections = ReturnType<typeof signedConnections>
function draft(value: unknown, tenant: string, service?: string) {
  if (!wireSchemas.putApiV1AgentConnectionsResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  return { configuration: connectionConfiguration(v['configuration'], tenant, service) }
}
export function connectionState(value: unknown, tenant: string, service?: string) {
  if (!wireSchemas.getApiV1AgentConnectionsResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  const serviceId = uuid(v['serviceId']),
    c = v['convergence'],
    b = v['retirementBlockers']
  if (service && serviceId !== service) throw new Error('Wrong host service')
  const verificationKeys = Object.fromEntries(
    Object.entries(v['verificationKeys']).map(([k, v]) => {
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
        const d = value
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
export function connectionReceipt(value: unknown, tenant: string, service?: string) {
  if (!wireSchemas.getApiV1AgentConnectionOperationsByIdResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  return nullable(value, (value) => {
    const v = value,
      action = v['action']
    if (action === 'saved') {
      return { action, draft: draft(v['draft'], tenant, service) }
    }

    return { action, configuration: signedConnections(v['configuration'], tenant, service) }
  })
}
export function connectionObservation(value: unknown) {
  if (!wireSchemas.getApiV1AgentConnectionsDevicesByDeviceObservationResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  return nullable(value, (value) => {
    const v = value
    const acknowledgement = nullable(v['acknowledgement'], (value) => {
      const a = value
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
        const f = value,
          r = f['report']
        return {
          report: {
            operationId: uuid(r['operationId']),
            revision: positive(r['revision']),
            reason: r['reason'],
          },
          origin: origin(f['origin']),
          receivedAt: count(f['receivedAt']),
        }
      }),
    }
  })
}
export function connectionDevices(value: unknown, revision: number) {
  if (!wireSchemas.getApiV1AgentConnectionsDevicesResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  if (positive(v['targetRevision']) !== revision) throw new Error('Wrong convergence target')
  return {
    targetRevision: revision,
    items: unique(
      array(v['items'], (value) => {
        const d = value
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
export function createConnectionsClient(transport: HttpTransport, tenant: string, service: string) {
  return {
    read: () =>
      api.getApiV1AgentConnections(transport, {}, (v) => connectionState(v, tenant, service)),
    save: (
      operationId: string,
      expectedRevision: number,
      preferredOrigin: string,
      origins: string[],
    ) =>
      api.putApiV1AgentConnections(
        transport,
        {
          body: {
            operationId: uuid(operationId),
            expectedRevision: count(expectedRevision),
            preferredOrigin: origin(preferredOrigin),
            origins: origins.map(origin),
          },
        },
        (v) => {
          const d = draft(v, tenant, service)
          if (
            d.configuration.revision !== expectedRevision + 1 ||
            d.configuration.preferredOrigin !== preferredOrigin ||
            JSON.stringify(d.configuration.origins) !== JSON.stringify(origins)
          )
            throw new Error('Wrong saved connection receipt')
          return d
        },
      ),
    publish: (operationId: string, expectedRevision: number) =>
      api.postApiV1AgentConnectionsPublish(
        transport,
        { body: { operationId: uuid(operationId), expectedRevision: positive(expectedRevision) } },
        (v) => {
          const c = signedConnections(v, tenant, service)
          if (c.configuration.revision !== expectedRevision)
            throw new Error('Wrong published connection receipt')
          return c
        },
      ),
    operation: (id: string) =>
      api.getApiV1AgentConnectionOperationsById(transport, { pathParams: { id: uuid(id) } }, (v) =>
        connectionReceipt(v, tenant, service),
      ),
    devices: (revision: number, after?: string) =>
      api.getApiV1AgentConnectionsDevices(
        transport,
        { query: { revision: positive(revision), ...(after ? { after: uuid(after) } : {}) } },
        (v) => connectionDevices(v, revision),
      ),
    observation: (device: string) =>
      api.getApiV1AgentConnectionsDevicesByDeviceObservation(
        transport,
        { pathParams: { device: identifier(device) } },
        connectionObservation,
      ),
    download: () =>
      api.getApiV1AgentConnectionsConfiguration(transport, {}, (v) => {
        const file = attachment(v, 'application/json', connectionsFilename, 65_536)
        signedConnections(
          JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes)),
          tenant,
          service,
        )
        return file
      }),
  }
}
