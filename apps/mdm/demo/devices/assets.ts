import type { DomainHandler } from '../scenario'
import { closed, enumeration, identifier, nullable, record, uuid } from '../../src/services/decode'
import {
  collectionScope,
  query as decodeQuery,
  scalar,
  type Inventory,
  type Query,
  type SavedQuery,
} from '../../src/features/devices/clients/asset-model'
import {
  decodeFieldLayout,
  type FieldDisplayGroup,
} from '../../src/features/devices/clients/assets'
import { catalog, fact, type DemoDevice } from './fixtures'
import { asset } from './http'
import { TENANT } from '../scenario'
import { createPages, createReceipts, error, operation } from '../http'
import { evaluateCondition } from './criteria'
interface Search {
  reads: number
  devices: Inventory[]
  summary: { matched: number; unknown: number; total: number }
}
export function createAssetDemo(devices: () => Map<string, DemoDevice>) {
  let layout = { revision: 0, editable: true, groups: [] as FieldDisplayGroup[] }
  const searches = new Map<string, Search>()
  const saved = new Map<string, SavedQuery>()
  const pages = createPages()
  const receipts = createReceipts()
  function search(task: string, input: Query, empty: boolean) {
    const all = empty
      ? []
      : [...devices().values()].filter((d) => d.summary.inventoryAvailable).map((d) => d.inventory)
    const evaluations = all.map((device) => ({
      device,
      ...evaluateCondition(input.criteria, [
        device,
        ...(devices().get(device.device)?.scopedInventory ?? []),
      ]),
    }))
    const selected = evaluations
      .filter((v) => v.decision === 'match')
      .map((v) => structuredClone(v.device))
    if (input.sort) {
      const sort = input.sort
      selected.sort((a, b) => {
        const av = a.fields[sort.field]?.state,
          bv = b.fields[sort.field]?.state
        if (av?.kind !== 'known') return bv?.kind === 'known' ? 1 : a.device.localeCompare(b.device)
        if (bv?.kind !== 'known') return -1
        const order = av.value.value < bv.value.value ? -1 : av.value.value > bv.value.value ? 1 : 0
        return (sort.descending ? -order : order) || a.device.localeCompare(b.device)
      })
    }
    // Facets use the full frozen records; projection is applied when reading items.
    searches.set(task, {
      reads: 0,
      devices: selected,
      summary: {
        matched: selected.length,
        unknown: evaluations.filter((v) => v.decision === 'unknown').length,
        total: all.length,
      },
    })
    selections.set(task, input.select)
    return asset({ kind: 'accepted', task, statusUrl: `/api/v1/device-queries/${task}` }, 202)
  }
  const selections = new Map<string, string[]>()
  const handle: DomainHandler = (request, scenario) => {
    const { method, path, query } = request
    if (path === '/api/v1/asset-field-layout') {
      if (method === 'GET') return asset({ kind: 'field_layout', ...layout })
      if (method === 'PUT') {
        const op = operation(request.body)
        return receipts.write(request, op.operationId, () => {
          if (op.expectedRevision !== layout.revision) return error('operation_conflict', 409)
          const input = closed(op.input, ['groups'])
          const next = decodeFieldLayout(
            asset({ kind: 'field_layout', ...layout, groups: input['groups'] }).body,
            TENANT,
          )
          layout = { ...next, revision: layout.revision + 1 }
          return asset({ kind: 'field_layout_written', revision: layout.revision })
        })
      }
    }
    if (path === '/api/v1/asset-fields' && method === 'GET')
      return asset({
        kind: 'fields',
        dictionary: 'assets-v1',
        fields: catalog.map((f) => ({
          key: f.key,
          timeSeries: f.timeSeries,
          version: 1,
          valueType:
            f.kind === 'string'
              ? { kind: 'string', maxLength: 256, allowEmpty: false }
              : { kind: f.kind },
          nullable: f.nullable,
          manual: f.manual,
          sources: Object.fromEntries(f.sources.map((s) => [s, 0])),
          platforms: ['windows', 'macos'],
          sensitivity: 'standard',
          unit: null,
          searchable: true,
          itemKey: null,
          operations: f.operations,
        })),
      })
    const directory = /^\/api\/v1\/devices\/([^/]+)\/inventory-scopes$/.exec(path)
    if (directory && method === 'GET') {
      const device = devices().get(decodeURIComponent(directory[1]!))
      if (!device) return error('inventory_not_found', 404)
      const items = [
        ...new Map(
          (device.scopedInventory ?? [])
            .filter((x) => x.collectionScope.kind !== 'device')
            .map((x) => [JSON.stringify(x.collectionScope), { scope: x.collectionScope }]),
        ).values(),
      ]
      const page = pages.page(path, items, query)
      return asset({
        kind: 'inventory_scopes',
        device: device.summary.id,
        watermark: 1,
        items: page.items,
        nextCursor: page.nextCursor,
      })
    }
    const detail = /^\/api\/v1\/devices\/([^/]+)\/inventory$/.exec(path)
    if (detail && method === 'GET') {
      const device = devices().get(decodeURIComponent(detail[1]!))
      const scope = collectionScope(
        query.has('scope') ? JSON.parse(query.get('scope')!) : { kind: 'device' },
      )
      const value =
        scope.kind === 'device'
          ? device?.inventory
          : device?.scopedInventory?.find(
              (x) => JSON.stringify(collectionScope(x.collectionScope)) === JSON.stringify(scope),
            )
      return device?.summary.inventoryAvailable && value
        ? asset({ kind: 'detail', device: value })
        : error('inventory_not_found', 404)
    }
    const manual = /^\/api\/v1\/devices\/([^/]+)\/manual-fields\/([^/]+)$/.exec(path)
    if (manual && method === 'PUT') {
      const op = operation(request.body),
        id = decodeURIComponent(manual[1]!),
        field = decodeURIComponent(manual[2]!)
      return receipts.write(request, op.operationId, () => {
        const device = devices().get(id),
          definition = catalog.find((f) => f.key === field)
        if (!device?.summary.inventoryAvailable) return error('inventory_not_found', 404)
        if (!definition?.manual) return error('malformed_request', 400)
        if ((device.inventory.revisions[field] ?? 0) !== op.expectedRevision)
          return error('operation_conflict')
        const input = record(op.input),
          action = enumeration(input['action'], ['set', 'null', 'delete'] as const)
        closed(input, action === 'set' ? ['action', 'value'] : ['action'])
        const previous = device.inventory.fields[field]
        if (action === 'set') {
          const value = scalar(input['value'])
          if (value.kind !== definition.kind) return error('malformed_request', 400)
          device.inventory.fields[field] = fact(field, value)
        } else {
          const evidence = {
            scope: { kind: 'device' as const },
            source: 'manual' as const,
            registration: null,
            registrationGeneration: null,
            dataset: null,
            epoch: null,
            snapshotId: op.operationId,
            observedAt: Math.floor(Date.now() / 1000),
            receivedAt: Math.floor(Date.now() / 1000),
            actor: 'demo-operator',
          }
          const state = { kind: action === 'null' ? ('null' as const) : ('deleted' as const) }
          device.inventory.fields[field] = {
            field,
            state,
            sources: [{ state, evidence, lastKnown: previous?.sources[0]?.lastKnown ?? null }],
          }
        }
        device.inventory.revisions[field] = op.expectedRevision + 1
        return asset({ kind: 'assignment', device: id, field, revision: op.expectedRevision + 1 })
      })
    }
    if (path === '/api/v1/device-queries' && method === 'POST') {
      const op = operation(request.body)
      return receipts.write(request, op.operationId, () =>
        op.expectedRevision === 0
          ? search(op.operationId, decodeQuery(op.input), scenario === 'empty')
          : error('operation_conflict'),
      )
    }
    const taskPath =
      /^\/api\/v1\/device-queries\/([^/]+)(?:\/(items|facets)(?:\/(os_versions|channels|asset_states))?)?$/.exec(
        path,
      )
    if (taskPath && method === 'GET') {
      const task = uuid(taskPath[1]),
        search = searches.get(task)
      if (!search) return error('inventory_not_found', 404)
      if (!taskPath[2]) {
        const completed = search.reads++ > 0
        return asset({
          kind: 'query_status',
          task,
          status: completed ? 'completed' : 'running',
          summary: search.summary,
          failure: null,
          resultUrl: completed ? `/api/v1/device-queries/${task}/items` : null,
        })
      }
      if (search.reads < 2) return error('operation_conflict')
      if (taskPath[2] === 'items') {
        const select = selections.get(task) ?? []
        const items = search.devices.map((d) =>
          select.length
            ? {
                ...d,
                fields: Object.fromEntries(
                  Object.entries(d.fields).filter(([key]) => select.includes(key)),
                ),
                revisions: Object.fromEntries(
                  Object.entries(d.revisions).filter(([key]) => select.includes(key)),
                ),
              }
            : d,
        )
        return asset({
          kind: 'page',
          ...pages.page(path, items, query, task),
          summary: search.summary,
        })
      }
      const facet = taskPath[3],
        counts = new Map<string, number>()
      for (const d of search.devices) {
        const os = d.fields['device.os.version']?.state
        const labels =
          facet === 'channels'
            ? d.channels
            : facet === 'asset_states'
              ? Object.values(d.fields).map((f) => f.state.kind)
              : os?.kind === 'known'
                ? [String(os.value.value)]
                : [os?.kind ?? 'missing']
        for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1)
      }
      const page = pages.page(
        path,
        [...counts].map(([label, total]) => ({ label, total })),
        query,
        task,
      )
      return asset({ kind: 'facets', task, facet, items: page.items, nextCursor: page.nextCursor })
    }
    if (path === '/api/v1/saved-queries' && method === 'GET') {
      const after = query.get('after')
      const items = [...saved.values()]
        .filter((s) => s.definition && (!after || s.id > after))
        .sort((a, b) => a.id.localeCompare(b.id))
      return asset({
        kind: 'saved_list',
        items: items.slice(0, 100),
        next: items.length > 100 ? items[99]!.id : null,
      })
    }
    const savedPath = /^\/api\/v1\/saved-queries\/([^/]+)(\/execute)?$/.exec(path)
    if (!savedPath) return
    const id = uuid(savedPath[1]),
      old = saved.get(id)
    if (method === 'GET')
      return old ? asset({ kind: 'saved', query: old }) : error('inventory_not_found', 404)
    const op = operation(request.body)
    return receipts.write(request, op.operationId, () => {
      if (op.expectedRevision !== (old?.revision ?? 0) || old?.definition === null)
        return error('operation_conflict')
      if (savedPath[2] && method === 'POST')
        return old?.definition
          ? search(op.operationId, old.definition.query, scenario === 'empty')
          : error('inventory_not_found', 404)
      if (method !== 'PUT') return error('malformed_request', 400)
      const input = record(op.input),
        action = enumeration(input['action'], ['put', 'delete'] as const)
      const definition =
        action === 'delete'
          ? null
          : nullable(input['definition'], (v) => {
              const d = closed(v, ['name', 'query'])
              return { name: identifier(d['name']), query: decodeQuery(d['query']) }
            })
      if (action === 'put' && !definition) return error('malformed_request', 400)
      const item = { id, revision: op.expectedRevision + 1, definition }
      saved.set(id, item)
      return asset({ kind: 'saved', query: item })
    })
  }
  return {
    handle,
    reset() {
      layout = { revision: 0, editable: true, groups: [] }
      searches.clear()
      saved.clear()
      selections.clear()
      pages.reset()
      receipts.reset()
    },
  }
}
