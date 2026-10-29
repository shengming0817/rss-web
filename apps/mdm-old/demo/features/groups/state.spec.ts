import { expect, it } from 'vitest'
import { createDemoGroupsClient } from './client'
import { categories, draft, fresh } from './model'
import { setupGroups } from './test-support'
import { TENANT } from '../../scenario'
it('keeps all four Mock directories separate and binds continuations to the applied query', async () => {
  const f = await setupGroups()
  for (const category of categories) {
    const p = await f.client.list({ filter: `groupType=='${category}'` })
    expect(p.items).toHaveLength(1)
    expect(p.items[0]?.groupType).toBe(category)
  }
  const first = await f.client.list({ limit: 1, sort: ['name'] })
  expect(first.nextCursor).not.toBeNull()
  const second = await f.client.list({ limit: 1, sort: ['name'], cursor: first.nextCursor! })
  expect(second.items[0]?.id).not.toBe(first.items[0]?.id)
  await expect(
    f.client.list({ limit: 1, filter: "groupType=='user-static'", cursor: first.nextCursor! }),
  ).rejects.toMatchObject({ status: 409 })
  expect(f.requests.every((r) => r.path.startsWith('/api/v1/mdm-candidate/groups'))).toBe(true)
})
it('preserves typed false/zero and Unknown under negation, previews without publishing and retains original receipts', async () => {
  const f = await setupGroups(),
    id = crypto.randomUUID(),
    value = fresh('user-dynamic')
  value.name = 'False and zero'
  value.rule = {
    mode: 'all',
    rules: [
      { mode: 'match', attribute: 'licensed', operator: 'eq', operand: false },
      { mode: 'match', attribute: 'allocation', operator: 'eq', operand: 0 },
    ],
  }
  const body = { operationId: crypto.randomUUID(), expectedRevision: 0, input: value },
    receipt = await f.client.save(id, body)
  expect((await f.client.read(id)).memberCount).toBeNull()
  await f.settle(receipt.taskId)
  const group = await f.client.read(id)
  expect(group.memberCount).toBe(1)
  expect(group.unknownCount).toBe(1)
  expect(await f.client.save(id, body)).toEqual(receipt)
  const preview = await f.client.calculate(id, true, {
      operationId: crypto.randomUUID(),
      expectedRevision: 1,
      input: {},
    }),
    task = await f.settle(preview.taskId)
  expect((await f.client.results(id, task.resultId!, 'decisions')).preview).toBe(true)
  expect((await f.client.read(id)).resultId).toBe(group.resultId)
  const changed = {
    ...value,
    rule: { mode: 'match' as const, attribute: 'licensed', operator: 'ne' as const, operand: true },
  }
  await expect(f.client.save(id, { ...body, input: changed })).rejects.toMatchObject({
    status: 409,
  })
  const edit = await f.client.save(id, {
    operationId: crypto.randomUUID(),
    expectedRevision: 1,
    input: changed,
  })
  await f.settle(edit.taskId)
  const rows = await f.client.results(id, (await f.client.read(id)).resultId!, 'decisions')
  expect(rows.items.map((r) => r.outcome)).toEqual(['match', 'no_match', 'unknown'])
  await expect(
    f.client.save(id, { operationId: crypto.randomUUID(), expectedRevision: 1, input: changed }),
  ).rejects.toMatchObject({ status: 409 })
  expect(() =>
    draft({
      ...value,
      rule: { mode: 'match', attribute: 'licensed', operator: 'eq', operand: 'false' },
    }),
  ).toThrow()
  expect(() =>
    draft({
      ...value,
      rule: { mode: 'match', attribute: 'allocation', operator: 'eq', operand: Number.NaN },
    }),
  ).toThrow()
})
it('generates two explicit device relationships and refreshes their membership from a changed user scope', async () => {
  const f = await setupGroups(),
    source = (await f.client.list({ filter: "groupType=='user-dynamic'" })).items[0]!
  const generated = []
  for (const relation of ['registration_user', 'current_user'] as const) {
    const receipt = await f.client.generate(source.id, {
      operationId: crypto.randomUUID(),
      expectedRevision: source.revision,
      input: { id: crypto.randomUUID(), name: relation, description: 'Mock only', relation },
    })
    await f.settle(receipt.taskId)
    generated.push(await f.client.read(receipt.groupId))
  }
  expect(
    (await f.client.results(generated[0]!.id, generated[0]!.resultId!, 'members')).items[0]?.label,
  ).toBe('Mock Windows A')
  expect(
    (await f.client.results(generated[1]!.id, generated[1]!.resultId!, 'members')).items[0]?.label,
  ).toBe('Mock Mac B')
  expect(generated[1]?.unknownCount).toBe(1)
  await expect(
    f.client.save(source.id, {
      operationId: crypto.randomUUID(),
      expectedRevision: 1,
      input: null,
    }),
  ).rejects.toMatchObject({ status: 409 })
  const edited = {
    name: source.name,
    description: source.description,
    groupType: source.groupType,
    enabled: true,
    assignments: [],
    rule: {
      mode: 'match' as const,
      attribute: 'department',
      operator: 'eq' as const,
      operand: 'Support',
    },
  }
  const receipt = await f.client.save(source.id, {
    operationId: crypto.randomUUID(),
    expectedRevision: 1,
    input: edited,
  })
  expect((await f.client.read(generated[0]!.id)).freshness).toBe('pending')
  await f.settle(receipt.taskId)
  const next = await f.client.read(generated[0]!.id),
    result = await f.client.results(next.id, next.resultId!, 'changes')
  expect(result.items.some((r) => r.before === 'match' && r.outcome === 'no_match')).toBe(true)
  expect((await f.client.results(next.id, next.resultId!, 'members')).items[0]?.label).toBe(
    'Mock Mac B',
  )
})
it('recovers a lost committed reply only by exact original replay and rejects real/foreign envelopes', async () => {
  const f = await setupGroups(),
    id = crypto.randomUUID(),
    value = { ...fresh('user-static'), name: 'Original request' },
    body = { operationId: crypto.randomUUID(), expectedRevision: 0, input: value }
  await f.control('unknown')
  await expect(f.client.save(id, body)).rejects.toMatchObject({ code: 'operation_unknown' })
  await f.control('normal')
  expect((await f.client.read(id)).revision).toBe(1)
  expect((await f.client.save(id, body)).revision).toBe(1)
  const transport = {
    request: async (o: { decode: (v: unknown) => unknown }) =>
      o.decode({
        contract: 'groups-interaction-demo',
        source: 'real',
        tenantId: TENANT,
        items: [],
        nextCursor: null,
      }),
  }
  await expect(createDemoGroupsClient(transport as never, TENANT).list()).rejects.toThrow()
  await expect(createDemoGroupsClient(f.transport, crypto.randomUUID()).list()).rejects.toThrow()
})

it.each(categories)(
  'creates, edits and deletes %s through its own Mock contract',
  async (groupType) => {
    const f = await setupGroups(),
      id = crypto.randomUUID(),
      value = fresh(groupType)
    value.name = `Create ${groupType}`
    if (groupType.endsWith('static')) {
      const c = await f.client.catalog()
      value.assignments = [(groupType.startsWith('user') ? c.people : c.devices)[0]!.id]
    }
    let receipt = await f.client.save(id, {
      operationId: crypto.randomUUID(),
      expectedRevision: 0,
      input: value,
    })
    await f.settle(receipt.taskId)
    expect((await f.client.read(id)).groupType).toBe(groupType)
    value.name = `Edited ${groupType}`
    receipt = await f.client.save(id, {
      operationId: crypto.randomUUID(),
      expectedRevision: 1,
      input: value,
    })
    await f.settle(receipt.taskId)
    expect((await f.client.read(id)).name).toBe(value.name)
    await f.client.save(id, { operationId: crypto.randomUUID(), expectedRevision: 2, input: null })
    await expect(f.client.read(id)).rejects.toMatchObject({ status: 404 })
    await expect(
      f.client.save(id, { operationId: crypto.randomUUID(), expectedRevision: 0, input: value }),
    ).rejects.toMatchObject({ status: 409 })
  },
)
