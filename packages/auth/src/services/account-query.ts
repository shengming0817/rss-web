import { object, list, text, bool, uuid, number } from './decode'
export interface AccountQuery {
  filter?: string | undefined
  sort?: readonly string[] | undefined
  fields?: readonly AccountField[] | undefined
  source?: string | undefined
  limit?: number | undefined
  cursor?: string | undefined
}
const nullable = <T>(value: unknown, decode: (v: unknown) => T) =>
  value === null ? null : decode(value)
function status(value: unknown) {
  const v = text(value, 64)
  if (
    ![
      'available',
      'missing',
      'expired',
      'unavailable',
      'not_yet_valid',
      'claim_missing',
      'invalid_claim',
      'local_identity',
      'not_configured',
    ].includes(v)
  )
    throw new Error('Invalid observation status')
  return v
}
function departmentSnapshot(value: unknown) {
  const v = object(value, ['version', 'sourceRevision', 'nodes', 'memberships'])
  if (v['version'] !== 1) throw new Error('Invalid snapshot version')
  return {
    version: 1,
    sourceRevision: text(v['sourceRevision']),
    nodes: list(
      v['nodes'],
      (item) => {
        const node = object(item, ['id', 'displayName', 'parentId'])
        return {
          id: text(node['id']),
          displayName: text(node['displayName']),
          parentId: nullable(node['parentId'], text),
        }
      },
      10000,
    ),
    memberships: list(v['memberships'], text, 10000),
  }
}
export const accountCodecs = {
  principalId: uuid,
  login: (v: unknown) => nullable(v, text),
  enabled: bool,
  memberActive: bool,
  hasLocalPassword: bool,
  displayName: (v: unknown) => nullable(v, text),
  email: (v: unknown) => nullable(v, text),
  profileStatus: status,
  departmentStatus: status,
  departmentSnapshot: (v: unknown) => nullable(v, departmentSnapshot),
}
export type AccountField = keyof typeof accountCodecs
export type AccountValues = { [K in AccountField]: ReturnType<(typeof accountCodecs)[K]> }
export type AccountRow = Partial<AccountValues>
export const accountBaseFields = [
  'principalId',
  'login',
  'enabled',
  'memberActive',
  'hasLocalPassword',
] as const
export function accountCursor(value: unknown): string {
  const cursor = text(value, 4096)
  if (!/^[A-Za-z0-9_-]+$/.test(cursor) || /^[0-9a-f-]{36}$/.test(cursor))
    throw new Error('Invalid account cursor')
  return cursor
}
export function accountQuery(query: AccountQuery = {}) {
  if (
    Object.keys(query).some(
      (key) => !['filter', 'sort', 'fields', 'source', 'limit', 'cursor'].includes(key),
    )
  )
    throw new Error('Invalid query')
  const result: Record<string, string> = {}
  if (query.filter !== undefined) {
    if (!query.filter || new TextEncoder().encode(query.filter).length > 8192)
      throw new Error('Invalid filter')
    result['filter'] = query.filter
  }
  if (query.source !== undefined)
    result['source'] = query.source === 'local' ? 'local' : uuid(query.source)
  for (const key of ['fields', 'sort'] as const) {
    const values = query[key]
    if (values !== undefined) {
      if (
        !values.length ||
        new Set(values.map((v) => v.replace(/^-/, ''))).size !== values.length ||
        values.some(
          (v) =>
            !(v.replace(/^-/, '') in accountCodecs) ||
            (key === 'fields' && v.startsWith('-')) ||
            (key === 'sort' && v.replace(/^-/, '') === 'departmentSnapshot'),
        )
      )
        throw new Error('Invalid fields')
      result[key] = values.join(',')
    }
  }
  if (query.limit !== undefined) {
    number(query.limit)
    if (query.limit < 1 || query.limit > 100) throw new Error('Invalid page size')
    result['limit'] = String(query.limit)
  }
  if (query.cursor !== undefined) result['cursor'] = accountCursor(query.cursor)
  return result
}
export function accountPage<F extends AccountField = (typeof accountBaseFields)[number]>(
  value: unknown,
  selected?: readonly F[],
) {
  const fields = selected ?? (accountBaseFields as readonly AccountField[])
  const page = object(value, ['accounts', 'nextCursor'])
  return {
    accounts: list(page['accounts'], (item): Pick<AccountValues, F> => {
      const v = object(item, fields)
      return Object.fromEntries(
        fields.map((field) => [field, accountCodecs[field](v[field])]),
      ) as Pick<AccountValues, F>
    }),
    next: page['nextCursor'] === null ? null : accountCursor(page['nextCursor']),
  }
}
