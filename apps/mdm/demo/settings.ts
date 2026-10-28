import { directoryPage } from './directory'
import { createConnectionsDemo } from './connections'
import { createManagementAuthorizationDemo } from './management-authorization'
import { createPkiDemo } from './pki'
import { createProfilesDemo } from './profiles'
import { createPackageDemo } from './packages'
import { createHash } from 'node:crypto'
/** MOCK_SOURCE: explicit scenario-only settings; no provider or host success is invented. */
import { entries } from '../src/features/settings/entries'
import { channels } from '../src/features/settings/clients/firstUse'
import { TENANT, MANAGEMENT_TENANT, type DomainHandler } from './scenario'
import { closed, record, string, uuid } from '../src/services/decode'
import { error, ok } from './http'
const platformIds = [
  'entry',
  'tls',
  'postgres',
  'dbpassword',
  'instance',
  'audit',
  'native',
  'ledger',
  'operation',
  'organization',
  'recovery',
  'oidc-state',
  'host-config',
]
export function createSettingsDemo(options: { seedDownloads?: boolean } = {}) {
  const connections = createConnectionsDemo()
  const managementAuthorization = createManagementAuthorizationDemo()
  const pki = createPkiDemo()
  const packages = createPackageDemo(options)
  const profiles = createProfilesDemo()
  const operations = new Map<string, { input: string; receipt: unknown }>()
  const tenants = [
    {
      tenantId: TENANT,
      management: false,
      initialEpoch: 1,
      currentEpoch: 1,
      name: 'Demo organization',
      notes: null,
      revision: 1,
      deletable: false,
    },
  ]
  const handle: DomainHandler = (r, scenario) => {
    const connectionsReply = connections.handle(r, scenario)
    if (connectionsReply) return connectionsReply
    const managementReply = managementAuthorization.handle(r, scenario)
    if (managementReply) return managementReply
    const pkiReply = pki.handle(r, scenario)
    if (pkiReply) return pkiReply
    const profileReply = profiles.handle(r, scenario)
    if (profileReply) return profileReply
    const packageReply = packages.handle(r, scenario)
    if (packageReply) return packageReply
    const platform = r.actor.tenantId === MANAGEMENT_TENANT
    if (r.path === '/api/v1/runtime/diagnostics' && r.method === 'GET') {
      if (platform || scenario === 'denied') return error('permission_denied', 403)
      const partial = scenario === 'partial'
      return ok({
        alive: true,
        channels: ['apple', 'windows', 'agent', 'windows_push', 'agent_bootstrap', 'signing'].map(
          (name) => ({
            name,
            state: 'disabled',
            reasons: [],
            mounted: false,
            loadedMaterials: {},
          }),
        ),
        ready: !partial,
        components: [
          {
            name: 'inventory',
            readiness: 'ready',
            health: 'unknown',
            reasons: ['unobserved'],
            task: 'running',
            progress: {
              state: 'unobserved',
              confirmedPosition: null,
              sourceHead: null,
              lagging: null,
              invocationAgeMs: null,
              completedPassAgeMs: null,
              sourceObservationAgeMs: null,
              applied: null,
            },
            bridge: { successful: false, reason: 'unobserved', observedAt: null },
          },
          {
            name: 'automation',
            readiness: partial ? 'not_ready' : 'ready',
            health: partial ? 'degraded' : 'healthy',
            reasons: partial ? ['dependency_unavailable'] : [],
            task: 'running',
            dependencies: [
              {
                name: 'flow_storage',
                state: partial ? 'unavailable' : 'available',
                ...(partial ? { reason: 'deadline' } : {}),
              },
            ],
            dispatch: { consumed: 4, watermark: 4 },
          },
          {
            name: 'execution_recovery',
            readiness: 'ready',
            health: 'unknown',
            reasons: ['unobserved'],
            queues: [{ name: 'pending', count: null, truncated: null }],
            runner: { scan: null, unresolvedAttempts: 0, truncated: false, latestFailure: null },
          },
          ...(!partial
            ? [
                {
                  name: 'telemetry',
                  readiness: 'ready',
                  health: 'healthy',
                  reasons: [],
                  task: 'running',
                  queues: [{ name: 'delivery_pending', count: 0, truncated: false }],
                },
              ]
            : []),
        ],
      })
    }
    if (r.path === '/api/v1/settings/first-use') {
      if (platform) return error('permission_denied', 403)
      if (r.method !== 'GET') return error('action_not_supported', 501)
      // The preset demo has synthetic completion history, never observed provider readiness.
      return ok({
        tenantId: TENANT,
        saved: {
          revision: 1,
          intent: { channels: [...channels], capabilities: {}, completionRequested: true },
        },
        steps: channels.map((id) => ({
          id,
          status: 'unknown',
          reason: 'synthetic_unobserved',
          evidence: [],
        })),
        canComplete: false,
        complete: false,
      })
    }
    if (
      r.path === '/api/v1/settings/catalog' ||
      r.path === '/api/v1/tenant-administration/settings/catalog'
    ) {
      if (r.method !== 'GET') return error('action_not_supported', 501)
      if (r.path.includes('tenant-administration') !== platform)
        return error('permission_denied', 403)
      return ok({
        items:
          scenario === 'empty'
            ? []
            : Object.keys(entries)
                .filter((id) => platformIds.includes(id) === platform)
                .map((id) => ({
                  id,
                  scope: platform ? 'platform' : 'tenant',
                  owner: entries[id as keyof typeof entries].target,
                  custody: platform ? 'deployment_operator' : 'domain_service',
                  lifecycle: 'business_configuration',
                  status: 'unknown',
                  revision: null,
                  desiredRevision: null,
                  appliedRevision: null,
                  configuredCount: null,
                  reason: 'synthetic_unobserved',
                  actions: [],
                })),
        domains: [],
      })
    }
    if (r.path.startsWith('/api/v1/tenant-administration/')) {
      if (!platform) return error('permission_denied', 403)
      const base = '/api/v1/tenant-administration'
      if (r.method === 'GET' && r.path === base + '/tenants')
        return ok(directoryPage(tenants, r, ['tenantId'], { defaultLimit: 100 }))
      if (r.method === 'GET' && r.path.startsWith(base + '/tenants/')) {
        const value = tenants.find((v) => v.tenantId === r.path.split('/').at(-1))
        return value ? ok(value) : error('resource_not_found', 404)
      }
      if (r.method === 'GET' && r.path === base + '/provisionings')
        return ok(
          directoryPage(
            [...operations.values()].map((v) => v.receipt as Record<string, unknown>),
            r,
            ['operationId'],
            { defaultLimit: 100 },
          ),
        )
      if (r.method === 'GET' && r.path.startsWith(base + '/provisionings/')) {
        const old = operations.get(r.path.split('/').at(-1)!)
        return old ? ok(old.receipt) : error('operation_not_found', 404)
      }
      if (r.method === 'POST' && r.path === base + '/provisionings') {
        try {
          const b = closed(r.body, ['name', 'administratorLogin', 'administratorPassword']),
            id = uuid(r.headers['idempotency-key']),
            input = createHash('sha256').update(JSON.stringify(b)).digest('hex'),
            old = operations.get(id)
          if (old)
            return old.input === input ? ok(old.receipt, 202) : error('operation_conflict', 409)
          string(b['administratorPassword'])
          const receipt = {
            operationId: id,
            action: 'provision',
            result: {
              operationId: id,
              tenantId: crypto.randomUUID(),
              administratorId: null,
              hostId: crypto.randomUUID(),
              revision: 1,
              phase: 'reserved',
              blocked: 'capacity',
              origin: null,
              application: null,
            },
          }
          // Demo comparison stays private to this synthetic server, never in browser state.
          operations.set(id, { input, receipt })
          return ok(receipt, 202)
        } catch {
          return error('malformed_request', 400)
        }
      }
      return error('action_not_supported', 501)
    }
    if (r.method === 'GET') {
      if (
        [
          '/api/v1/smtp/versions',
          '/api/v1/storage/connections/versions',
          '/api/v1/windows/wns/versions',
        ].includes(r.path)
      )
        return ok({ items: [], nextCursor: null })
      if (/^\/api\/v1\/apple\/materials\/(apns|profile|managed_account)$/.test(r.path))
        return ok({
          revision: 0,
          desiredRevision: null,
          versionCount: 0,
          materials: {},
          runtimeObservation: 'separate',
          accountBindings: {},
        })
      if (r.path === '/api/v1/storage/connections' || r.path === '/api/v1/windows/wns')
        return ok({
          revision: 0,
          [r.path === '/api/v1/storage/connections' ? 'activeRevision' : 'desiredRevision']: null,
          versionCount: 0,
          current: null,
          latest: null,
          applied: null,
        })
      if (r.path === '/api/v1/smtp')
        return ok({
          revision: 0,
          selectedRevision: null,
          versionCount: 0,
          current: null,
          latest: null,
        })
      if (r.path === '/api/v1/webhooks/materials')
        return ok({ configurationSha256: '0'.repeat(64), keys: { heads: [], materials: [] } })
    }
    if (
      /^\/api\/v1\/(?:apple\/(?:materials|material-operations)|smtp|storage\/connections|windows\/wns|task-signing|pki|webhooks\/materials|agent-packages|runtime\/diagnostics)(?:\/|$)/.test(
        r.path,
      )
    ) {
      record(r.body ?? {})
      return error('action_not_supported', 501)
    }
  }
  return {
    handle,
    reset() {
      connections.reset()
      managementAuthorization.reset()
      pki.reset()
      packages.reset()
      profiles.reset()
      operations.clear()
    },
  }
}
