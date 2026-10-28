/** MOCK_SOURCE: current management metadata supplied only by the explicit scenario server. */
import { createHash } from 'node:crypto'
import { parseFilter, type Filter } from '@rss/api/mdm-filter'
import type { Application, Binding, Computer, Material } from '@rss/device-access/model'
const fixtureId = '44444444-4444-4444-8444-444444444444'
export const computerRecord = (v: Computer) => ({
  key: 'endpoint:' + v.id,
  reference: { kind: 'endpoint', id: v.id },
  association: null,
  endpoints: [
    {
      id: v.id,
      status: v.status,
      platform: {
        state: v.platform === 'unknown' ? 'unknown' : 'known',
        values: v.platform === 'unknown' ? [] : [v.platform],
      },
      displayName: { state: { kind: 'known', value: { kind: 'string', value: v.name } } },
      channels: v.registration
        ? [
            {
              registrationId: v.registration,
              generation: v.generation,
              channel: 'agent',
              status: v.status === 'revoked' ? 'revoked' : 'active',
              lastCommunicationReceivedAt: v.lastObservedAt,
            },
          ]
        : [],
    },
  ],
})
export const applicationRecord = (v: Application) => ({
  id: 'rp:' + v.id,
  kind: 'relying_party',
  value: { ...v, targetFingerprint: 'demo-fixture' },
})
export function bindingRecord(v: Binding, c: Computer) {
  const account =
    c.platform === 'windows'
      ? { platform: 'windows', sid: v.account }
      : { platform: 'macos', generatedUid: v.account }
  return {
    id: v.id,
    revision: v.revision,
    serverState: v.serverState,
    principal: v.principal,
    policy: fixtureId,
    bindingGeneration: v.bindingGeneration,
    operationId: fixtureId,
    device: v.device,
    registration: c.registration,
    registrationGeneration: c.generation,
    instance: v.instance,
    factorGeneration: v.factorGeneration,
    accountDisposition: 'keep',
    account,
    accountIntent: { kind: 'existing', account },
    createdByRss: false,
    policyVersion: fixtureId,
    desired: {},
    receivedRevision: v.receivedRevision,
    appliedRevision: v.appliedRevision,
    effect: null,
  }
}
export const materialRecord = (v: Material) => ({
  id: v.id,
  version: v.version,
  current: v.current,
  validity: v.validity,
  escrowed: v.escrowed,
  operation: fixtureId,
  createdAt: 1,
  invalidatedAt: null,
  binding: {
    device: v.device,
    registration: v.registration,
    generation: v.generation,
    subject: v.subject,
  },
})
export function directoryPage(
  items: Record<string, unknown>[],
  query: URLSearchParams,
  identity: string,
) {
  if (
    [...query.keys()].some((key) => !['filter', 'sort', 'fields', 'limit', 'cursor'].includes(key))
  )
    throw new Error('Unsupported query')
  const limit = Number(query.get('limit') ?? 50)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid limit')
  const fields = query.get('fields')?.split(',')
  const available = Object.keys(items[0] ?? {})
  if (
    fields &&
    (!fields.length ||
      fields.length > 16 ||
      new Set(fields).size !== fields.length ||
      (items.length && fields.some((f) => !available.includes(f))))
  )
    throw new Error('Invalid fields')
  function value(row: Record<string, unknown>, key: string): unknown {
    if (key in row) return row[key]
    const app = row['value'] as Record<string, unknown> | undefined
    if (app && key in app) return app[key]
    const endpoints = row['endpoints'] as Record<string, unknown>[] | undefined
    if (endpoints?.length) {
      if (key === 'platform') return (endpoints[0]?.['platform'] as { values: string[] }).values[0]
      if (key === 'status') return endpoints[0]?.['status']
      if (key === 'search') return JSON.stringify(endpoints)
    }
    throw new Error('Unsupported fixture filter field')
  }
  function matches(row: Record<string, unknown>, node: Filter): boolean {
    if (node.kind === 'and') return node.children.every((n) => matches(row, n))
    if (node.kind === 'or') return node.children.some((n) => matches(row, n))
    if (node.kind !== 'compare') throw new Error('Invalid filter')
    const v = value(row, node.field),
      actual = String(v),
      expected = node.values[0]!
    switch (node.operator) {
      case '==':
        return actual === expected
      case '!=':
        return actual !== expected
      case '=icontains=':
        return actual.toLowerCase().includes(expected.toLowerCase())
      case '=in=':
        return node.values.includes(actual)
      case '=out=':
        return !node.values.includes(actual)
      case '=lt=':
        return typeof v === 'number' ? v < Number(expected) : actual < expected
      case '=le=':
        return typeof v === 'number' ? v <= Number(expected) : actual <= expected
      case '=gt=':
        return typeof v === 'number' ? v > Number(expected) : actual > expected
      case '=ge=':
        return typeof v === 'number' ? v >= Number(expected) : actual >= expected
      default:
        throw new Error('Unsupported fixture operator')
    }
  }
  const filter = query.get('filter')
  const rows = filter ? items.filter((v) => matches(v, parseFilter(filter))) : [...items]
  const sort = query.get('sort')?.split(',') ?? [available.includes('key') ? 'key' : 'id']
  rows.sort((a, b) => {
    for (const term of [...sort, 'id' in (a ?? {}) ? 'id' : 'key']) {
      const key = term.replace(/^-/, '')
      const x = value(a, key),
        y = value(b, key)
      const c =
        typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      if (c) return term.startsWith('-') ? -c : c
    }
    return 0
  })
  const frozen = new URLSearchParams(query)
  frozen.delete('cursor')
  const binding = createHash('sha256')
    .update(identity + frozen.toString() + JSON.stringify(items))
    .digest('hex')
  const token = query.get('cursor')
  let offset = 0
  if (token) {
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString()) as {
      offset: number
      binding: string
    }
    if (decoded.binding !== binding || !Number.isSafeInteger(decoded.offset) || decoded.offset < 0)
      throw new Error('Invalid cursor')
    offset = decoded.offset
  }
  const page = rows
    .slice(offset, offset + limit)
    .map((row) => (fields ? Object.fromEntries(fields.map((f) => [f, row[f]])) : row))
  return {
    items: page,
    nextCursor:
      offset + limit < rows.length
        ? Buffer.from(JSON.stringify({ offset: offset + limit, binding })).toString('base64url')
        : null,
  }
}
