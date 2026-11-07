import type { DeviceRef, Page, WindowQuery } from '@rss/mdm-devices'
import { freeze, operation, uuid, validateQuery } from './authoring'
import type { AssetContext, Operation, QueryDefinition } from './model'

export const risks = ['low', 'medium', 'high'] as const
export type Risk = (typeof risks)[number]
export const dimensions = [
  'version',
  'component',
  'publisher',
  'platform',
  'os',
  'architecture',
  'device_group',
] as const
export type Dimension = (typeof dimensions)[number]
export const sources = [
  'device.software.installations',
  'device.software.windows.win32',
  'device.software.windows.store',
  'device.software.windows.non_store',
  'device.software.windows.system',
  'device.software.apple.installed_applications',
] as const
export interface Assessment {
  threshold: number | null
  allowedGroups: string[] | null
}
export interface StandardSoftware {
  name: string
  risk: Risk
  tags: string[]
  assessments: { endpoint: Assessment; associatedDevice: Assessment }
}
export interface SoftwareMapping {
  standard: string
  enabled: boolean
  source: (typeof sources)[number]
  platform: 'windows' | 'macos'
  origin: string | null
  filter: string
}
export interface SoftwareRecord<T> {
  id: string
  revision: number
  definition: T | null
}
export type SoftwareChange<T> = { action: 'put'; definition: T } | { action: 'delete' }
export interface SoftwareQuery {
  context: AssetContext
  devices: Pick<QueryDefinition, 'filter' | 'scope'>
  groups: { combine: 'union' | 'intersection'; ids: string[] } | null
  software: { standards: string[]; risks: Risk[]; tags: string[]; filter: string | null }
  dimensions: Dimension[]
}
export type SoftwareMutation =
  | { kind: 'query'; operation: Operation<SoftwareQuery> }
  | { kind: 'release'; id: string; operation: Operation<Record<string, never>> }
  | { kind: 'standard'; id: string; operation: Operation<SoftwareChange<StandardSoftware>> }
  | { kind: 'mapping'; id: string; operation: Operation<SoftwareChange<SoftwareMapping>> }
export type SoftwareReceipt =
  | { kind: 'written'; resource: string; id: string; revision: number }
  | { kind: 'accepted'; task: string; statusUrl: string }
  | { kind: 'release_requested'; task: string }

export interface SoftwareTask {
  task: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  resultState: 'retained' | 'releasing' | 'released'
  failure: string | null
  context: AssetContext
  coordinate: string
  asOf: number
  processed: number
  unknown: number
}
type ResultPage<T> = Page<T> & { task: string; coordinate: string }
export type SoftwareIdentity =
  | { kind: 'standard'; id: string; name: string; risk: Risk; tags: readonly string[] }
  | {
      kind: 'unmapped'
      name: string
      source: string
      native_id: string
      publisher: string
      platform: string
    }
  | { kind: 'conflict'; name: string; candidates: readonly string[]; rules: readonly string[] }
export type Compliance = 'disabled' | 'compliant' | 'non_compliant' | 'unknown'
export interface SoftwareBucket {
  id: string
  identity: SoftwareIdentity
  devices: number
  assessmentDevices: number
  threshold: number | null
  thresholdState: 'disabled' | 'below' | 'reached' | 'unknown'
  compliance: { disabled: number; compliant: number; nonCompliant: number; unknown: number }
}
export interface SoftwareDevice {
  object: DeviceRef
  compliance: Compliance
  groupDecisions: Readonly<Record<string, 'match' | 'no_match' | 'unknown'>>
}
export interface SoftwareEvidence {
  endpoint: string
  source: string
  evidence: {
    observedAt: number
    snapshotId: string
    scope: unknown
    registration: string | null
    epoch: string | null
  }
  arrayVersion: string
  ordinal: number
  value: unknown
  precisionLimited: boolean
  rules: readonly string[]
  confirmed: boolean
}
export interface SoftwareQuality {
  endpoint: string
  source: string
  state: { kind: 'known' | 'unknown' | 'missing' | 'null' | 'deleted' | 'unsupported' | 'conflict' }
  scope: unknown
  lastKnown: readonly {
    count: number
    evidence: SoftwareEvidence['evidence']
    arrayVersion: string
  }[]
  runs: readonly unknown[]
}
export interface SoftwareCoverage {
  object: DeviceRef
  matched: boolean
  unknown: boolean
  quality: readonly SoftwareQuality[]
}
export interface SoftwareAssetsPort {
  standards(
    page: WindowQuery,
    signal?: AbortSignal,
  ): Promise<Page<SoftwareRecord<StandardSoftware>>>
  standard(id: string, signal?: AbortSignal): Promise<SoftwareRecord<StandardSoftware>>
  mappings(page: WindowQuery, signal?: AbortSignal): Promise<Page<SoftwareRecord<SoftwareMapping>>>
  mapping(id: string, signal?: AbortSignal): Promise<SoftwareRecord<SoftwareMapping>>
  mutate(intent: SoftwareMutation): Promise<SoftwareReceipt>
  receipt(operationId: string): Promise<SoftwareReceipt | null>
  status(task: string, signal?: AbortSignal): Promise<SoftwareTask>
  buckets(
    task: string,
    page: WindowQuery,
    signal?: AbortSignal,
  ): Promise<ResultPage<SoftwareBucket>>
  breakdowns(
    task: string,
    bucket: string,
    dimension: Dimension,
    page: WindowQuery,
    signal?: AbortSignal,
  ): Promise<ResultPage<{ value: string; devices: number }>>
  devices(
    task: string,
    bucket: string,
    page: WindowQuery,
    signal?: AbortSignal,
  ): Promise<ResultPage<SoftwareDevice>>
  evidence(
    task: string,
    bucket: string,
    object: DeviceRef,
    page: WindowQuery,
    signal?: AbortSignal,
  ): Promise<ResultPage<SoftwareEvidence> & { quality: readonly SoftwareQuality[] }>
  coverage(
    task: string,
    page: WindowQuery,
    signal?: AbortSignal,
  ): Promise<ResultPage<SoftwareCoverage>>
}

function matchReceipt(intent: SoftwareMutation, receipt: SoftwareReceipt) {
  const match =
    intent.kind === 'query'
      ? receipt.kind === 'accepted' && receipt.task === intent.operation.operationId
      : intent.kind === 'release'
        ? receipt.kind === 'release_requested' && receipt.task === intent.id
        : receipt.kind === 'written' &&
          receipt.resource === intent.kind &&
          receipt.id === intent.id &&
          receipt.revision === intent.operation.expectedRevision + 1
  if (!match) throw new Error('Wrong software asset operation receipt')
  return receipt
}
function fixed<T extends { task: string; coordinate: string }>(task: SoftwareTask, result: T): T {
  if (result.task !== task.task || result.coordinate !== task.coordinate)
    throw { cause: 'client', status: 409, code: 'configuration_changed' }
  return result
}
export function createSoftwareAssets(port: SoftwareAssetsPort) {
  return Object.freeze({
    standards: port.standards,
    standard: (id: string, signal?: AbortSignal) => port.standard(uuid(id), signal),
    mappings: port.mappings,
    mapping: (id: string, signal?: AbortSignal) => port.mapping(uuid(id), signal),
    async status(id: string, signal?: AbortSignal) {
      const result = await port.status(uuid(id), signal)
      if (result.task !== id) throw new Error('Wrong software task')
      return result
    },
    async mutate(intent: SoftwareMutation) {
      operation<unknown>(intent.operation)
      if (intent.kind === 'query')
        validateQuery({ ...intent.operation.input.devices, fields: [], sort: [] })
      else uuid(intent.id)
      return matchReceipt(intent, await port.mutate(freeze(intent)))
    },
    async receipt(intent: SoftwareMutation) {
      const result = await port.receipt(uuid(intent.operation.operationId))
      return result && matchReceipt(intent, result)
    },
    async buckets(task: SoftwareTask, page: WindowQuery, signal?: AbortSignal) {
      return fixed(task, await port.buckets(task.task, page, signal))
    },
    async breakdowns(
      task: SoftwareTask,
      bucket: string,
      dimension: Dimension,
      page: WindowQuery,
      signal?: AbortSignal,
    ) {
      return fixed(task, await port.breakdowns(task.task, bucket, dimension, page, signal))
    },
    async devices(task: SoftwareTask, bucket: string, page: WindowQuery, signal?: AbortSignal) {
      return fixed(task, await port.devices(task.task, bucket, page, signal))
    },
    async evidence(
      task: SoftwareTask,
      bucket: string,
      object: DeviceRef,
      page: WindowQuery,
      signal?: AbortSignal,
    ) {
      return fixed(task, await port.evidence(task.task, bucket, object, page, signal))
    },
    async coverage(task: SoftwareTask, page: WindowQuery, signal?: AbortSignal) {
      return fixed(task, await port.coverage(task.task, page, signal))
    },
  })
}
