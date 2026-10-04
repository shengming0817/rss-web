import { createHash, randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createAutomationDemo } from './state'
import { createDeviceDemo } from '../devices/state'
import { createPoliciesClient } from '../../src/features/policies/clients/policies'
import { createConfigurationsClient } from '../../src/features/policies/clients/configurations'
import type { ConfigurationDefinition, PolicyRead } from '../../src/features/policies/clients/model'
import type { DemoRequest } from '../scenario'
function fixture() {
  const automation = createAutomationDemo(createDeviceDemo()),
    actor = { principalId: '22222222-2222-4222-8222-222222222222', sessionId: randomUUID() }
  const op = (input: unknown, expectedRevision = 0) => ({
    input,
    expectedRevision,
    operationId: randomUUID(),
  })
  function send(path: string, body?: unknown, query = new URLSearchParams()) {
    const request: DemoRequest = {
      path,
      body,
      query,
      actor,
      headers: {},
      method: body === undefined ? 'GET' : 'POST',
    }
    return automation.handle(request, 'normal')!
  }
  function scope(members = ['device-01']) {
    const id = randomUUID(),
      body = op({
        action: 'put',
        definition: {
          targets: members.map((id) => ({ kind: 'device', id })),
          limitations: null,
          exclusions: [],
        },
      })
    expect(send(`/api/v1/scopes/${id}`, body).status).toBe(200)
    send(`/api/v1/scopes/${id}/tasks/${body.operationId}`)
    send(`/api/v1/scopes/${id}/tasks/${body.operationId}`)
    return id
  }
  const node = './Device/Vendor/MSFT/Policy/Config/Camera/AllowCamera'
  function resource(value = false, removable = true, suffix = '') {
    const id = `native-${randomUUID()}`,
      path = `/api/v1/resources/${id}`
    const request = {
      kind: 'node',
      node: node + suffix,
      instance: [],
      operation: 'replace',
      value: { type: 'boolean', value },
    }
    const native = {
      target: { kind: 'device' },
      apply: { platform: 'windows', request: { kind: 'sync_ml', request } },
      remove: removable
        ? {
            platform: 'windows',
            request: { kind: 'sync_ml', request: { ...request, operation: 'delete', value: null } },
          }
        : null,
    }
    const bytes = new TextEncoder().encode(JSON.stringify(native)),
      buffer = new ArrayBuffer(bytes.length)
    new Uint8Array(buffer).set(bytes)
    expect(send(path, op({ action: 'create', kind: 'configuration' })).status).toBe(200)
    expect(
      send(
        path,
        op(
          {
            action: 'version',
            version: '1',
            kind: 'configuration',
            variants: [
              {
                key: 'default',
                platform: 'windows',
                architecture: 'x86_64',
                declaration: {
                  kind: 'configuration',
                  artifact: {
                    reference: 'native.json',
                    length: bytes.length,
                    sha256: [...createHash('sha256').update(bytes).digest()],
                  },
                },
              },
            ],
          },
          1,
        ),
      ).status,
    ).toBe(200)
    expect(
      send(
        `${path}/content`,
        buffer,
        new URLSearchParams({
          version: '1',
          variant: 'default',
          platform: 'windows',
          architecture: 'x86_64',
        }),
      ).status,
    ).toBe(201)
    expect(send(path, op({ action: 'activate', version: '1' }, 2)).status).toBe(200)
    return {
      id,
      version: '1',
      variant: 'default',
      platform: 'windows' as const,
      architecture: 'x86_64' as const,
    }
  }
  const transport = {
    async request<T>(o: RequestOptions<T>) {
      const path = o.path.replace(/\{([^}]+)\}/g, (_, k: string) => o.pathParams![k]!),
        query = new URLSearchParams(
          Object.entries(o.query ?? {})
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)]),
        )
      const reply = send(path, o.body, query)
      if (reply.status !== o.successStatus)
        throw Object.assign(new Error('Rejected'), { status: reply.status })
      return o.decode(reply.body)
    },
  } as HttpTransport
  const policies = createPoliciesClient(transport)
  function put(
    scope: string,
    resource: ConfigurationDefinition['action']['resource'],
    exit: 'retain' | 'remove' = 'retain',
    id = randomUUID(),
    revision = 0,
  ) {
    const definition: ConfigurationDefinition = {
      scope,
      action: { kind: 'configuration', resource, exit },
    }
    return policies.change(id, {
      ...op({ action: 'put', enabled: true, definition }, revision),
      input: { action: 'put', enabled: true, definition },
    })
  }
  return { automation, send, op, scope, resource, policies, put, node, transport }
}
it('publishes exact immutable native bindings, previews without admission, and shares one operation for identical owners', async () => {
  const f = fixture(),
    scope = f.scope(),
    binding = f.resource(),
    definition: ConfigurationDefinition = {
      scope,
      action: { kind: 'configuration', resource: binding, exit: 'retain' },
    }
  expect((await f.policies.preview(definition)).items).toContainEqual({
    device: 'device-01',
    eligibility: { state: 'eligible', entry: 1 },
    taskAdmission: null,
  })
  expect(f.automation.configurationPolicies.plans()).toEqual([])
  const a = await f.put(scope, binding),
    b = await f.put(scope, binding)
  expect((await f.policies.list(undefined, 'configuration')).items.map((p) => p.id).sort()).toEqual(
    [a.id, b.id].sort(),
  )
  const da = (await f.policies.devices(a.id)).items[0]!,
    db = (await f.policies.devices(b.id)).items[0]!
  expect(da.operationIds).toHaveLength(1)
  expect(db.operationIds).toEqual(da.operationIds)
  expect(da.diagnoses).toEqual([])
  expect(f.automation.configurationPolicies.plans()).toHaveLength(1)
  expect(f.automation.configurationPolicies.plans()[0]!.effect).toBe('unknown')
})
it('excludes disabled or other-scope claims and never self-conflicts when replacing a Policy', async () => {
  const f = fixture(),
    scope = f.scope(),
    offScope = f.scope([]),
    first = f.resource(),
    opposite = f.resource(true)
  const a = await f.put(scope, first),
    b = await f.put(offScope, opposite)
  expect((await f.policies.devices(a.id)).items[0]!.diagnoses).toEqual([])
  expect(f.automation.configurationPolicies.assigned('device-01', a.id)).toEqual([])
  await f.put(scope, opposite, 'retain', a.id, a.revision)
  expect((await f.policies.devices(a.id)).items[0]!.diagnoses).toEqual([])
  await f.put(scope, first, 'retain', b.id, b.revision)
  expect((await f.policies.devices(a.id)).items[0]!.diagnoses).toContain('configuration_conflict')
  expect((await f.policies.devices(b.id)).items[0]!.diagnoses).toContain('configuration_conflict')
  const bp = f.send(`/api/v1/policies/${b.id}`).body as PolicyRead
  await f.policies.change(b.id, {
    ...f.op({ action: 'disable' }, bp.revision),
    input: { action: 'disable' },
  })
  expect((await f.policies.devices(a.id)).items[0]!.diagnoses).toEqual([])
})
it('feeds effective native claims into the existing configuration catalog preview', async () => {
  const f = fixture(),
    scope = f.scope(),
    a = await f.put(scope, f.resource(false)),
    id = randomUUID(),
    path = `/api/v1/mdm-candidate/policies/configurations/${id}`
  expect(
    f.send(
      path,
      f.op({ action: 'create', name: 'Camera', platform: 'windows', format: 'windows_csp' }),
    ).status,
  ).toBe(200)
  expect(
    f.send(path, f.op({ action: 'version', settings: [{ key: f.node, value: true }] }, 1)).status,
  ).toBe(200)
  expect(f.send(path, f.op({ action: 'publish', version: 1 }, 2)).status).toBe(200)
  const client = createConfigurationsClient(
    f.transport,
    '11111111-1111-4111-8111-111111111111',
    true,
  )
  const preview = await client.preview(id, {
    ...f.op({ version: 1, scope }, 3),
    input: { version: 1, scope },
  })
  await client.previewStatus(id, preview.task)
  expect(
    (await client.previewStatus(id, preview.task)).rows.find((r) => r.device === 'device-01'),
  ).toMatchObject({ reason: 'conflict', support: 'blocked', drift: 'unknown', conflicts: [a.id] })
  await f.policies.change(a.id, {
    ...f.op({ action: 'disable' }, a.revision),
    input: { action: 'disable' },
  })
  const next = await client.preview(id, {
    ...f.op({ version: 1, scope }, 3),
    input: { version: 1, scope },
  })
  expect(
    (await client.previewStatus(id, next.task)).rows.find((r) => r.device === 'device-01')!
      .conflicts,
  ).toEqual([])
})
it.each(['retain', 'remove'] as const)(
  'honors %s when the last shared owner leaves, without claiming physical effects',
  async (exit) => {
    const f = fixture(),
      scope = f.scope(),
      binding = f.resource(),
      a = await f.put(scope, binding, exit),
      b = await f.put(scope, binding, exit)
    await f.policies.change(a.id, {
      ...f.op({ action: 'disable' }, a.revision),
      input: { action: 'disable' },
    })
    expect(f.automation.configurationPolicies.plans()[0]!.action).toBe('apply')
    await f.policies.change(b.id, {
      ...f.op({ action: 'disable' }, b.revision),
      input: { action: 'disable' },
    })
    expect(f.automation.configurationPolicies.plans()[0]).toMatchObject({
      action: exit,
      effect: 'unknown',
    })
    expect(f.automation.configurationPolicies.assigned('device-01')).toEqual([])
  },
)
it('retires claims on actual scope exit and rejects missing variants or remove contracts', async () => {
  const f = fixture(),
    scope = f.scope(),
    binding = f.resource(),
    a = await f.put(scope, binding, 'remove')
  const originalScope = f.send(`/api/v1/scopes/${scope}`).body as { revision: number }
  expect(
    f.send(
      `/api/v1/scopes/${scope}`,
      f.op(
        { action: 'put', definition: { targets: [], limitations: null, exclusions: [] } },
        originalScope.revision,
      ),
    ).status,
  ).toBe(200)
  expect(f.automation.configurationPolicies.plans()[0]!.action).toBe('remove')
  expect(
    (await f.policies.devices(a.id)).items.find((d) => d.device === 'device-01')!.assignment,
  ).toBe('excluded')
  await expect(f.put(scope, { ...binding, variant: 'missing' })).rejects.toMatchObject({
    status: 404,
  })
  await expect(f.put(scope, f.resource(false, false), 'remove')).rejects.toMatchObject({
    status: 404,
  })
})
