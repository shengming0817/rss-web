import { createHash, randomUUID } from 'node:crypto'
import {
  defaultSchedule,
  type ExecutionDefinition,
} from '../../src/features/policies/clients/model'
import type { createAutomationDemo } from './state'
import type { DemoRequest } from '../scenario'
/** Seed the explicit demo through the same HTTP owners as the browser. */
export function seedScriptPolicies(automation: ReturnType<typeof createAutomationDemo>) {
  const scope = '66666666-6666-4666-8666-666666666666',
    resource = 'demo-system-diagnostics'
  const actor = { principalId: '22222222-2222-4222-8222-222222222222', sessionId: randomUUID() }
  function send(path: string, body: unknown, query = new URLSearchParams()) {
    const request: DemoRequest = { path, method: 'POST', body, query, headers: {}, actor }
    const reply = automation.handle(request, 'normal')
    if (!reply || reply.status >= 300)
      throw new Error(`Demo seed rejected: ${path} (${reply?.status})`)
  }
  function write(path: string, input: unknown, expectedRevision = 0) {
    send(path, { operationId: randomUUID(), expectedRevision, input })
  }
  write(`/api/v1/scopes/${scope}`, {
    action: 'put',
    definition: { targets: [], limitations: null, exclusions: [] },
  })
  write(`/api/v1/resources/${resource}`, { action: 'create', kind: 'script' })
  const encoded = new TextEncoder().encode('# Synthetic demo artifact; no device execution.\n'),
    bytes = new ArrayBuffer(encoded.byteLength)
  new Uint8Array(bytes).set(encoded)
  write(
    `/api/v1/resources/${resource}`,
    {
      action: 'version',
      kind: 'script',
      version: '1',
      variants: [
        {
          platform: 'windows',
          architecture: 'x86_64',
          key: 'default',
          declaration: {
            kind: 'script',
            artifact: {
              reference: 'diagnostics.ps1',
              length: bytes.byteLength,
              sha256: [...createHash('sha256').update(new Uint8Array(bytes)).digest()],
            },
            definition: {
              profile: 'power_shell7',
              runAs: 'system',
              encoding: 'utf8',
              parameters: {
                type: 'object',
                properties: {
                  label: { type: 'string', minLength: 1, maxLength: 80 },
                  detail: { type: 'integer', minimum: 1, maximum: 3 },
                },
                required: ['label', 'detail'],
                additionalProperties: false,
              },
              bindings: {
                label: { kind: 'named', name: 'Label' },
                detail: { kind: 'named', name: 'Detail' },
              },
              output: { type: 'object' },
              purpose: { kind: 'action' },
              timeoutSeconds: 30,
              outputBytes: 1024,
              maxRows: 1,
            },
          },
        },
      ],
    },
    1,
  )
  send(
    `/api/v1/resources/${resource}/content`,
    bytes,
    new URLSearchParams({
      version: '1',
      variant: 'default',
      platform: 'windows',
      architecture: 'x86_64',
    }),
  )
  write(`/api/v1/resources/${resource}`, { action: 'activate', version: '1' }, 2)
  const definition: ExecutionDefinition = {
    scope,
    action: {
      kind: 'execution',
      resource: {
        id: resource,
        version: '1',
        platform: 'windows',
        architecture: 'x86_64',
        variant: 'default',
      },
      parameters: { label: { kind: 'input' }, detail: { kind: 'fixed', value: 1 } },
      schedule: defaultSchedule(),
      frequency: 'once_per_version',
      runLifetimeSeconds: 3600,
    },
  }
  const states = [
    { name: 'System diagnostics', published: true, allowAi: true, riskLevel: 2, enabled: true },
    { name: 'Manual diagnostics', published: true, allowAi: false, riskLevel: 1, enabled: true },
    { name: 'Withdrawn diagnostics', published: false, allowAi: true, riskLevel: 2, enabled: true },
    { name: 'Disabled diagnostics', published: true, allowAi: true, riskLevel: 2, enabled: false },
  ]
  const ids = states.map((state, index) => {
    const id = `77777777-7777-4777-8777-${String(index + 1).padStart(12, '0')}`
    write(`/api/v1/policies/${id}`, {
      action: 'put',
      enabled: state.enabled,
      definition: {
        ...definition,
        selfService: {
          published: state.published,
          allowAi: state.allowAi,
          riskLevel: state.riskLevel,
          displayName: state.name,
          description: 'Collect synthetic diagnostics for the demo.',
          prerequisites: 'An enrolled Windows device with the RSS Agent.',
          sideEffects: 'Produces diagnostic output; no real script runs in this demo.',
          category: 'Diagnostics',
          keywords: ['diagnostics', 'system'],
        },
      },
    })
    return id
  })
  return { scope, resource, definition, ids }
}
