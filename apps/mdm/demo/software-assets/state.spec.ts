import { expect, it } from 'vitest'
import { fixtureIds, softwareAssetsDemoPath } from './state'
import type { createSoftwareAssetsDemoClient } from './client'
import {
  emptyFilters,
  result,
  type Change,
  type Filters,
  type Mapping,
  type Standard,
} from './model'
import { softwareAssetsHttp as fixture } from './test-support'
const changeStandard = (value: Standard): Change => ({
  kind: 'standard',
  action: 'put',
  id: value.id,
  expectedRevision: value.revision,
  value,
})
const changeMapping = (value: Mapping): Change => ({
  kind: 'mapping',
  action: 'put',
  id: value.id,
  expectedRevision: value.revision,
  value,
})
async function all(
  client: ReturnType<typeof createSoftwareAssetsDemoClient>,
  filters: Filters = emptyFilters(),
) {
  let page = await client.query(filters)
  const rows = [...page.rows]
  while (page.nextCursor) {
    page = await client.page(page.id, page.nextCursor)
    rows.push(...page.rows)
  }
  return { ...page, rows }
}
it('deduplicates versions, plugins, users and sources while preserving complete server buckets and evidence', async () => {
  const { client } = await fixture(),
    first = await client.query(emptyFilters())
  expect(first.rows).toHaveLength(2)
  expect(first.totalRows).toBe(4)
  expect(first.devices).toBe(2)
  const editor = first.rows.find((r) => r.standardId === fixtureIds.editor)!
  expect(editor).toMatchObject({
    deviceCount: 2,
    assessmentCount: 2,
    thresholdState: 'reached',
    compliance: { state: 'known', allowed: 1, denied: 1, unknown: 0 },
  })
  expect(editor.versions).toEqual([
    { value: '1.0', devices: 1 },
    { value: '1.2', devices: 1 },
    { value: '2.0', devices: 2 },
  ])
  const a = await client.details(first.id, editor.id),
    b = await client.details(first.id, editor.id, a.nextCursor!)
  expect(a.devices[0]).toMatchObject({ id: 'demo-asset-a', verdict: 'allowed' })
  expect(a.devices[0]!.evidence.map((e) => e.scope)).toEqual(
    expect.arrayContaining(['device', 'user:501', 'user:502']),
  )
  expect(new Set(a.devices[0]!.evidence.map((e) => e.source)).size).toBe(2)
  expect(b.devices[0]).toMatchObject({ id: 'demo-asset-b', verdict: 'denied' })
  expect(b.nextCursor).toBeNull()
  const remaining = await client.page(first.id, first.nextCursor!)
  expect(remaining.rows).toHaveLength(2)
  expect(remaining.rows.map((r) => r.name)).toEqual(
    expect.arrayContaining([expect.stringContaining('Acme'), expect.stringContaining('Beta')]),
  )
  expect(remaining.rows[0]!.id).not.toBe(remaining.rows[1]!.id)
})
it('combines groups and same-item software/device predicates without changing the fixed threshold assessment', async () => {
  const { client } = await fixture()
  const filtered = await all(client, {
    ...emptyFilters(),
    groups: [fixtureIds.engineering, fixtureIds.overlap],
    groupMode: 'all',
  })
  expect(filtered.rows.find((r) => r.standardId === fixtureIds.editor)).toMatchObject({
    deviceCount: 1,
    assessmentCount: 2,
    thresholdState: 'reached',
  })
  const union = await all(client, {
    ...emptyFilters(),
    groups: [fixtureIds.engineering, fixtureIds.overlap],
  })
  expect(union.rows.find((r) => r.standardId === fixtureIds.editor)?.deviceCount).toBe(2)
  const impossible = await all(client, { ...emptyFilters(), name: 'plugin', version: '2.0' })
  expect(impossible.rows.find((r) => r.standardId === fixtureIds.editor)?.deviceCount).toBe(0)
  const mac = await all(client, {
    ...emptyFilters(),
    platform: 'macos',
    architecture: 'arm64',
    publisher: 'Acme',
    version: '2.0',
  })
  expect(mac.rows.find((r) => r.standardId === fixtureIds.editor)?.deviceCount).toBe(1)
  const pending = await all(client, { ...emptyFilters(), groups: [fixtureIds.pending] })
  expect(pending.devices).toBeNull()
  expect(pending.rows[0]!.deviceCount).toBeNull()
})
it('changes risk, tags, thresholds and allowed groups with stable identity, CAS and invalidates old query pages', async () => {
  const { client } = await fixture(),
    before = await client.query(emptyFilters()),
    s = (await client.read()).standards[0]!
  const value: Standard = {
    ...s,
    name: 'Acme Workspace',
    risk: 'low',
    marks: ['approved'],
    threshold: 3,
    allowedGroups: [fixtureIds.pending],
  }
  const op = crypto.randomUUID(),
    receipt = await client.change(op, changeStandard(value))
  expect(await client.receipt(op)).toEqual(receipt)
  expect(await client.change(op, changeStandard(value))).toEqual(receipt)
  expect((await client.read()).standards.find((s) => s.id === value.id)).toMatchObject({
    id: s.id,
    revision: 2,
    name: 'Acme Workspace',
    risk: 'low',
  })
  await expect(client.page(before.id, before.nextCursor!)).rejects.toMatchObject({ status: 409 })
  await expect(client.change(crypto.randomUUID(), changeStandard(value))).rejects.toMatchObject({
    status: 409,
  })
  const after = await all(client, { ...emptyFilters(), risk: 'low', mark: 'approved' })
  expect(after.rows).toHaveLength(1)
  expect(after.rows[0]).toMatchObject({
    deviceCount: 2,
    thresholdState: 'below',
    compliance: { state: 'unknown', denied: 0, unknown: 2 },
  })
  expect(
    (await all(client, { ...emptyFilters(), risk: 'unclassified' })).rows.some(
      (r) => r.standardId === fixtureIds.utilities,
    ),
  ).toBe(true)
})
it('distinguishes failed retained, partial, source conflict and authoritative complete-empty inventories', async () => {
  const { client } = await fixture()
  await client.collection('failed')
  const failed = await all(client)
  expect(failed.coverage.retained).toBe(1)
  expect(failed.rows[0]!.deviceCount).toBe(2)
  const first = await client.details(failed.id, fixtureIds.editor),
    retained = await client.details(failed.id, fixtureIds.editor, first.nextCursor!)
  expect(
    retained.devices[0]!.evidence.every((e) => e.retained && e.observedAt.startsWith('2026-10-25')),
  ).toBe(true)
  for (const mode of ['partial', 'conflict'] as const) {
    await client.collection(mode)
    const q = await all(client)
    expect(q.coverage[mode === 'partial' ? 'unknown' : 'conflict']).toBe(1)
    expect(q.rows.find((r) => r.standardId === fixtureIds.editor)).toMatchObject({
      deviceCount: 1,
      thresholdState: 'unknown',
    })
    expect(q.rows.find((r) => r.standardId === fixtureIds.utilities)?.deviceCount).toBeNull()
  }
  await client.collection('empty')
  const empty = await all(client)
  expect(empty.devices).toBe(0)
  expect(empty.coverage.empty).toBe(3)
  expect(empty.rows.find((r) => r.standardId === fixtureIds.editor)).toMatchObject({
    deviceCount: 0,
    thresholdState: 'below',
  })
})
it('surfaces mapping conflicts, protects disabled references, and rejects tombstone identity reuse', async () => {
  const { client } = await fixture(),
    snapshot = await client.read(),
    original = snapshot.mappings.find((m) => m.identity === 'acme.editor.plugin')!
  const m: Mapping = {
    ...original,
    id: crypto.randomUUID(),
    revision: 0,
    standardId: fixtureIds.utilities,
  }
  await client.change(crypto.randomUUID(), changeMapping(m))
  const conflict = (await all(client)).rows.find((r) => r.resolution === 'conflict')!
  expect(conflict.deviceCount).toBe(1)
  const query = await all(client),
    detail = await client.details(query.id, query.rows.find((r) => r.resolution === 'conflict')!.id)
  expect(detail.devices[0]!.evidence[0]!.standardIds).toEqual(
    expect.arrayContaining([fixtureIds.editor, fixtureIds.utilities]),
  )
  await client.change(crypto.randomUUID(), changeMapping({ ...m, revision: 1, enabled: false }))
  expect((await all(client)).rows.some((r) => r.resolution === 'conflict')).toBe(false)
  await expect(
    client.change(crypto.randomUUID(), {
      kind: 'standard',
      action: 'delete',
      id: fixtureIds.utilities,
      expectedRevision: 1,
      value: null,
    }),
  ).rejects.toMatchObject({ status: 409 })
  await client.change(crypto.randomUUID(), {
    kind: 'mapping',
    action: 'delete',
    id: m.id,
    expectedRevision: 2,
    value: null,
  })
  await client.change(crypto.randomUUID(), {
    kind: 'standard',
    action: 'delete',
    id: fixtureIds.utilities,
    expectedRevision: 1,
    value: null,
  })
  await expect(
    client.change(crypto.randomUUID(), changeStandard({ ...snapshot.standards[1]!, revision: 0 })),
  ).rejects.toMatchObject({ status: 409 })
  await expect(client.change(crypto.randomUUID(), changeMapping(m))).rejects.toMatchObject({
    status: 409,
  })
  await client.change(crypto.randomUUID(), {
    kind: 'standard',
    action: 'archive',
    id: fixtureIds.editor,
    expectedRevision: 1,
    value: null,
  })
  expect((await all(client)).rows.some((row) => row.standardId === fixtureIds.editor)).toBe(false)
  const archived = (await client.read()).standards.find((s) => s.id === fixtureIds.editor)!
  await client.change(crypto.randomUUID(), changeStandard({ ...archived, archived: false }))
  expect(
    (await all(client)).rows.find((row) => row.standardId === fixtureIds.editor)?.deviceCount,
  ).toBe(2)
})
it('uses original actor receipts after a lost committed response and refuses forbidden and real-source fallback', async () => {
  const { client, scenario, login, http } = await fixture(),
    s = (await client.read()).standards[0]!,
    op = crypto.randomUUID(),
    change = changeStandard({ ...s, risk: null, threshold: null, allowedGroups: null })
  scenario.set('unknown')
  await expect(client.change(op, change)).rejects.toMatchObject({
    status: 503,
    code: 'operation_unknown',
  })
  scenario.set('normal')
  const original = await client.receipt(op)
  expect(await client.change(op, change)).toEqual(original)
  expect((await all(client)).rows[0]).toMatchObject({
    risk: null,
    thresholdState: 'disabled',
    compliance: { state: 'disabled' },
  })
  await login('reviewer')
  await expect(client.receipt(op)).rejects.toMatchObject({ status: 404 })
  scenario.set('forbidden')
  await expect(client.read()).rejects.toMatchObject({ status: 403 })
  scenario.set('denied')
  await expect(client.read()).rejects.toMatchObject({ status: 403 })
  scenario.set('normal')
  expect(
    (
      await http('POST', '/api/v1/mdm-candidate/workspace/scenario', {
        scenario: 'normal',
        module: 'software',
        source: 'real',
      })
    ).status,
  ).toBe(204)
  expect((await http('GET', softwareAssetsDemoPath)).status).toBe(503)
  expect(() => result({ id: op, unexpected: true })).toThrow()
})
