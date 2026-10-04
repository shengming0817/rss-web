import { expect, it } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createScenario, TENANT } from '../scenario'
import { createDeviceDemo } from '../devices/state'
import { createAutomationDemo } from './state'
import { seedScriptPolicies } from './seed'
import { createPolicyClients } from '../../src/features/policies/client'
const operation = <T>(input: T, expectedRevision = 0) => ({
  operationId: crypto.randomUUID(),
  expectedRevision,
  input,
})
it('carries the shared formal Policy through the HTTP session, preserves existing false/1, and fences CAS', async () => {
  const devices = createDeviceDemo(),
    automation = createAutomationDemo(devices),
    seed = seedScriptPolicies(automation)
  const scenario = createScenario(
    [automation.handle, devices.handle],
    () => {
      devices.reset()
      automation.reset()
    },
    automation.tick,
    automation.observe,
  )
  const login = await scenario.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
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
  const clients = createPolicyClients(transport, TENANT, true),
    policies = clients.policies
  expect((await policies.list()).items).toHaveLength(4)
  const old = await policies.read(seed.ids[1]!)
  expect(old.definition.selfService).toMatchObject({ allowAi: false, riskLevel: 1 })
  const edited = {
    ...old.definition,
    selfService: { ...old.definition.selfService!, description: 'Edited purpose' },
  }
  const saved = await policies.change(
    old.id,
    operation({ action: 'put', enabled: true, definition: edited }, old.revision),
  )
  expect(saved.definition.selfService).toMatchObject({
    allowAi: false,
    riskLevel: 1,
    description: 'Edited purpose',
  })
  expect(saved.versionId).toBe(old.versionId)
  await expect(
    policies.change(old.id, operation({ action: 'disable' }, old.revision)),
  ).rejects.toMatchObject({ status: 409 })
  const disabled = await policies.change(old.id, operation({ action: 'disable' }, saved.revision))
  expect(disabled.enabled).toBe(false)
  expect(disabled.versionId).toBe(saved.versionId)
  expect(disabled.definition.selfService?.published).toBe(true)
  expect((await clients.executions.list()).items).toEqual([])
  // Formal browser clients also consume these endpoints outside demo mode.
  expect(await createPolicyClients(transport, TENANT, false).policies.read(old.id)).toEqual(
    disabled,
  )
  scenario.set('denied')
  await expect(policies.read(old.id)).rejects.toMatchObject({ status: 403 })
})
