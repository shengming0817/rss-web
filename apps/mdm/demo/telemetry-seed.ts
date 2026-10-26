import { createHash, randomUUID } from 'node:crypto'
import type { createAutomationDemo } from './policies/state'
import type { DemoRequest } from './scenario'
import { ADMIN } from './operations/authorization'
import { catalog } from './devices/fixtures'
import { defaultApplicability, identityMapping } from '../src/features/policies/collection-draft'
import { telemetryProfile } from '../src/features/policies/clients/telemetry-profile'
import { telemetryBytes } from '../src/contracts/collection/canonical'
export const DEMO_PROFILE = 'demo-telemetry-profile'
export function seedTelemetry(automation: ReturnType<typeof createAutomationDemo>) {
  const actor = { principalId: ADMIN, sessionId: randomUUID() },
    scope = '88888888-8888-4888-8888-888888888888',
    template = 'demo-telemetry-script'
  function send(path: string, body: unknown, query = new URLSearchParams(), method = 'POST') {
    const request: DemoRequest = { path, body, query, method, headers: {}, actor },
      reply = automation.handle(request, 'normal')
    if (!reply || reply.status >= 300)
      throw new Error(`Telemetry demo seed rejected: ${path} (${reply?.status})`)
    return reply.body
  }
  const write = (path: string, input: unknown, expectedRevision = 0) =>
    send(path, { operationId: randomUUID(), expectedRevision, input })
  const result = write(`/api/v1/scopes/${scope}`, {
    action: 'put',
    definition: {
      targets: [
        { kind: 'device', id: 'device-01' },
        { kind: 'device', id: 'device-02' },
      ],
      limitations: null,
      exclusions: [],
    },
  }) as { task: string }
  for (let i = 0; i < 3; i++)
    send(`/api/v1/scopes/${scope}/tasks/${result.task}`, undefined, undefined, 'GET')
  const fields = catalog.filter((f) => f.timeSeries)
  function publish(
    id: string,
    kind: 'script' | 'telemetry_profile',
    definition: unknown,
    bytes: Uint8Array,
  ) {
    write(`/api/v1/resources/${id}`, { action: 'create', kind })
    write(
      `/api/v1/resources/${id}`,
      {
        action: 'version',
        kind,
        version: 'v1',
        variants: [
          {
            platform: 'windows',
            architecture: 'x86_64',
            key: 'default',
            declaration: {
              kind,
              artifact: {
                reference: 'content',
                length: bytes.byteLength,
                sha256: [...createHash('sha256').update(bytes).digest()],
              },
              definition,
            },
          },
        ],
      },
      1,
    )
    const content = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(content).set(bytes)
    send(
      `/api/v1/resources/${id}/content`,
      content,
      new URLSearchParams({
        version: 'v1',
        variant: 'default',
        platform: 'windows',
        architecture: 'x86_64',
      }),
    )
    write(`/api/v1/resources/${id}`, { action: 'activate', version: 'v1' }, 2)
  }
  publish(
    template,
    'script',
    {
      profile: 'power_shell7',
      sql: null,
      runAs: 'system',
      encoding: 'utf8',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
      bindings: {},
      output: { type: 'object' },
      purpose: {
        kind: 'collection',
        scope: { kind: 'device' },
        applicability: defaultApplicability(),
        mappings: Object.fromEntries(
          fields.map((f) => [f.key, identityMapping('/' + f.key.split('.').at(-1))]),
        ),
      },
      timeoutSeconds: 10,
      outputBytes: 65536,
      maxRows: 64,
    },
    new TextEncoder().encode('# Synthetic telemetry fixture; no device execution.\n'),
  )
  const profile = telemetryProfile({
    template: {
      resource: template,
      version: 'v1',
      variant: 'default',
      platform: 'windows',
      architecture: 'x86_64',
    },
    parameters: {},
    fields: fields.map((f) => ({ key: f.key, version: f.version })),
    projection: 'both',
    sampleMillis: 60000,
    uploadMillis: 300000,
    budget: {
      points: 256,
      bytes: 1048576,
      resources: 64,
      executionMillis: 10000,
      outputBytes: 65536,
    },
    boost: null,
    backfillSeconds: 86400,
  })
  publish(DEMO_PROFILE, 'telemetry_profile', profile, telemetryBytes(profile))
  write('/api/v1/policies/99999999-9999-4999-8999-999999999999', {
    action: 'put',
    enabled: true,
    definition: {
      scope,
      action: {
        kind: 'telemetry_profile',
        resource: {
          id: DEMO_PROFILE,
          version: 'v1',
          platform: 'windows',
          architecture: 'x86_64',
          variant: 'default',
        },
      },
    },
  })
}
