/** Explicit synthetic demonstration DTOs. These are not a published MDM contract. */
import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  nullable,
  string,
  uuid,
} from '../../src/services/decode'
export const risks = ['low', 'medium', 'high', 'critical'] as const
export const modes = ['normal', 'failed', 'partial', 'conflict', 'empty'] as const
export const sources = [
  'device.software.installations',
  'device.software.windows.win32',
  'device.software.apple.installed_applications',
] as const
export type Risk = (typeof risks)[number] | null
export type Mode = (typeof modes)[number]
export interface Standard {
  id: string
  revision: number
  name: string
  risk: Risk
  marks: string[]
  threshold: number | null
  allowedGroups: string[] | null
  archived: boolean
}
export interface Mapping {
  id: string
  revision: number
  standardId: string
  enabled: boolean
  source: (typeof sources)[number]
  platform: 'any' | 'windows' | 'macos'
  origin: string | null
  identity: string
  publisher: string
  version: string | null
}
export interface Group {
  id: string
  name: string
  members: string[] | null
  revision: number
}
export interface Filters {
  groups: string[]
  groupMode: 'any' | 'all'
  device: string
  platform: string
  architecture: string
  name: string
  version: string
  publisher: string
  source: string
  standardId: string
  risk: string
  mark: string
  resolution: string
}
export const emptyFilters = (): Filters => ({
  groups: [],
  groupMode: 'any',
  device: '',
  platform: '',
  architecture: '',
  name: '',
  version: '',
  publisher: '',
  source: '',
  standardId: '',
  risk: '',
  mark: '',
  resolution: '',
})
export interface Evidence {
  id: string
  deviceId: string
  deviceName: string
  platform: string
  architecture: string
  scope: string
  identity: string
  name: string
  version: string
  publisher: string
  component: string
  source: string
  origin: string
  observedAt: string
  presence: 'installed' | 'provisioned' | 'indeterminate'
  retained: boolean
  mappingIds: string[]
  standardIds: string[]
}
export type Verdict = 'allowed' | 'denied' | 'unknown' | 'disabled'
export interface AssetDevice {
  id: string
  name: string
  verdict: Verdict
  evidence: Evidence[]
}
export interface Facet {
  value: string
  devices: number
}
export interface Bucket {
  id: string
  name: string
  standardId: string | null
  risk: Risk
  marks: string[]
  resolution: 'mapped' | 'unmapped' | 'conflict'
  deviceCount: number | null
  assessmentCount: number | null
  threshold: number | null
  thresholdState: 'disabled' | 'below' | 'reached' | 'unknown'
  compliance: {
    state: 'disabled' | 'known' | 'unknown'
    allowed: number
    denied: number
    unknown: number
  }
  versions: Facet[]
  components: Facet[]
  publishers: Facet[]
  platforms: Facet[]
}
export interface Snapshot {
  revision: number
  mode: Mode
  standards: Standard[]
  mappings: Mapping[]
  groups: Group[]
}
export interface Coverage {
  current: number
  retained: number
  unknown: number
  conflict: number
  empty: number
}
export interface Result {
  id: string
  revision: number
  watermark: string
  coverage: Coverage
  rows: Bucket[]
  nextCursor: string | null
  totalRows: number
  devices: number | null
}
export interface Detail {
  queryId: string
  bucketId: string
  devices: AssetDevice[]
  nextCursor: string | null
}
export type Change =
  | {
      kind: 'standard'
      action: 'put' | 'archive' | 'delete'
      id: string
      expectedRevision: number
      value: Standard | null
    }
  | {
      kind: 'mapping'
      action: 'put' | 'delete'
      id: string
      expectedRevision: number
      value: Mapping | null
    }
export interface Receipt {
  operationId: string
  revision: number
  kind: 'standard' | 'mapping'
  target: string
}
const text = (value: unknown) => {
  const s = string(value)
  if (!s.trim()) throw new Error('Empty value')
  return s
}
const strings = (v: unknown) => array(v, string)
const ids = (v: unknown) => array(v, uuid)
const risk = (v: unknown) => nullable(v, (x) => enumeration(x, risks))
export function standard(value: unknown): Standard {
  const v = closed(value, [
    'id',
    'revision',
    'name',
    'risk',
    'marks',
    'threshold',
    'allowedGroups',
    'archived',
  ])
  const threshold = nullable(v['threshold'], count),
    allowedGroups = nullable(v['allowedGroups'], ids)
  if (
    threshold === 0 ||
    allowedGroups?.length === 0 ||
    new Set(allowedGroups ?? []).size !== (allowedGroups?.length ?? 0)
  )
    throw new Error('Invalid assessment')
  return {
    id: uuid(v['id']),
    revision: count(v['revision']),
    name: text(v['name']),
    risk: risk(v['risk']),
    marks: strings(v['marks']),
    threshold,
    allowedGroups,
    archived: boolean(v['archived']),
  }
}
export function mapping(value: unknown): Mapping {
  const v = closed(value, [
    'id',
    'revision',
    'standardId',
    'enabled',
    'source',
    'platform',
    'origin',
    'identity',
    'publisher',
    'version',
  ])
  return {
    id: uuid(v['id']),
    revision: count(v['revision']),
    standardId: uuid(v['standardId']),
    enabled: boolean(v['enabled']),
    source: enumeration(v['source'], sources),
    platform: enumeration(v['platform'], ['any', 'windows', 'macos']),
    origin: nullable(v['origin'], text),
    identity: text(v['identity']),
    publisher: text(v['publisher']),
    version: nullable(v['version'], text),
  }
}
export function filters(value: unknown): Filters {
  const v = closed(value, Object.keys(emptyFilters()))
  return {
    groups: ids(v['groups']),
    groupMode: enumeration(v['groupMode'], ['any', 'all']),
    device: string(v['device']),
    platform: enumeration(v['platform'], ['', 'windows', 'macos']),
    architecture: enumeration(v['architecture'], ['', 'x64', 'arm64']),
    name: string(v['name']),
    version: string(v['version']),
    publisher: string(v['publisher']),
    source: enumeration(v['source'], ['', ...sources]),
    standardId: v['standardId'] === '' ? '' : uuid(v['standardId']),
    risk: enumeration(v['risk'], ['', 'unclassified', ...risks]),
    mark: string(v['mark']),
    resolution: enumeration(v['resolution'], ['', 'mapped', 'unmapped', 'conflict']),
  }
}
export function snapshot(value: unknown): Snapshot {
  const v = closed(value, ['revision', 'mode', 'standards', 'mappings', 'groups'])
  return {
    revision: count(v['revision']),
    mode: enumeration(v['mode'], modes),
    standards: array(v['standards'], standard),
    mappings: array(v['mappings'], mapping),
    groups: array(v['groups'], (x) => {
      const g = closed(x, ['id', 'name', 'members', 'revision'])
      return {
        id: uuid(g['id']),
        name: text(g['name']),
        members: nullable(g['members'], strings),
        revision: count(g['revision']),
      }
    }),
  }
}
export function receipt(value: unknown): Receipt {
  const v = closed(value, ['operationId', 'revision', 'kind', 'target'])
  return {
    operationId: uuid(v['operationId']),
    revision: count(v['revision']),
    kind: enumeration(v['kind'], ['standard', 'mapping']),
    target: uuid(v['target']),
  }
}
const facets = (value: unknown) =>
  array(value, (x) => {
    const v = closed(x, ['value', 'devices'])
    return { value: string(v['value']), devices: count(v['devices']) }
  })
export function result(value: unknown): Result {
  const v = closed(value, [
      'id',
      'revision',
      'watermark',
      'coverage',
      'rows',
      'nextCursor',
      'totalRows',
      'devices',
    ]),
    c = closed(v['coverage'], ['current', 'retained', 'unknown', 'conflict', 'empty'])
  return {
    id: uuid(v['id']),
    revision: count(v['revision']),
    watermark: text(v['watermark']),
    coverage: {
      current: count(c['current']),
      retained: count(c['retained']),
      unknown: count(c['unknown']),
      conflict: count(c['conflict']),
      empty: count(c['empty']),
    },
    rows: array(v['rows'], (x) => {
      const b = closed(x, [
          'id',
          'name',
          'standardId',
          'risk',
          'marks',
          'resolution',
          'deviceCount',
          'assessmentCount',
          'threshold',
          'thresholdState',
          'compliance',
          'versions',
          'components',
          'publishers',
          'platforms',
        ]),
        a = closed(b['compliance'], ['state', 'allowed', 'denied', 'unknown'])
      return {
        id: uuid(b['id']),
        name: text(b['name']),
        standardId: nullable(b['standardId'], uuid),
        risk: risk(b['risk']),
        marks: strings(b['marks']),
        resolution: enumeration(b['resolution'], ['mapped', 'unmapped', 'conflict']),
        deviceCount: nullable(b['deviceCount'], count),
        assessmentCount: nullable(b['assessmentCount'], count),
        threshold: nullable(b['threshold'], count),
        thresholdState: enumeration(b['thresholdState'], [
          'disabled',
          'below',
          'reached',
          'unknown',
        ]),
        compliance: {
          state: enumeration(a['state'], ['disabled', 'known', 'unknown']),
          allowed: count(a['allowed']),
          denied: count(a['denied']),
          unknown: count(a['unknown']),
        },
        versions: facets(b['versions']),
        components: facets(b['components']),
        publishers: facets(b['publishers']),
        platforms: facets(b['platforms']),
      }
    }),
    nextCursor: nullable(v['nextCursor'], uuid),
    totalRows: count(v['totalRows']),
    devices: nullable(v['devices'], count),
  }
}
function evidence(value: unknown): Evidence {
  const v = closed(value, [
    'id',
    'deviceId',
    'deviceName',
    'platform',
    'architecture',
    'scope',
    'identity',
    'name',
    'version',
    'publisher',
    'component',
    'source',
    'origin',
    'observedAt',
    'presence',
    'retained',
    'mappingIds',
    'standardIds',
  ])
  return {
    id: text(v['id']),
    deviceId: text(v['deviceId']),
    deviceName: text(v['deviceName']),
    platform: string(v['platform']),
    architecture: string(v['architecture']),
    scope: string(v['scope']),
    identity: text(v['identity']),
    name: text(v['name']),
    version: string(v['version']),
    publisher: text(v['publisher']),
    component: string(v['component']),
    source: string(v['source']),
    origin: string(v['origin']),
    observedAt: text(v['observedAt']),
    presence: enumeration(v['presence'], ['installed', 'provisioned', 'indeterminate']),
    retained: boolean(v['retained']),
    mappingIds: ids(v['mappingIds']),
    standardIds: ids(v['standardIds']),
  }
}
export function detail(value: unknown): Detail {
  const v = closed(value, ['queryId', 'bucketId', 'devices', 'nextCursor'])
  return {
    queryId: uuid(v['queryId']),
    bucketId: uuid(v['bucketId']),
    devices: array(v['devices'], (x) => {
      const d = closed(x, ['id', 'name', 'verdict', 'evidence'])
      return {
        id: text(d['id']),
        name: text(d['name']),
        verdict: enumeration(d['verdict'], ['allowed', 'denied', 'unknown', 'disabled']),
        evidence: array(d['evidence'], evidence),
      }
    }),
    nextCursor: nullable(v['nextCursor'], uuid),
  }
}
