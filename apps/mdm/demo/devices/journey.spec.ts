import { encodeAssetQuery } from '../../src/features/devices/clients/asset-query'
import { expect, it } from 'vitest'
import { setup, publishGroupDefinition } from './test-harness'
import { generateEnrollmentPassword } from '../../src/features/devices/clients/enrollment'
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
it('reads current endpoint statistics and permits pending onboarding without claiming registration', async () => {
  const { directory, enrollment } = await setup()
  const first = await directory.statistics()
  await enrollment.create(crypto.randomUUID(), {
    deviceId: 'new-native-platform',
    password: generateEnrollmentPassword(),
    source: 'mdm.windows',
  })
  expect((await directory.statistics()).statistics.total).toBe(first.statistics.total + 1)
  expect((await directory.statistics()).statistics.total).toBe(first.statistics.total + 1)
  expect((await directory.detail('new-native-platform')).channels).toEqual([])
  expect((await enrollment.registrations('new-native-platform')).items).toEqual([])
})
it('freezes searches while manual changes preserve CAS, deleted history and exact replay', async () => {
  const { assets } = await setup()
  const accepted = await assets.search(operation(encodeAssetQuery(null, [], [])))
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
  expect(await directory.detail('new-mac')).toMatchObject({
    status: 'pending',
    inventoryAvailable: false,
  })
  expect((await enrollment.registrations('new-mac')).items).toEqual([])
  await enrollment.cancel(created.enrollmentId, crypto.randomUUID())
  expect((await enrollment.status(created.enrollmentId)).status).toBe('cancelled')
  scenario.reset()
  expect((await scenario.handle('GET', '/api/v1/devices/new-mac')).status).toBe(401)
})
it('previews do not publish membership and metadata edits preserve accepted member calculations', async () => {
  const { groups } = await setup()
  const id = crypto.randomUUID()
  const created = await groups.change(
    id,
    operation({
      action: 'create',
      assetContext: 'endpoint' as const,
      presentation: { name: 'All', description: '' },
      criteria: {
        selector: { kind: 'device' },
        quantifier: 'one',
        criteria: { kind: 'and', children: [] },
      },
    }),
  )
  const published = await publishGroupDefinition(groups, id, created.task!)
  const current = await groups.read(id)
  const preview = await groups.preview(id, operation({}, current.group.revision))
  await groups.status(id, preview.task, 'group_preview')
  await groups.status(id, preview.task, 'group_preview')
  const result = await groups.page(id, preview.task, 'members')
  expect(result.current).toBe(false)
  expect((await groups.read(id)).memberSet).toBe(published)
  const recompute = await groups.change(
    id,
    operation({ action: 'recompute' }, current.group.revision),
  )
  expect(recompute.task).toBeTruthy()
  await groups.change(
    id,
    operation(
      { action: 'edit', presentation: { name: 'Renamed', description: '' } },
      current.group.revision,
    ),
  )
  await groups.status(id, recompute.task!)
  expect((await groups.status(id, recompute.task!)).status).toBe('completed')
  expect((await groups.read(id)).group.presentation.name).toBe('Renamed')
})
it('evaluates associated groups from both endpoint sources and withholds targets until the association is verified', async () => {
  const { associations, directory, assets, groups, domain, enrollment } = await setup()
  const { currentMember } = await import('../../src/features/devices/clients/endpoint-model')
  const mdm = currentMember(await directory.detail('device-05'), 'mdm')!,
    agent = currentMember(await directory.detail('device-01'), 'agent')!
  const association = await associations.confirm({
    operationId: crypto.randomUUID(),
    associationId: null,
    expectedVersion: 0,
    mdm,
    agent,
    evidence: 'Verified same synthetic fixture',
  })
  for (const [device, text] of [
    [mdm.device, 'first'],
    [agent.device, 'second'],
  ]) {
    const inventory = await assets.inventory(device!)
    await assets.assign(
      device!,
      'custom.asset_tag',
      operation(
        { action: 'set', value: { kind: 'string', value: text! } },
        inventory.revisions['custom.asset_tag'] ?? 0,
      ),
    )
  }
  const id = crypto.randomUUID()
  const created = await groups.change(
    id,
    operation({
      action: 'create',
      presentation: { name: 'Associated', description: '' },
      assetContext: 'associated_device',
      criteria: {
        selector: { kind: 'device' },
        quantifier: 'one',
        criteria: {
          kind: 'predicate',
          field: 'custom.asset_tag',
          op: 'eq',
          value: { kind: 'string', value: 'first' },
        },
      },
    }),
  )
  const memberSet = await publishGroupDefinition(groups, id, created.task!)
  const decisions = await groups.page(id, memberSet, 'decisions')
  if (decisions.page.kind !== 'decisions') throw new Error('Wrong projection')
  expect(decisions.page.items.find((d) => d.object.id === association.id)).toMatchObject({
    decision: 'unknown',
    sourceObjects: [{ object: { kind: 'association', id: association.id }, members: [mdm, agent] }],
  })
  const { targetFacts } = await import('../policies/targets')
  await enrollment.revoke(agent.device, agent.registrationId, crypto.randomUUID())
  expect(
    targetFacts(domain, domain.objects().find((o) => o.object.id === association.id)!, 'agent'),
  ).toMatchObject({
    availability: 'unavailable',
    reason: 'association_unverified',
    target: null,
  })
})
