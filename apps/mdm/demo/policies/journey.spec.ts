import { expect, it } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createScenario, TENANT } from '../scenario'
import { createDeviceDemo } from '../devices/state'
import { createAutomationDemo } from './state'
import { createPolicyClients } from '../../src/features/policies/client'
const operation = <T>(input: T, expectedRevision = 0) => ({
  operationId: crypto.randomUUID(),
  expectedRevision,
  input,
})
it('carries Scope and resource edits through HTTP clients into continuous assignments and keeps preview, sources and unknown recovery honest', async () => {
  const devices = createDeviceDemo(),
    automation = createAutomationDemo(devices),
    scenario = createScenario(
      [automation.handle, devices.handle],
      () => {
        devices.reset()
        automation.reset()
      },
      automation.tick,
    )
  const login = await scenario.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  const headers = {
    'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
    'x-identity-request': '1',
  }
  const transport = {
    async request<T>(o: RequestOptions<T>) {
      const path = o.path.replace(/\{([^}]+)\}/g, (_, key: string) =>
        encodeURIComponent(o.pathParams?.[key] ?? ''),
      )
      const query = new URLSearchParams(
        Object.entries(o.query ?? {})
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      )
      const r = await scenario.handle(o.method, `${path}?${query}`, o.body, headers)
      if (r.status !== o.successStatus)
        throw Object.assign(new Error('Rejected'), { status: r.status })
      return o.decode(r.body)
    },
  } as unknown as HttpTransport
  const client = createPolicyClients(transport, TENANT, true),
    scope = crypto.randomUUID()
  await client.scopes.change(
    scope,
    operation({ action: 'put', definition: { targets: [], limitations: null, exclusions: [] } }),
  )
  await client.resources.change('fw', operation({ action: 'create', kind: 'configuration' }))
  await client.resources.change(
    'fw',
    operation({ action: 'firewall_version', version: '1', enabled: true }, 1),
  )
  await client.resources.change('fw', operation({ action: 'activate', version: '1' }, 2))
  const definition = {
    source: 'resource' as const,
    parameters: {},
    resource: 'fw',
    resourceVersion: '1',
    scope,
    enabled: true,
    exitBehavior: 'cancel' as const,
    trigger: { kind: 'on_change' as const },
    validity: null,
  }
  await client.policies.change('policy', operation({ action: 'put', definition }))
  expect((await client.policies.read('policy')).members).toEqual([])
  const before = (await client.executions.list()).items
  await client.policies.preview('policy', definition)
  expect((await client.executions.list()).items).toEqual(before)
  await client.scopes.change(
    scope,
    operation(
      {
        action: 'put',
        definition: {
          targets: [{ kind: 'device', id: 'device-01' }],
          limitations: null,
          exclusions: [],
        },
      },
      1,
    ),
  )
  const current = await client.policies.read('policy')
  expect(current.revision).toBe(1)
  expect(current.members[0]).toMatchObject({
    device: 'device-01',
    reason: 'applicable',
    execution: expect.any(String),
  })
  const execution = await client.executions.read(current.members[0]!.execution!)
  expect(execution).toMatchObject({
    origin: { kind: 'policy', revision: 1, cancellation: 'none' },
    receipt: 'not_received',
    effect: 'unverified',
    compliance: 'unknown',
  })
  const pause = operation(
    { action: 'put' as const, definition: { ...definition, enabled: false } },
    1,
  )
  scenario.set('unknown')
  await expect(client.policies.change('policy', pause)).rejects.toMatchObject({ status: 503 })
  scenario.set('normal')
  expect((await client.policies.change('policy', pause)).revision).toBe(2)
  expect((await client.executions.list()).items).toHaveLength(1)
  await expect(
    createPolicyClients(transport, TENANT, false).policies.read('policy'),
  ).rejects.toThrow()
  scenario.set('denied')
  await expect(client.policies.read('policy')).rejects.toMatchObject({ status: 403 })
})
