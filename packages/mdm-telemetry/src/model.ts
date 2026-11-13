import type { Numeric } from './numbers'
export const sources = [
  'manual',
  'mdm.windows',
  'mdm.apple',
  'agent.builtin',
  'agent.script',
  'agent.native',
  'agent.osquery',
] as const
export type Source = (typeof sources)[number]
export type Window = { readonly start: string; readonly end: string }
export type Metric =
  | { readonly kind: 'gauge'; readonly number: 'i64' | 'u64' | 'f64' }
  | {
      readonly kind: 'counter'
      readonly number: 'i64' | 'u64' | 'f64'
      readonly temporality: 'cumulative' | 'delta'
    }
  | { readonly kind: 'bool' }
  | { readonly kind: 'state'; readonly members: readonly string[] }
export interface Definition {
  readonly scope: { readonly tenant: string; readonly namespace: string }
  readonly key: string
  readonly version: string
  readonly unit: string
  readonly metric: Metric
  readonly dimensions: {
    readonly allowed: readonly string[]
    readonly required: readonly string[]
    readonly maxCount: number
    readonly maxValueBytes: number
    readonly maxTotalBytes: number
  }
}
export type Reading =
  | { readonly quality: 'missing' | 'failed' }
  | { readonly quality: 'valid'; readonly value: Numeric | boolean | string }
export interface Observation {
  readonly device: string
  readonly source: Source
  readonly epoch: string
  readonly receivedAt: string
  readonly liveSource: boolean
  readonly sourceConflict: boolean
  readonly sample: {
    readonly id: string
    readonly sequence: string
    readonly observedAt: string
    readonly interval: Window | null
    readonly reading: Reading
    readonly stream: {
      readonly scope: { readonly tenant: string; readonly namespace: string }
      readonly source: string
      readonly generation: string
    }
    readonly series: {
      readonly definition: Definition
      readonly subject: string
      readonly resource: string
      readonly dimensions: Readonly<Record<string, string>>
    }
  }
}
export interface HistoryQuery {
  readonly device: string
  readonly field: string
  readonly resource: string
  readonly startMicros: string
  readonly endMicros: string
  readonly maxPoints: number
  readonly mode: 'history' | 'latest'
  readonly after: string | null
}
export const operations = [
  'min',
  'max',
  'sum',
  'count',
  'mean',
  'increase',
  'rate',
  'timeline',
  'transitions',
  'coverage',
] as const
export type Aggregation = (typeof operations)[number]
export interface AggregateQuery {
  readonly query: HistoryQuery
  readonly definitionVersion: string
  readonly source: Source
  readonly epoch: string
  readonly dimensions: Readonly<Record<string, string>>
  readonly resolutionMicros: string
  readonly operation: Aggregation
  readonly coverage:
    | { readonly coverage: 'observedOnly' }
    | { readonly coverage: 'holdLast'; readonly maxHoldMicros: string }
  readonly maxGapMicros: string | null
}
export interface Unavailable {
  readonly selection:
    | {
        readonly selection: 'exact'
        readonly series: Observation['sample']['series']
        readonly stream: Observation['sample']['stream']
      }
    | {
        readonly selection: 'resource'
        readonly keys: readonly string[]
        readonly resource: string
        readonly scope: { readonly tenant: string; readonly namespace: string }
        readonly subject: string
      }
  readonly window: Window
  readonly reason: string
}
export type AggregateValue =
  | { readonly kind: 'number'; readonly value: Numeric }
  | { readonly kind: 'sum'; readonly value: Numeric }
  | { readonly kind: 'count'; readonly value: string }
  | { readonly kind: 'mean'; readonly sum: Numeric; readonly count: string }
  | { readonly kind: 'rate'; readonly increase: Numeric; readonly durationMicros: string }
  | { readonly kind: 'missing' }
  | {
      readonly kind: 'timeline'
      readonly segments: readonly { readonly value: boolean | string; readonly window: Window }[]
    }
  | {
      readonly kind: 'transitions'
      readonly transitions: readonly {
        readonly at: string
        readonly from: boolean | string
        readonly to: boolean | string
      }[]
    }
  | {
      readonly kind: 'coverage'
      readonly durations: readonly { readonly value: boolean | string; readonly micros: string }[]
    }
export interface Bucket {
  readonly window: Window
  readonly value: AggregateValue
  readonly validSamples: string
  readonly coveredMicros: string
  readonly completeness: readonly string[]
}
export interface HistoryPage {
  readonly rows: readonly Observation[]
  readonly unavailable: readonly Unavailable[]
  readonly next: string | null
  readonly retired: boolean
}
export interface AggregatePage {
  readonly buckets: readonly Bucket[]
  readonly unavailable: readonly Unavailable[]
  readonly resolutionMicros: string
  readonly refreshedThrough: string | null
  readonly next: string | null
}
export interface Configuration {
  readonly policyId: string
  readonly policyVersionId: string
  readonly resource: {
    readonly resource: string
    readonly version: string
    readonly variant: string
    readonly platform: 'windows' | 'macos'
    readonly architecture: 'x86_64' | 'aarch64'
  }
  readonly source: Source
  readonly projection: 'current' | 'history' | 'both'
  readonly sampleMillis: number
  readonly normalSampleMillis: number
  readonly boostExpiresAt: number | null
  readonly uploadMillis: number
  readonly supported: boolean
}
export interface Configurations {
  readonly device: string
  readonly evaluatedAtMicros: number
  readonly configurations: readonly Configuration[]
}
export interface Health {
  readonly batches: readonly {
    readonly batchId: string
    readonly receivedAt: number
    readonly firstObserved: number
    readonly lastObserved: number
    readonly delivery: string
    readonly qualityCounts: readonly number[]
  }[]
  readonly batchesTruncated: boolean
  readonly retentionTruncated: boolean
  readonly retired: boolean
  readonly retention: readonly {
    readonly resource: string
    readonly definitionVersion: number
    readonly dueAt: number
    readonly phase: number
    readonly progress: Readonly<Record<string, unknown>> | null
  }[]
}
export type GapCursor = { readonly receivedAt: number; readonly reportId: string } | null
export interface GapPage {
  readonly next: GapCursor
  readonly reports: readonly {
    readonly device: string
    readonly receivedAt: number
    readonly reportId: string
    readonly deviceId: string
    readonly createdAt: number
    readonly gaps: readonly {
      readonly reason: string
      readonly count: number
      readonly first: number
      readonly last: number
    }[]
  }[]
}
export interface TelemetryPort {
  configurations(device: string): Promise<Configurations>
  resources(
    device: string,
    field: string,
    after: string | null,
  ): Promise<{
    readonly resources: readonly string[]
    readonly nextAfter: string | null
    readonly retired: boolean
  }>
  history(query: HistoryQuery): Promise<HistoryPage>
  aggregate(query: AggregateQuery): Promise<AggregatePage>
  health(device: string, field: string, from: string, until: string): Promise<Health>
  gaps(device: string, from: string, until: string, after: GapCursor): Promise<GapPage>
}
