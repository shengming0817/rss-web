import type { Aggregation, Observation } from '@rss/mdm-telemetry'
export function utcMicros(value: number): string {
  const millis = new Date(Math.floor(value / 1000)).toISOString(),
    micros = ((value % 1000) + 1000) % 1000
  return millis.slice(0, -1) + String(micros).padStart(3, '0') + 'Z'
}
export function parseUtc(value: string): number {
  const n = Date.parse(value + 'Z') * 1000
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid UTC time')
  return n
}
export function allowedAggregations(row: Observation): readonly Aggregation[] {
  const metric = row.sample.series.definition.metric
  return metric.kind === 'bool' || metric.kind === 'state'
    ? ['timeline', 'transitions', 'coverage']
    : metric.kind === 'counter'
      ? metric.temporality === 'cumulative'
        ? ['increase', 'rate']
        : ['sum', 'rate']
      : ['min', 'max', 'sum', 'count', 'mean']
}
export function seriesLabel(row: Observation): string {
  return `v${row.sample.series.definition.version} · ${row.registration} · ${row.source} · ${row.epoch} · ${JSON.stringify(row.sample.series.dimensions)}`
}

export function aggregationName(value: Aggregation, locale: 'zh' | 'en'): string {
  if (locale === 'en') return value
  return {
    min: '最小值',
    max: '最大值',
    sum: '合计',
    count: '样本数',
    mean: '平均值',
    increase: '计数增量',
    rate: '每秒速率',
    timeline: '状态时间线',
    transitions: '状态变化',
    coverage: '状态持续时间',
  }[value]
}
export function diagnosticName(value: string, locale: 'zh' | 'en'): string {
  if (locale === 'en') return value
  return (
    (
      {
        Expired: '已过期',
        expired: '缓冲已过期',
        capacity: '容量不足',
        lease: '采样租约已过期',
        power: '电源策略暂停',
        suspended: '休眠或调度延迟',
        clock: '时钟不连续',
        collection: '采集不可用',
        rejected: '批次被拒绝',
        registration: '注册代次已退休',
        configuration: '配置已替换或撤回',
        Gaps: '有缺口',
        Overlap: '区间重叠',
        ResetBoundary: '计数器重置边界',
        Boundary: '边界不完整',
      } as Record<string, string>
    )[value] ?? value
  )
}

/** Current directory restrictions cannot replace an observation's frozen definition. */
export function queryAggregations(
  row: Observation,
  current: {
    readonly version: number
    readonly definition: {
      readonly timeSeries: { readonly aggregations: readonly Aggregation[] } | null
    } | null
  },
): readonly Aggregation[] {
  const valid = allowedAggregations(row)
  return current.version === row.sample.series.definition.version
    ? valid.filter((v) => current.definition?.timeSeries?.aggregations.includes(v))
    : valid
}
