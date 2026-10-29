import { expect, it } from 'vitest'
import { setup } from './test-harness'
import { currentMember } from '../../src/features/devices/clients/endpoint-model'
import { decodeView } from '../../src/features/devices/clients/device-views'
async function confirmation() {
  const h = await setup(),
    mdm = currentMember(await h.directory.detail('device-01'), 'mdm')!,
    agent = (await h.associations.candidates('device-01', 'mdm')).items[0]!
  return {
    ...h,
    body: {
      operationId: crypto.randomUUID(),
      associationId: null,
      expectedVersion: 0,
      mdm,
      agent,
      evidence: 'verified possession',
    },
  }
}
it('deduplicates only server-confirmed views and revokes without changing registrations', async () => {
  const h = await confirmation(),
    before = await h.views.statistics(),
    registrations = await h.enrollment.registrations(h.body.agent.device),
    a = await h.associations.confirm(h.body)
  const page = await h.views.statistics()
  expect(page.statistics.endpointCount).toBe(before.statistics.endpointCount)
  expect(page.statistics.deviceViewCount).toBe(before.statistics.deviceViewCount - 1)
  const view = await h.views.detail({ kind: 'association', id: a.id })
  expect(view.endpoints.map((e) => e.id).sort()).toEqual(a.members.map((m) => m.device).sort())
  await h.associations.revoke(a.id, {
    operationId: crypto.randomUUID(),
    expectedVersion: a.version,
    reason: 'separate instances',
  })
  expect((await h.views.statistics()).statistics).toEqual(before.statistics)
  expect(await h.enrollment.registrations(h.body.agent.device)).toEqual(registrations)
})
it('replays immutable receipts and rejects reused operation identity with changed evidence', async () => {
  const h = await confirmation(),
    a = await h.associations.confirm(h.body)
  await h.associations.revoke(a.id, {
    operationId: crypto.randomUUID(),
    expectedVersion: a.version,
    reason: 'separate',
  })
  expect(await h.associations.confirm(h.body)).toEqual(a)
  await expect(h.associations.confirm({ ...h.body, evidence: 'changed' })).rejects.toMatchObject({
    status: 409,
  })
})
it('invalidates directory and list cursors on association membership changes', async () => {
  const h = await confirmation(),
    page = await h.views.list(),
    ref = { kind: 'endpoint' as const, id: h.body.mdm.device },
    view = await h.views.detail(ref),
    source = view.lists['device.software']!.sources[0]!
  await h.associations.confirm(h.body)
  await expect(h.views.list({ cursor: page.nextCursor! })).rejects.toMatchObject({
    status: 409,
    body: { code: 'device_view_cursor_invalidated' },
  })
  await expect(h.views.items(ref, 'device.software', source)).rejects.toMatchObject({ status: 409 })
})
it('keeps occupied membership pending after credential revocation and rejects stale confirmation', async () => {
  const h = await confirmation(),
    a = await h.associations.confirm(h.body)
  await h.enrollment.revoke(h.body.agent.device, h.body.agent.registrationId, crypto.randomUUID())
  expect((await h.associations.get(a.id)).state).toBe('needs_verification')
  expect((await h.views.detail({ kind: 'association', id: a.id })).association?.state).toBe(
    'needs_verification',
  )
  await expect(
    h.associations.confirm({
      ...h.body,
      operationId: crypto.randomUUID(),
      associationId: a.id,
      expectedVersion: a.version,
    }),
  ).rejects.toMatchObject({ status: 409 })
})
it('preserves both Manual sources and validates every source against view membership', async () => {
  const h = await confirmation(),
    a = await h.associations.confirm(h.body),
    ref = { kind: 'association' as const, id: a.id },
    v = await h.views.detail(ref)
  expect(v.fields['custom.is_loaner']!.sources).toHaveLength(2)
  const wire = structuredClone(v)
  wire.fields['custom.is_loaner']!.sources[0]!.endpoint = 'hidden-other'
  expect(() => decodeView(wire, ref)).toThrow('Source outside view')
})
it('does not accept a list receipt from a different endpoint or evidence snapshot', async () => {
  const h = await confirmation(),
    ref = { kind: 'endpoint' as const, id: h.body.mdm.device },
    v = await h.views.detail(ref),
    source = v.lists['device.software']!.sources[0]!
  expect((await h.views.items(ref, 'device.software', source)).items[0]?.kind).toBe('object')
  await expect(
    h.views.items(ref, 'device.software', { ...source, endpoint: 'other' }),
  ).rejects.toThrow('Wrong list source')
  await expect(
    h.views.items(ref, 'device.software', {
      ...source,
      evidence: { ...source.evidence, snapshotId: 'changed' },
    }),
  ).rejects.toThrow('Wrong list source')
})
it('projects a singly authorized endpoint without revealing its hidden counterpart or relation', async () => {
  const h = await confirmation(),
    a = await h.associations.confirm(h.body)
  h.domain.bindAuthorization((_actor, _permission, id) => id === h.body.mdm.device)
  const page = await h.views.list()
  expect((await h.views.statistics()).statistics).toEqual({ endpointCount: 1, deviceViewCount: 1 })
  expect(page.items[0]?.association).toBeNull()
  expect(JSON.stringify(page)).not.toContain(a.id)
  expect(JSON.stringify(page)).not.toContain(h.body.agent.device)
  await expect(h.associations.get(a.id)).rejects.toMatchObject({ status: 404 })
  expect((await h.associations.candidates(h.body.mdm.device, 'mdm')).items).toEqual([])
  await expect(
    h.associations.confirm({ ...h.body, operationId: crypto.randomUUID() }),
  ).rejects.toMatchObject({ status: 403 })
})

it('preserves signed source cursors up to the formal 16 KiB limit without treating them as resource IDs', async () => {
  const h = await confirmation(),
    ref = { kind: 'endpoint' as const, id: h.body.mdm.device },
    wire = await h.views.detail(ref)
  const token = 'opaque_'.repeat(2200)
  wire.lists['device.software']!.sources[0]!.cursor = token
  expect(decodeView(wire, ref).lists['device.software']!.sources[0]!.cursor).toBe(token)
  wire.lists['device.software']!.sources[0]!.cursor = 'x'.repeat(16385)
  expect(() => decodeView(wire, ref)).toThrow('Invalid cursor')
})
