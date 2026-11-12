import { expect, it, vi } from 'vitest'
import {
  createInventory,
  validateCriteria,
  validateField,
  validateQuery,
  validateScalar,
} from './index'
import type {
  FieldDefinition,
  InventoryPort,
  InventoryView,
  ManualChange,
  Operation,
  QueryDefinition,
} from './model'

const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222'
const query = (): QueryDefinition => ({
  filter: 'custom.ready==false',
  fields: ['custom.ready'],
  sort: [{ field: 'custom.count', descending: true }],
  scope: { selector: { kind: 'all_authorized' }, quantifier: 'any' },
})
const field = (): FieldDefinition => ({
  key: 'custom.ready',
  version: 2,
  valueType: { kind: 'boolean' },
  nullable: true,
  manual: true,
  sources: { manual: 0 },
  platforms: ['windows', 'macos'],
  sensitivity: 'standard',
  unit: null,
  searchable: true,
  itemKey: null,
  timeSeries: null,
})
function port(methods: Partial<InventoryPort>): InventoryPort {
  return new Proxy(methods as InventoryPort, {
    get(target, key) {
      if (!(key in target)) throw new Error(`Unexpected port call: ${String(key)}`)
      return Reflect.get(target, key)
    },
  })
}
it('freezes the original query before asynchronous acceptance and binds fixed results to the task', async () => {
  let finish!: (value: { task: string; statusUrl: string }) => void
  const started = vi.fn((_id: string, value: QueryDefinition) => {
      expect(Object.isFrozen(value.fields)).toBe(true)
      return new Promise<{ task: string; statusUrl: string }>((resolve) => {
        finish = resolve
      })
    }),
    original = query(),
    inventory = createInventory(
      port({
        query: started,
        queryItems: async () => ({
          snapshot: other,
          summary: { total: 0, matched: 0, unknown: 0 },
          items: [],
          nextCursor: null,
        }),
      }),
    )
  const pending = inventory.query(id, original)
  Reflect.set(original, 'filter', 'custom.ready==true')
  finish({ task: id, statusUrl: `/api/v1/device-queries/${id}` })
  await pending
  expect(started.mock.calls[0]?.[1].filter).toBe('custom.ready==false')
  await expect(inventory.queryItems(id)).rejects.toThrow('Wrong fixed result')
})
it('keeps unknown writes explicit and preserves zero/false in original manual intent', async () => {
  const assign = vi.fn(
      async (_device: string, _field: string, _change: Operation<ManualChange>) => {
        throw { status: 503, code: 'operation_unknown' }
      },
    ),
    inventory = createInventory(port({ assign }))
  const change = {
    operationId: id,
    expectedRevision: 0,
    input: {
      action: 'set' as const,
      value: {
        kind: 'object' as const,
        value: {
          enabled: { kind: 'boolean' as const, value: false },
          count: { kind: 'integer' as const, value: 0 },
        },
      },
    },
  }
  await expect(inventory.assign('endpoint', 'custom.ready', change)).rejects.toMatchObject({
    code: 'operation_unknown',
  })
  expect(assign).toHaveBeenCalledTimes(1)
  expect(assign).toHaveBeenCalledWith('endpoint', 'custom.ready', change)
  expect(Object.isFrozen(assign.mock.calls[0]?.[2])).toBe(true)
})
it('uses the observed saved revision and never turns a current read into original execution proof', async () => {
  const executeSavedQuery = vi.fn(async () => ({
      task: id,
      statusUrl: `/api/v1/device-queries/${id}`,
    })),
    inventory = createInventory(port({ executeSavedQuery }))
  await inventory.executeSavedQuery(other, { operationId: id, expectedRevision: 7, input: {} })
  expect(executeSavedQuery).toHaveBeenCalledWith(other, {
    operationId: id,
    expectedRevision: 7,
    input: {},
  })
  await expect(
    inventory.executeSavedQuery(other, { operationId: id, expectedRevision: 0, input: {} }),
  ).rejects.toThrow('revision required')
  expect(executeSavedQuery).toHaveBeenCalledTimes(1)
})
it('requires fresh custom-field CAS and rejects wrong write receipts', async () => {
  validateField(field(), 1)
  expect(() => validateField({ ...field(), key: 'device.ready' }, 1)).toThrow()
  expect(() => validateField(field(), 2)).toThrow()
  const inventory = createInventory(
    port({ putField: async () => ({ field: 'custom.other', version: 2, definition: field() }) }),
  )
  await expect(
    inventory.putField('custom.ready', {
      operationId: id,
      expectedRevision: 1,
      input: { action: 'put', definition: field() },
    }),
  ).rejects.toThrow('Wrong field receipt')
})
it('retains concrete namespaces and opaque cursors without evaluating a list locally', async () => {
  const scope = {
      kind: 'native_user' as const,
      owner: { kind: 'macos' as const, uid: 501, generated_uid: other },
    },
    cursor = 'opaque:source/snapshot+window=',
    list = vi.fn(async () => ({
      reference: { kind: 'association' as const, id },
      endpoint: 'endpoint',
      source: null,
      field: 'custom.rows',
      total: 0,
      assetCut: null,
      items: [],
      nextCursor: 'next/opaque',
    })),
    inventory = createInventory(port({ list })),
    signal = new AbortController().signal
  expect(
    (
      await inventory.list(
        {
          reference: { kind: 'association', id },
          endpoint: 'endpoint',
          scope,
          cursor,
          field: 'custom.rows',
        },
        signal,
      )
    ).nextCursor,
  ).toBe('next/opaque')
  expect(list).toHaveBeenCalledWith(
    {
      reference: { kind: 'association', id },
      endpoint: 'endpoint',
      scope,
      cursor,
      field: 'custom.rows',
      limit: 50,
    },
    signal,
  )
  expect(() =>
    inventory.list({
      reference: { kind: 'endpoint', id: 'wrong' },
      endpoint: 'endpoint',
      scope,
      cursor,
      field: 'custom.rows',
    }),
  ).toThrow('Wrong list endpoint')
})
it('admits complex structured conditions without deciding their outcome and enforces scalar bounds', () => {
  validateCriteria({
    kind: 'or',
    children: [
      {
        kind: 'and',
        children: [
          {
            kind: 'predicate',
            field: 'custom.ready',
            op: 'eq',
            value: { kind: 'boolean', value: false },
          },
          {
            kind: 'predicate',
            field: 'custom.count',
            op: 'ge',
            value: { kind: 'integer', value: 0 },
          },
        ],
      },
      { kind: 'predicate', field: 'custom.name', op: 'is_null' },
    ],
  })
  validateQuery(query())
  expect(() =>
    validateQuery({ ...query(), scope: { selector: { kind: 'device' }, quantifier: 'all' } }),
  ).toThrow()
  expect(() => validateQuery({ ...query(), filter: null })).toThrow('Scoped query')
  expect(() => validateScalar({ kind: 'integer', value: Number.MAX_SAFE_INTEGER + 1 })).toThrow()
  expect(() => validateScalar({ kind: 'number', value: Infinity })).toThrow()
})
it('does not reinterpret partial collection quality as a successful complete snapshot', async () => {
  const run = {
    id,
    device: 'endpoint',
    epoch: 'epoch',
    source: 'agent.native' as const,
    dataset: 'dataset',
    templateVersion: 'v1',
    fingerprint: 'fingerprint',
    sequence: 0,
    coverage: { id: 'coverage', version: '1', definition: 'hash', format: 'native' },
    complete: false,
    result: 'partial' as const,
    deliveryPending: true,
    fields: [],
    startedAt: 1,
    finishedAt: 2,
    reason: 'message_budget' as const,
    delivery: { projection: 'pending_receipt' as const, receipt: null },
  }
  const inventory = createInventory(port({ collection: async () => run }))
  expect(await inventory.collection('endpoint', id)).toEqual(run)
})
it('keeps the full server summary and an empty nonterminal page', async () => {
  const page = {
      snapshot: id,
      summary: { total: 200, matched: 75, unknown: 12 },
      items: [] as InventoryView[],
      nextCursor: 'opaque-next',
    },
    inventory = createInventory(port({ queryItems: async () => page }))
  expect(await inventory.queryItems(id, { cursor: 'opaque-current', limit: 2 })).toBe(page)
})
