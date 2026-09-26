import { expect, it } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createScenario, TENANT } from '../scenario'
import { createDeviceDemo } from './state'
import { createAssetsClient } from '../../src/features/devices/clients/assets'
import { createDirectoryClient } from '../../src/features/devices/clients/directory'
import { createGroupsClient } from '../../src/features/devices/clients/groups'
import {
  createEnrollmentClient,
  generateEnrollmentPassword,
} from '../../src/features/devices/clients/enrollment'
async function setup() {
  const domain = createDeviceDemo(),
    scenario = createScenario([domain.handle], domain.reset)
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
      const reply = await scenario.handle(o.method, `${path}?${query}`, o.body, {
        ...headers,
        ...Object.fromEntries(
          Object.entries(o.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
        ),
      })
      if (reply.status !== o.successStatus)
        throw Object.assign(new Error('Request rejected'), {
          status: reply.status,
          body: reply.body,
        })
      return o.decode(reply.body)
    },
  } as unknown as HttpTransport
  return {
    scenario,
    headers,
    assets: createAssetsClient(transport, TENANT),
    directory: createDirectoryClient(transport, TENANT, true),
    groups: createGroupsClient(transport),
    enrollment: createEnrollmentClient(transport),
  }
}
const operation = <T>(input: T, expectedRevision = 0) => ({
  operationId: crypto.randomUUID(),
  expectedRevision,
  input,
})
it('replays a committed unknown write exactly and rejects changed content under the same operation', async () => {
  const { assets, scenario } = await setup()
  const body = operation(
    { action: 'set' as const, value: { kind: 'boolean' as const, value: true } },
    1,
  )
  scenario.set('unknown')
  await expect(assets.assign('device-01', 'custom.is_loaner', body)).rejects.toMatchObject({
    status: 503,
  })
  expect((await assets.inventory('device-01')).revisions['custom.is_loaner']).toBe(2)
  scenario.set('normal')
  expect((await assets.assign('device-01', 'custom.is_loaner', body)).revision).toBe(2)
  await expect(
    assets.assign('device-01', 'custom.is_loaner', { ...body, input: { action: 'delete' } }),
  ).rejects.toMatchObject({ status: 409 })
})
it('freezes directory statistics and permits pending onboarding without claiming registration', async () => {
  const { directory, enrollment } = await setup()
  const first = await directory.list()
  await enrollment.create(crypto.randomUUID(), {
    deviceId: 'new-unknown-platform',
    password: generateEnrollmentPassword(),
    source: 'agent.builtin',
  })
  expect((await directory.list(first.nextCursor!)).statistics.total).toBe(first.statistics.total)
  expect((await directory.list()).statistics.total).toBe(first.statistics.total + 1)
  expect((await directory.detail('new-unknown-platform')).device.platform).toBe('unknown')
  const preview = await directory.preview(
    operation({ action: 'onboard', devices: ['new-unknown-platform'] }),
  )
  expect(preview.targets[0]?.registration).toBeNull()
  const accepted = await directory.execute(
    preview.id,
    operation({ confirmed: true }, preview.revision),
  )
  expect(accepted.targets[0]).toMatchObject({
    dispatch: 'accepted',
    receipt: 'pending',
    effect: 'unknown',
  })
  expect((await enrollment.registrations('new-unknown-platform')).items).toEqual([])
})
it('freezes searches while manual changes preserve CAS, deleted history and exact replay', async () => {
  const { assets } = await setup()
  const accepted = await assets.search(operation({ criteria: null, select: [], sort: null }))
  expect((await assets.status(accepted.task)).status).toBe('running')
  await expect(assets.items(accepted.task)).rejects.toMatchObject({ status: 409 })
  expect((await assets.status(accepted.task)).status).toBe('completed')
  const body = operation({ action: 'delete' as const }, 1)
  const receipt = await assets.assign('device-01', 'custom.is_loaner', body)
  expect(await assets.assign('device-01', 'custom.is_loaner', body)).toEqual(receipt)
  await expect(
    assets.assign('device-01', 'custom.is_loaner', operation({ action: 'null' }, 1)),
  ).rejects.toMatchObject({ status: 409 })
  const detail = await assets.inventory('device-01')
  expect(detail.fields['custom.is_loaner']?.state.kind).toBe('deleted')
  expect(detail.fields['custom.is_loaner']?.sources[0]?.lastKnown?.value).toEqual({
    kind: 'boolean',
    value: false,
  })
  const first = await assets.items(accepted.task)
  expect(first.items[0]?.fields['custom.is_loaner']?.state.kind).toBe('known')
  const second = await assets.items(accepted.task, first.nextCursor!)
  expect(second.items).toHaveLength(3)
  expect(second.nextCursor).toBeNull()
})
it('keeps pending enrollment discoverable, cancellation readable, and reset removes changes', async () => {
  const { enrollment, directory, scenario } = await setup()
  const created = await enrollment.create(crypto.randomUUID(), {
    deviceId: 'new-mac',
    password: generateEnrollmentPassword(),
    source: 'mdm.apple',
  })
  expect(created.registrationId).toBeNull()
  expect((await directory.detail('new-mac')).device).toMatchObject({
    status: 'pending',
    inventoryAvailable: false,
  })
  expect((await enrollment.registrations('new-mac')).items).toEqual([])
  await enrollment.cancel(created.enrollmentId, crypto.randomUUID())
  expect((await enrollment.status(created.enrollmentId)).status).toBe('cancelled')
  scenario.reset()
  expect((await scenario.handle('GET', '/api/mdm-candidate/v1/devices/new-mac')).status).toBe(401)
})
it('previews do not publish membership and stale tasks do not overwrite a newer definition', async () => {
  const { groups } = await setup()
  const id = crypto.randomUUID()
  await groups.change(
    id,
    operation({
      action: 'create',
      name: 'All',
      description: '',
      criteria: { kind: 'and', children: [] },
    }),
  )
  const current = await groups.read(id)
  const preview = await groups.preview(id, operation({}, current.group.revision))
  await groups.status(id, preview.task)
  await groups.status(id, preview.task)
  const result = await groups.page(id, preview.task, 'members')
  expect(result.current).toBe(false)
  expect((await groups.read(id)).group.memberCount).toBe(0)
  const recompute = await groups.change(
    id,
    operation({ action: 'recompute' }, current.group.revision),
  )
  expect(recompute.task).toBeTruthy()
  await groups.change(
    id,
    operation({ action: 'edit', name: 'Renamed', description: '' }, current.group.revision),
  )
  await groups.status(id, recompute.task!)
  expect((await groups.status(id, recompute.task!)).status).toBe('superseded')
  expect((await groups.read(id)).group.name).toBe('Renamed')
})
it('rechecks frozen registration at execution and exposes partial blocks without effects', async () => {
  const { directory, enrollment, scenario } = await setup()
  const preview = await directory.preview(operation({ action: 'wipe', devices: ['device-01'] }))
  const registration = (await enrollment.registrations('device-01')).items.find(
    (r) => r.registrationId === preview.targets[0]?.registration,
  )!
  await enrollment.revoke('device-01', registration.registrationId, crypto.randomUUID())
  const execution = await directory.execute(
    preview.id,
    operation({ confirmed: true }, preview.revision),
  )
  expect(execution.targets[0]).toMatchObject({
    blocked: 'stale_generation',
    dispatch: 'blocked',
    effect: 'unknown',
    execution: null,
  })
  scenario.set('partial')
  const partial = await directory.preview(
    operation({
      action: 'retire',
      devices: ['device-02', 'device-04', 'device-05', 'device-06', 'device-07'],
    }),
  )
  expect(partial.targets.map((t) => t.blocked)).toEqual([
    'offline',
    'stale_generation',
    'permission_denied',
    'unsupported',
    null,
  ])
})
