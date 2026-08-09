// ─── stores ──────────────────────────────────────────────────────────────────
export { useHealthStore, useObserveStore } from './stores'

// ─── composables ─────────────────────────────────────────────────────────────
export { useHealthPoll } from './composables'

// ─── api types ───────────────────────────────────────────────────────────────
export type {
  CellHealthEntry,
  HealthSummary,
  SliceHealth,
  CellHealthStatus,
  CellType,
  DurabilityMode,
  HealthCellsResponse,
} from './api/health'

export type {
  SystemInfoResponse,
  BuildInfo,
  RuntimeInfo,
  AssemblyInfo,
  EnvironmentInfo,
} from './api/system'

export type { MetricSeries, LogLine, TraceSummary, TimeRange } from './api/observe'

// ─── lib types ────────────────────────────────────────────────────────────────
export type { RangePreset } from './lib/timeRange'
export type { HealthVariant, HealthRollup } from './lib/healthStatus'
