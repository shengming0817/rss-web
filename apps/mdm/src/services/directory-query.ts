import { array, closed } from './decode'

/** Current management directory wire. Resource capabilities remain with each client. */
export interface DirectoryQuery<F extends string = string> {
  filter?: string | undefined
  sort?: readonly string[] | undefined
  fields?: readonly F[] | undefined
  limit?: number | undefined
  cursor?: string | undefined
}

export function pageCursor(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 4096 || !/^[\w-]+$/.test(value))
    throw new Error('Invalid cursor')
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const remainder = value.length % 4
  const last = alphabet.indexOf(value.at(-1)!)
  if (remainder === 1 || (remainder === 2 && last % 16) || (remainder === 3 && last % 4))
    throw new Error('Invalid cursor')
  return value
}
export function nextCursor(value: unknown): string | null {
  return value === null ? null : pageCursor(value)
}

export function queryParameters(query: DirectoryQuery = {}) {
  closed(query, [], ['filter', 'sort', 'fields', 'limit', 'cursor'])
  const result: Record<string, string | number> = {}
  if (query.filter !== undefined) {
    if (!query.filter || new TextEncoder().encode(query.filter).length > 8192)
      throw new Error('Invalid filter')
    result['filter'] = query.filter
  }
  for (const key of ['sort', 'fields'] as const) {
    const values = query[key]
    if (values !== undefined) {
      if (
        !values.length ||
        values.length > 16 ||
        new Set(key === 'sort' ? values.map((v) => v.replace(/^-/, '')) : values).size !==
          values.length
      )
        throw new Error('Invalid field set')
      for (const name of values)
        if (
          !/^-?[A-Za-z0-9_.]+$/.test(name) ||
          name.length > 128 ||
          (key === 'fields' && name.startsWith('-'))
        )
          throw new Error('Invalid field')
      result[key] = values.join(',')
    }
  }
  if (query.limit !== undefined) {
    if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 65535)
      throw new Error('Invalid page size')
    result['limit'] = query.limit
  }
  if (query.cursor !== undefined) result['cursor'] = pageCursor(query.cursor)
  return result
}

type Decoder = (value: unknown) => unknown
type Decoded<C extends Record<string, Decoder>> = { [K in keyof C]: ReturnType<C[K]> }
/** A projected row never fabricates absent fields or becomes a complete edit object. */
export function projectedRow<C extends Record<string, Decoder>, F extends keyof C & string>(
  value: unknown,
  codecs: C,
  fields?: readonly F[],
): Pick<Decoded<C>, F> {
  const selected = fields ?? (Object.keys(codecs) as F[])
  if (!selected.length || new Set(selected).size !== selected.length)
    throw new Error('Invalid projection')
  const row = closed(value, selected)
  return Object.fromEntries(
    selected.map((key) => {
      const decode = codecs[key]
      if (!decode) throw new Error('Unknown projection')
      return [key, decode(row[key])]
    }),
  ) as Pick<Decoded<C>, F>
}
export function projectedPage<C extends Record<string, Decoder>, F extends keyof C & string>(
  value: unknown,
  codecs: C,
  fields?: readonly F[],
  keys: readonly (keyof C & string)[] = [],
) {
  const page = closed(value, ['items', 'nextCursor'])
  const items = array(page['items'], (v) => projectedRow(v, codecs, fields))
  if (keys.length && (fields === undefined || keys.every((key) => fields.includes(key as F)))) {
    const identities = items.map((row) => JSON.stringify(keys.map((key) => Reflect.get(row, key))))
    if (new Set(identities).size !== identities.length)
      throw new Error('Duplicate directory identity')
  }
  return { items, nextCursor: nextCursor(page['nextCursor']) }
}

/** Serialize literal operands; this does not evaluate filters or grant authority. */
export function comparison(
  field: string,
  operator: string,
  value: string | number | boolean,
): string {
  if (
    !/^[A-Za-z0-9_.]{1,128}$/.test(field) ||
    !['==', '!=', '=lt=', '=le=', '=gt=', '=ge=', '=icontains='].includes(operator)
  )
    throw new Error('Invalid comparison')
  const text = String(value)
  if (
    new TextEncoder().encode(text).length > 1024 ||
    [...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw new Error('Invalid operand')
  return `${field}${operator}'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}
export function allOf(...terms: (string | undefined)[]): string | undefined {
  const present = terms.filter((term): term is string => term !== undefined && term !== '')
  return present.length ? present.map((term) => `(${term})`).join(';') : undefined
}

export type WindowQuery = Pick<DirectoryQuery, 'limit' | 'cursor'>

/** Fact histories expose navigation only, never arbitrary projection or sorting. */
export function windowParameters(query: WindowQuery = {}, maximum = 200) {
  closed(query, [], ['limit', 'cursor'])
  if (query.limit !== undefined && query.limit > maximum) throw new Error('Invalid page size')
  return queryParameters(query)
}
export function windowPage<T>(value: unknown, decode: (value: unknown) => T) {
  const page = closed(value, ['items', 'nextCursor'])
  return { items: array(page['items'], decode), nextCursor: nextCursor(page['nextCursor']) }
}
