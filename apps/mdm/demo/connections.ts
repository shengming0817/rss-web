/** MOCK_SOURCE: synthetic public connection data; no deployment or device ACK is invented. */
import { TENANT, type DomainHandler } from './scenario'
import { INSTANCE } from './operations/authorization'
import { error, ok, createReceipts } from './http'
import { closed, count, uuid, array } from '../src/services/decode'
import { origin } from '../src/features/settings/clients/value'
import {
  connectionConfiguration,
  connectionsFilename,
} from '../src/features/settings/clients/connections'
export function demoConnections() {
  return {
    configuration: {
      wireVersion: 1 as const,
      serviceId: INSTANCE,
      tenantId: TENANT,
      revision: 1,
      preferredOrigin: 'https://agent.example.test',
      origins: ['https://agent.example.test'],
      keyId: 'demo-connections',
    },
    signature: Buffer.alloc(64, 1).toString('base64url'),
  }
}
export function createConnectionsDemo() {
  let draft = { configuration: demoConnections().configuration }
  const receipts = createReceipts(),
    operations = new Map<string, unknown>()
  const handle: DomainHandler = (r, scenario) => {
    if (
      !r.path.startsWith('/api/v1/agent-connections') &&
      !r.path.startsWith('/api/v1/agent-connection-operations/')
    )
      return
    if (r.actor.tenantId !== TENANT || scenario === 'denied' || scenario === 'forbidden')
      return error('permission_denied', 403)
    if (r.path === '/api/v1/agent-connections' && r.method === 'GET')
      return ok({
        serviceId: INSTANCE,
        draft,
        published: demoConnections(),
        verificationKeys: { 'demo-connections': Buffer.alloc(32, 1).toString('base64url') },
        deployments: [],
        convergence: { targetRevision: 1, activeDevices: 0, confirmedDevices: 0 },
        retirementBlockers: { configurations: 0, installations: 0 },
      })
    if (r.path.startsWith('/api/v1/agent-connection-operations/') && r.method === 'GET')
      return ok(operations.get(uuid(r.path.split('/').at(-1))) ?? null)
    if (r.path === '/api/v1/agent-connections/configuration' && r.method === 'GET')
      return {
        status: 200,
        body: new TextEncoder().encode(JSON.stringify(demoConnections())).buffer,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${connectionsFilename}"`,
        },
      }
    if (r.path === '/api/v1/agent-connections/devices' && r.method === 'GET')
      return ok({ targetRevision: Number(r.query.get('revision')), items: [], next: null })
    if (
      /^\/api\/v1\/agent-connections\/devices\/[^/]+\/observation$/.test(r.path) &&
      r.method === 'GET'
    )
      return ok(null)
    if (r.path === '/api/v1/agent-connections/publish' && r.method === 'POST')
      return { status: 409, body: { code: 'connection_deployment_unobserved', issuanceId: null } }
    if (r.path === '/api/v1/agent-connections' && r.method === 'PUT') {
      const v = closed(r.body, ['operationId', 'expectedRevision', 'preferredOrigin', 'origins']),
        id = uuid(v['operationId'])
      return receipts.write(r, id, () => {
        if (
          count(v['expectedRevision']) !== draft.configuration.revision ||
          scenario === 'conflict'
        )
          return error('operation_conflict')
        draft = {
          configuration: connectionConfiguration(
            {
              ...draft.configuration,
              revision: draft.configuration.revision + 1,
              preferredOrigin: origin(v['preferredOrigin']),
              origins: array(v['origins'], origin),
            },
            TENANT,
            INSTANCE,
          ),
        }
        operations.set(id, { action: 'saved', draft })
        return ok(draft)
      })
    }
    return error('action_not_supported', 501)
  }
  return {
    handle,
    reset() {
      draft = { configuration: demoConnections().configuration }
      receipts.reset()
      operations.clear()
    },
  }
}
