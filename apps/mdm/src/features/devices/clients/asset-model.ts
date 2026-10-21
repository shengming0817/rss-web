import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  integer,
  nullable,
  record,
  string,
  unique,
  uuid,
} from '../../../services/decode'
export const operators = [
  'eq',
  'ne',
  'in',
  'not_in',
  'lt',
  'le',
  'gt',
  'ge',
  'contains',
  'not_contains',
  'contains_any',
  'contains_all',
  'is_null',
  'is_not_null',
] as const
export type Operator = (typeof operators)[number]
export type Scalar =
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'integer' | 'time'; value: number }
export type AssetState = ReadState
export type Criteria =
  | { kind: 'predicate'; field: string; op: Operator; value?: Scalar; values?: Scalar[] }
  | { kind: 'and' | 'or'; children: Criteria[] }
export interface Query {
  criteria: InventoryCondition | null
  select: string[]
  sort: { field: string; descending: boolean } | null
}
export type ManualChange = { action: 'set'; value: Scalar } | { action: 'null' | 'delete' }
export function fieldKey(value: unknown) {
  const v = identifier(value)
  if (v.length > 128 || !/^(device|custom|channel)(\.[a-z][a-z0-9_]*)+$/.test(v))
    throw new Error('Invalid field')
  return v
}
export function scalar(value: unknown): Scalar {
  const v = closed(value, ['kind', 'value'])
  const kind = enumeration(v['kind'], ['string', 'boolean', 'integer', 'time'] as const)
  if (kind === 'string') {
    const value = string(v['value'])
    if (!value.trim() || [...value].length > 256 || /\p{Cc}/u.test(value))
      throw new Error('Invalid scalar text')
    return { kind, value }
  }
  if (kind === 'boolean') return { kind, value: boolean(v['value']) }
  return { kind, value: integer(v['value']) }
}
export function resolvedField(value: unknown) {
  const v = closed(value, ['field', 'state', 'sources'])
  return {
    field: fieldKey(v['field']),
    state: assetState(v['state']),
    sources: unique(array(v['sources'], sourceFact), (s) => sourceIdentity(s.evidence)),
  }
}
export function qualityRun(value: unknown) {
  const v = closed(value, [
    'dataset',
    'templateVersion',
    'fingerprint',
    'coverage',
    'complete',
    'source',
    'channel',
    'registration',
    'registrationGeneration',
    'epoch',
    'runId',
    'sequence',
    'result',
    'deliveryPending',
    'fields',
  ])
  const coverage = closed(v['coverage'], ['id', 'version', 'definition', 'format'])
  return {
    dataset: identifier(v['dataset']),
    templateVersion: identifier(v['templateVersion']),
    fingerprint: identifier(v['fingerprint']),
    coverage: {
      id: identifier(coverage['id']),
      version: identifier(coverage['version']),
      definition: identifier(coverage['definition']),
      format: identifier(coverage['format']),
    },
    complete: boolean(v['complete']),
    source: enumeration(v['source'], sourceIds),
    channel: enumeration(v['channel'], ['agent', 'mdm'] as const),
    registration: uuid(v['registration']),
    registrationGeneration: count(v['registrationGeneration']),
    epoch: uuid(v['epoch']),
    runId: uuid(v['runId']),
    sequence: integer(v['sequence']),
    result: enumeration(v['result'], ['pending', 'snapshot', 'partial', 'failed'] as const),
    deliveryPending: boolean(v['deliveryPending']),
    fields: array(v['fields'], (item) => {
      const f = closed(item, [
        'scope',
        'reason',
        'field',
        'quality',
        'status',
        'receivedAt',
        'itemCount',
        'invalidItems',
      ])
      return {
        scope: collectionScope(f['scope']),
        reason: nullable(f['reason'], identifier),
        itemCount: count(f['itemCount']),
        invalidItems: count(f['invalidItems']),
        field: fieldKey(f['field']),
        quality: enumeration(f['quality'], [
          'pending',
          'success',
          'unsupported',
          'failed',
          'invalid',
          'missing',
          'unknown',
          'deleted',
        ] as const),
        status: nullable(f['status'], count),
        receivedAt: nullable(f['receivedAt'], integer),
      }
    }),
  }
}
export function inventory(value: unknown) {
  const v = closed(value, [
    'collectionScope',
    'device',
    'channels',
    'fields',
    'lists',
    'quality',
    'revisions',
  ])
  const fields = record(v['fields'])
  const revisions = record(v['revisions'])
  if (Object.keys(fields).length > 1000 || Object.keys(revisions).length > 1000)
    throw new Error('Too many fields')
  const result = {
    collectionScope: collectionScope(v['collectionScope']),
    device: identifier(v['device']),
    channels: unique(
      array(v['channels'], (s) => enumeration(s, ['agent', 'mdm'] as const)),
      (s) => s,
    ),
    fields: Object.fromEntries(
      Object.entries(fields).map(([key, value]) => {
        const field = resolvedField(value)
        if (field.field !== key) throw new Error('Mismatched field')
        return [fieldKey(key), field]
      }),
    ),
    lists: Object.fromEntries(
      Object.entries(record(v['lists'])).map(([key, x]) => {
        fieldKey(key)
        const l = closed(x, ['state', 'sources', 'itemKey', 'cursor'])
        return [
          key,
          {
            state: listState(l['state']),
            sources: array(l['sources'], (x) => {
              const source = closed(x, ['state', 'evidence', 'cursor'])
              return {
                state: listState(source['state']),
                evidence: evidence(source['evidence']),
                cursor: pageToken(source['cursor']),
              }
            }),
            itemKey: nullable(l['itemKey'], identifier),
            cursor: pageToken(l['cursor']),
          },
        ]
      }),
    ),
    quality: array(v['quality'], qualityRun),
    revisions: Object.fromEntries(
      Object.entries(revisions).map(([key, value]) => [fieldKey(key), count(value)]),
    ),
  }
  const expected = JSON.stringify(result.collectionScope)
  const same = (scope: CollectionScope) => {
    if (JSON.stringify(scope) !== expected) throw new Error('Inventory namespace mismatch')
  }
  for (const field of Object.values(result.fields))
    for (const source of field.sources) {
      same(source.evidence.scope)
      if (source.lastKnown) same(source.lastKnown.evidence.scope)
    }
  for (const list of Object.values(result.lists))
    for (const source of list.sources) same(source.evidence.scope)
  for (const quality of result.quality) for (const field of quality.fields) same(field.scope)
  return result
}
export type Inventory = ReturnType<typeof inventory>
export type ResolvedField = ReturnType<typeof resolvedField>
export function fieldDefinition(value: unknown) {
  const v = closed(value, [
    'key',
    'version',
    'valueType',
    'nullable',
    'manual',
    'sources',
    'platforms',
    'sensitivity',
    'unit',
    'searchable',
    'itemKey',
    'operations',
  ])
  const kind = valueType(v['valueType'])
  const sources = Object.entries(record(v['sources'])).map(([k, n]) => {
    enumeration(k, sourceIds)
    if (count(n) > 65535) throw new Error('Invalid priority')
    return k as (typeof sourceIds)[number]
  })
  return {
    key: fieldKey(v['key']),
    version: count(v['version']),
    platforms: array(v['platforms'], (x) => enumeration(x, ['windows', 'macos'] as const)),
    sensitivity: enumeration(v['sensitivity'], ['standard', 'sensitive'] as const),
    unit: nullable(v['unit'], string),
    searchable: boolean(v['searchable']),
    itemKey: nullable(v['itemKey'], identifier),
    kind,
    nullable: boolean(v['nullable']),
    manual: boolean(v['manual']),
    sources,
    operations: unique(
      array(v['operations'], (x) => enumeration(x, operators)),
      (x) => x,
    ),
  }
}
function valueType(
  value: unknown,
  depth = 0,
): 'string' | 'integer' | 'number' | 'boolean' | 'time' | 'array' | 'object' {
  if (depth > 6) throw new Error('Field type exceeds bounds')
  const v = record(value),
    kind = enumeration(v['kind'], [
      'string',
      'enum',
      'record',
      'integer',
      'number',
      'boolean',
      'time',
      'array',
      'object',
    ] as const)
  if (kind === 'string') {
    closed(v, ['kind', 'maxLength', 'allowEmpty'])
    if (count(v['maxLength']) < 1 || count(v['maxLength']) > 65536)
      throw new Error('Invalid text bounds')
    boolean(v['allowEmpty'])
  } else if (kind === 'enum') {
    closed(v, ['kind', 'values'])
    if (!array(v['values'], identifier).length) throw new Error('Empty enum')
  } else if (kind === 'array') {
    closed(v, ['kind', 'items', 'maxItems'])
    count(v['maxItems'])
    valueType(v['items'], depth + 1)
  } else if (kind === 'record') {
    closed(v, ['kind', 'properties'])
    Object.entries(record(v['properties'])).forEach(([k, x]) => {
      identifier(k)
      const property = closed(x, ['valueType', 'required'])
      boolean(property['required'])
      valueType(property['valueType'], depth + 1)
    })
  } else if (kind === 'object') {
    closed(v, ['kind', 'properties'])
    Object.entries(record(v['properties'])).forEach(([k, x]) => {
      identifier(k)
      valueType(x, depth + 1)
    })
  } else closed(v, ['kind'])
  return kind === 'enum' ? 'string' : kind === 'record' ? 'object' : kind
}
export function editableField<T extends { kind: string }>(
  field: T,
): field is T & { kind: Scalar['kind'] } {
  return ['string', 'integer', 'boolean', 'time'].includes(field.kind)
}
export type FieldDefinition = ReturnType<typeof fieldDefinition>
export function criteria(value: unknown, depth = 0): Criteria {
  if (depth > 16) throw new Error('Condition nesting too deep')
  const kind = enumeration(record(value)['kind'], ['predicate', 'and', 'or'] as const)
  if (kind !== 'predicate') {
    const v = closed(value, ['kind', 'children'])
    return { kind, children: array(v['children'], (v) => criteria(v, depth + 1)) }
  }
  const v = closed(value, ['kind', 'field', 'op'], ['value', 'values'])
  const op = enumeration(v['op'], operators)
  const field = fieldKey(v['field'])
  if (op === 'is_null' || op === 'is_not_null') {
    if (v['value'] != null || v['values'] != null) throw new Error('Unexpected operand')
    return { kind, field, op }
  }
  if (op === 'in' || op === 'not_in' || op === 'contains_any' || op === 'contains_all') {
    if (v['value'] != null) throw new Error('Unexpected operand')
    return { kind, field, op, values: array(v['values'], scalar) }
  }
  if (v['values'] != null) throw new Error('Unexpected operands')
  return { kind, field, op, value: scalar(v['value']) }
}
export function query(value: unknown): Query {
  const v = closed(value, ['criteria', 'select', 'sort'])
  return {
    criteria: nullable(v['criteria'], inventoryCondition),
    select: unique(array(v['select'], fieldKey), (s) => s),
    sort: nullable(v['sort'], (value) => {
      const s = closed(value, ['field', 'descending'])
      return { field: fieldKey(s['field']), descending: boolean(s['descending']) }
    }),
  }
}
export function savedQuery(value: unknown) {
  const v = closed(value, ['id', 'revision', 'definition'])
  return {
    id: uuid(v['id']),
    revision: count(v['revision']),
    definition: nullable(v['definition'], (value) => {
      const d = closed(value, ['name', 'query'])
      return { name: identifier(d['name']), query: query(d['query']) }
    }),
  }
}
export type SavedQuery = ReturnType<typeof savedQuery>
export function summary(value: unknown) {
  const v = closed(value, ['matched', 'unknown', 'total'])
  return { matched: count(v['matched']), unknown: count(v['unknown']), total: count(v['total']) }
}
export function assetEnvelope(value: unknown, tenant: string, kind: string, keys: string[]) {
  const envelope = closed(value, ['tenantId', 'asset'])
  if (uuid(envelope['tenantId']) !== tenant) throw new Error('Wrong tenant')
  const v = closed(envelope['asset'], ['kind', ...keys])
  if (v['kind'] !== kind) throw new Error('Wrong asset response')
  return v
}
export function pageToken(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 16384 || /\p{Cc}/u.test(value))
    throw new Error('Invalid cursor')
  return value
}
export const cursor = (v: unknown) => nullable(v, pageToken)

export const sourceIds = [
  'manual',
  'mdm.windows',
  'mdm.apple',
  'agent.builtin',
  'agent.script',
  'agent.native',
  'agent.osquery',
] as const
export type ReadScalar =
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'integer' | 'time' | 'number'; value: number }
  | { kind: 'array'; value: ReadScalar[] }
  | { kind: 'object'; value: Record<string, ReadScalar> }
export function readScalar(value: unknown): ReadScalar {
  let nodes = 0,
    bytes = 0
  function decode(value: unknown, depth: number): ReadScalar {
    if (depth > 5 || ++nodes > 200000) throw new Error('Asset value exceeds bounds')
    const v = closed(value, ['kind', 'value']),
      kind = enumeration(v['kind'], [
        'string',
        'boolean',
        'integer',
        'time',
        'number',
        'array',
        'object',
      ] as const)
    if (kind === 'string') {
      if (typeof v['value'] !== 'string' || v['value'].includes('\0'))
        throw new Error('Invalid asset text')
      bytes += new TextEncoder().encode(v['value']).length
      if (bytes > 16 * 1024 * 1024) throw new Error('Asset text exceeds bounds')
      return { kind, value: v['value'] }
    }
    if (kind === 'boolean') return { kind, value: boolean(v['value']) }
    if (kind === 'number') {
      if (typeof v['value'] !== 'number' || !Number.isFinite(v['value']))
        throw new Error('Invalid number')
      return { kind, value: v['value'] }
    }
    if (kind === 'integer' || kind === 'time') return { kind, value: integer(v['value']) }
    if (kind === 'array') {
      if (!Array.isArray(v['value']) || v['value'].length > 200000)
        throw new Error('Invalid asset array')
      return { kind, value: v['value'].map((x) => decode(x, depth + 1)) }
    }
    const entries = Object.entries(record(v['value']))
    if (entries.length > 200000) throw new Error('Invalid asset object')
    return {
      kind,
      value: Object.fromEntries(
        entries.map(([k, x]) => {
          if (k.includes('\0')) throw new Error('Invalid asset key')
          bytes += new TextEncoder().encode(k).length
          if (bytes > 16 * 1024 * 1024) throw new Error('Asset text exceeds bounds')
          return [k, decode(x, depth + 1)]
        }),
      ),
    }
  }
  return decode(value, 0)
}
export type ReadState =
  | { kind: 'known'; value: ReadScalar }
  | { kind: 'null' | 'missing' | 'unsupported' | 'deleted' | 'conflict' }
  | { kind: 'unknown'; reason: ReturnType<typeof unknownReason> }
export function unknownReason(value: unknown) {
  return enumeration(value, [
    'unordered_conflict',
    'incomplete',
    'native_status',
    'evidence_limit',
  ] as const)
}
export function assetState(value: unknown): ReadState {
  if (record(value)['kind'] === 'unknown') {
    const v = closed(value, ['kind', 'value']),
      reason = closed(v['value'], ['reason'])
    return { kind: 'unknown', reason: unknownReason(reason['reason']) }
  }
  const kind = enumeration(record(value)['kind'], [
      'known',
      'null',
      'missing',
      'unsupported',
      'deleted',
      'conflict',
    ] as const),
    v = closed(value, kind === 'known' ? ['kind', 'value'] : ['kind'])
  return kind === 'known' ? { kind, value: readScalar(v['value']) } : { kind }
}
export function evidence(value: unknown) {
  const v = closed(value, [
    'scope',
    'source',
    'dataset',
    'registration',
    'registrationGeneration',
    'epoch',
    'snapshotId',
    'observedAt',
    'receivedAt',
    'actor',
  ])
  return {
    scope: collectionScope(v['scope']),
    source: enumeration(v['source'], sourceIds),
    dataset: nullable(v['dataset'], identifier),
    registration: nullable(v['registration'], identifier),
    registrationGeneration: nullable(v['registrationGeneration'], count),
    epoch: nullable(v['epoch'], identifier),
    snapshotId: identifier(v['snapshotId']),
    observedAt: integer(v['observedAt']),
    receivedAt: integer(v['receivedAt']),
    actor: nullable(v['actor'], identifier),
  }
}
export type Evidence = ReturnType<typeof evidence>
export function sourceFact(value: unknown) {
  const v = closed(value, ['state', 'lastKnown', 'evidence'])
  return {
    state: assetState(v['state']),
    evidence: evidence(v['evidence']),
    lastKnown: nullable(v['lastKnown'], (x) => {
      const last = closed(x, ['value', 'evidence'])
      return { value: readScalar(last['value']), evidence: evidence(last['evidence']) }
    }),
  }
}
export function listState(value: unknown) {
  if (record(value)['kind'] === 'unknown') {
    const v = closed(value, ['kind', 'reason'])
    return { kind: 'unknown' as const, reason: unknownReason(v['reason']) }
  }
  const kind = enumeration(record(value)['kind'], [
      'known',
      'null',
      'missing',
      'unsupported',
      'deleted',
      'conflict',
    ] as const),
    v = closed(value, kind === 'known' ? ['kind', 'count', 'digest'] : ['kind'])
  return kind === 'known'
    ? { kind, count: count(v['count']), digest: identifier(v['digest']) }
    : { kind }
}
export function sourceIdentity(value: Evidence) {
  return JSON.stringify([value.source, value.dataset])
}

const platforms = ['windows', 'macos'] as const
function account(value: unknown) {
  const kind = enumeration(record(value)['kind'], platforms)
  const v = closed(value, kind === 'windows' ? ['kind', 'sid'] : ['kind', 'uid', 'generated_uid'])
  if (kind === 'windows') return { kind, sid: sid(v['sid']) }
  return { kind, uid: uid(v['uid']), generated_uid: uuid(v['generated_uid']) }
}
function sid(value: unknown) {
  const s = identifier(value)
  if (s.length > 184 || !/^S-1-(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*)){1,}$/.test(s))
    throw new Error('Invalid SID')
  return s
}
function uid(value: unknown) {
  const n = count(value)
  if (!n || n > 4294967295) throw new Error('Invalid UID')
  return n
}
export function collectionScope(value: unknown) {
  const kind = enumeration(record(value)['kind'], [
    'device',
    'apple_user',
    'native_certificates',
    'native_accounts',
    'native_application',
    'native_user',
    'macos_applications',
    'macos_brew',
  ] as const)
  if (kind === 'device') {
    closed(value, ['kind'])
    return { kind }
  }
  if (kind === 'apple_user') {
    const v = closed(value, ['kind', 'identity'])
    return { kind, identity: uuid(v['identity']) }
  }
  if (kind === 'native_user') {
    const v = closed(value, ['kind', 'owner'])
    return { kind, owner: account(v['owner']) }
  }
  if (kind === 'macos_applications') {
    const v = closed(value, ['kind', 'root', 'uid']),
      root = enumeration(v['root'], ['local', 'system', 'user'] as const),
      owner = nullable(v['uid'], uid)
    if ((root === 'user') !== (owner !== null)) throw new Error('Invalid application owner')
    return { kind, root, uid: owner }
  }
  if (kind === 'macos_brew') {
    const v = closed(value, ['kind', 'uid', 'prefix', 'package', 'taps']),
      prefix = identifier(v['prefix']),
      taps = unique(array(v['taps'], identifier), (s) => s)
    if (
      prefix.length > 4096 ||
      !prefix.startsWith('/') ||
      prefix
        .slice(1)
        .split('/')
        .some((p) => !p || p === '.' || p === '..') ||
      taps.length > 64 ||
      taps.some(
        (t) =>
          t.length > 255 ||
          !/^[a-z0-9._-]+\/[a-z0-9._-]+$/.test(t) ||
          t.split('/').some((p) => p === '.' || p === '..'),
      )
    )
      throw new Error('Invalid Homebrew scope')
    return {
      kind,
      uid: uid(v['uid']),
      prefix,
      package: enumeration(v['package'], ['formula', 'cask'] as const),
      taps: [...taps].sort(),
    }
  }
  const keys =
    kind === 'native_accounts'
      ? ['kind', 'platform', 'identities']
      : ['kind', 'platform', 'owner', kind === 'native_application' ? 'identity' : 'store']
  const v = closed(value, keys),
    platform = enumeration(v['platform'], platforms)
  if (kind === 'native_accounts') {
    const identities = unique(array(v['identities'], platform === 'windows' ? sid : uuid), (s) => s)
    if (identities.length > 256) throw new Error('Too many accounts')
    return { kind, platform, identities: [...identities].sort() }
  }
  const owner = nullable(v['owner'], account)
  if (owner && owner.kind !== platform) throw new Error('Wrong account platform')
  if (kind === 'native_application') {
    const identity = string(v['identity'])
    if (!identity || identity.length > 4096 || /\p{Cc}/u.test(identity))
      throw new Error('Invalid application identity')
    return { kind, platform, identity, owner }
  }
  const store = enumeration(
    v['store'],
    platform === 'windows'
      ? ['my', 'root', 'ca', 'trusted_publisher']
      : ['system', 'system_roots', 'login'],
  )
  if (platform === 'macos' && (store === 'login') !== (owner !== null))
    throw new Error('Invalid certificate owner')
  return { kind, platform, store, owner }
}
export type CollectionScope = ReturnType<typeof collectionScope>
export function scopeSelector(value: unknown) {
  const kind = enumeration(record(value)['kind'], [
    'device',
    'exact',
    'local_user',
    'all_authorized',
  ] as const)
  if (kind === 'device' || kind === 'all_authorized') {
    closed(value, ['kind'])
    return { kind }
  }
  if (kind === 'exact') {
    const v = closed(value, ['kind', 'scope'])
    return { kind, scope: collectionScope(v['scope']) }
  }
  const v = closed(value, ['kind', 'platform', 'identity']),
    platform = enumeration(v['platform'], platforms),
    identity = identifier(v['identity'])
  if (platform === 'windows') sid(identity)
  else if (!/^[1-9]\d*$/.test(identity) || Number(identity) > 4294967295)
    throw new Error('Invalid UID')
  return { kind, platform, identity }
}
export interface InventoryCondition {
  selector: ReturnType<typeof scopeSelector>
  quantifier: 'one' | 'any' | 'all'
  criteria: Criteria
}
export function inventoryCondition(value: unknown): InventoryCondition {
  const v = closed(value, ['selector', 'quantifier', 'criteria']),
    selector = scopeSelector(v['selector']),
    quantifier = enumeration(v['quantifier'], ['one', 'any', 'all'] as const)
  if ((selector.kind === 'device' || selector.kind === 'exact') !== (quantifier === 'one'))
    throw new Error('Invalid condition quantifier')
  return { selector, quantifier, criteria: criteria(v['criteria']) }
}
export function deviceCondition(
  criteria: Criteria = { kind: 'and', children: [] },
): InventoryCondition {
  return { selector: { kind: 'device' }, quantifier: 'one', criteria }
}
