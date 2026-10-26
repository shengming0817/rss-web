/** Explicit synthetic directory behavior; never imported by production. */
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { parseFilter, type Filter } from '../src/services/query-filter'
import { pageCursor } from '../src/services/directory-query'
import type { DemoRequest } from './scenario'

type Row = Record<string, unknown>
export function filterRows<T extends Row>(
  rows: T[],
  filter: string | null,
  lookup: (row: T, field: string) => unknown = (row, field) => row[field],
): T[] {
  if (!filter) return rows
  const tree = parseFilter(filter)
  function matches(node: Filter, row: T): boolean {
    if (node.kind === 'and') return node.children.every((child) => matches(child, row))
    if (node.kind === 'or') return node.children.some((child) => matches(child, row))
    if (node.kind !== 'compare') throw new Error('Invalid filter')
    const value = lookup(row, node.field)
    if (value === undefined) throw new Error('Unsupported demo field')
    const values = Array.isArray(value) ? value : [value]
    const equal = (text: string) => values.some((v) => v !== null && String(v) === text)
    switch (node.operator) {
      case '==':
        return equal(node.values[0]!)
      case '!=':
        return !equal(node.values[0]!)
      case '=in=':
        return node.values.some(equal)
      case '=out=':
        return !node.values.some(equal)
      case '=icontains=':
        return values.some((v) => String(v).toLowerCase().includes(node.values[0]!.toLowerCase()))
      case '=lt=':
        return (
          compare(value, typeof value === 'number' ? Number(node.values[0]) : node.values[0]) < 0
        )
      case '=le=':
        return (
          compare(value, typeof value === 'number' ? Number(node.values[0]) : node.values[0]) <= 0
        )
      case '=gt=':
        return (
          compare(value, typeof value === 'number' ? Number(node.values[0]) : node.values[0]) > 0
        )
      case '=ge=':
        return (
          compare(value, typeof value === 'number' ? Number(node.values[0]) : node.values[0]) >= 0
        )
      default:
        throw new Error('Unsupported demo operator')
    }
  }
  return rows.filter((row) => matches(tree, row))
}
function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return (a as string | number) < (b as string | number) ? -1 : 1
}
export function directoryPage<T extends Row>(
  rows: T[],
  request: DemoRequest,
  keys: string[],
  options: {
    lookup?: (row: T, field: string) => unknown
    maxLimit?: number
    defaultLimit?: number
    output?: string[]
    context?: string[]
    binding?: string
  } = {},
) {
  const { query } = request
  const accepted = ['filter', 'sort', 'fields', 'limit', 'cursor', ...(options.context ?? [])]
  for (const key of query.keys())
    if (!accepted.includes(key) || query.getAll(key).length !== 1 || !query.get(key))
      throw new Error('Invalid directory parameter')
  const limit = Number(query.get('limit') ?? options.defaultLimit ?? 20)
  if (!Number.isInteger(limit) || limit < 1 || limit > (options.maxLimit ?? 1000))
    throw new Error('Invalid page size')
  const fields = query.has('fields') ? query.get('fields')!.split(',') : undefined
  if (
    fields &&
    (!fields.length ||
      fields.some((field) => !field) ||
      fields.length > 16 ||
      new Set(fields).size !== fields.length)
  )
    throw new Error('Invalid projection')
  const sort = query.get('sort')?.split(',') ?? []
  for (const key of keys) if (!sort.some((field) => field.replace(/^-/, '') === key)) sort.push(key)
  if (
    sort.length > 16 ||
    new Set(sort.map((field) => field.replace(/^-/, ''))).size !== sort.length
  )
    throw new Error('Invalid sort')
  const lookup = options.lookup ?? ((row: T, field: string) => row[field])
  const items = filterRows(rows, query.get('filter'), lookup).sort((a, b) => {
    for (const field of sort) {
      const key = field.replace(/^-/, ''),
        av = lookup(a, key),
        bv = lookup(b, key)
      if (av === undefined || bv === undefined) throw new Error('Unknown sort field')
      const order = compare(av, bv)
      if (order) return field.startsWith('-') ? -order : order
    }
    return 0
  })
  const binding = createHash('sha256')
    .update(
      JSON.stringify([
        request.path,
        request.actor,
        [...query].filter(([key]) => !['cursor', 'limit'].includes(key)).sort(),
        options.binding,
      ]),
    )
    .digest('hex')
  const position = (row: T) => sort.map((field) => lookup(row, field.replace(/^-/, '')))
  let start = 0
  if (query.has('cursor')) {
    const previous = JSON.parse(
      Buffer.from(pageCursor(query.get('cursor')), 'base64url').toString('utf8'),
    ) as { binding: string; after: unknown[] }
    if (previous.binding !== binding) throw new Error('Invalidated cursor')
    const index = items.findIndex(
      (row) => JSON.stringify(position(row)) === JSON.stringify(previous.after),
    )
    if (index < 0) throw new Error('Invalidated cursor')
    start = index + 1
  }
  const selected = items.slice(start, start + limit)
  return {
    items: selected.map((row) =>
      Object.fromEntries(
        (fields ?? options.output ?? Object.keys(row)).map((field) => {
          if (!(field in row)) throw new Error('Unknown output field')
          return [field, row[field]]
        }),
      ),
    ),
    nextCursor:
      start + limit < items.length
        ? Buffer.from(JSON.stringify({ binding, after: position(selected.at(-1)!) })).toString(
            'base64url',
          )
        : null,
  }
}

/** Fixed-order keyset windows for the current Policy subcollections. */
export function windowPage<T>(
  rows: T[],
  request: DemoRequest,
  position: (row: T) => readonly (string | number)[],
  context: unknown,
  descending = false,
) {
  for (const key of request.query.keys())
    if (
      !['limit', 'cursor'].includes(key) ||
      request.query.getAll(key).length !== 1 ||
      !request.query.get(key)
    )
      throw new Error('Invalid window parameter')
  const limit = Number(request.query.get('limit') ?? 1000)
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid page size')
  const binding = createHash('sha256')
    .update(JSON.stringify([request.path, request.actor, request.authorization, context]))
    .digest('hex')
  const order = (a: readonly (string | number)[], b: readonly (string | number)[]) => {
    for (let i = 0; i < a.length; i++) {
      const n = compare(a[i], b[i])
      if (n) return descending ? -n : n
    }
    return 0
  }
  let after: (string | number)[] | undefined
  if (request.query.has('cursor')) {
    const cursor = pageCursor(request.query.get('cursor'))
    try {
      const token = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        binding: string
        position: (string | number)[]
      }
      if (
        token.binding !== binding ||
        !Array.isArray(token.position) ||
        !token.position.length ||
        token.position.some((v) => typeof v !== 'string' && typeof v !== 'number')
      )
        throw new Error('Invalidated cursor')
      after = token.position
    } catch {
      throw new Error('Invalidated cursor')
    }
  }
  const sorted = rows
    .filter((row) => !after || order(position(row), after) > 0)
    .sort((a, b) => order(position(a), position(b)))
  const items = sorted.slice(0, limit)
  return {
    items,
    nextCursor:
      sorted.length > limit
        ? Buffer.from(JSON.stringify({ binding, position: position(items.at(-1)!) })).toString(
            'base64url',
          )
        : null,
  }
}
