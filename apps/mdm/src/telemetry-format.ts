import type { Aggregation, Observation } from '@rss/mdm-telemetry'
export function utcMicros(value: string | number): string {
  const exact = BigInt(value),
    micros = ((exact % 1000000n) + 1000000n) % 1000000n,
    seconds = (exact - micros) / 1000000n
  const millis = seconds * 1000n
  if (millis < -8640000000000000n || millis > 8640000000000000n) return `${value} µs UTC`
  const date = new Date(Number(millis))
  return date.toISOString().replace(/\.\d{3}Z$/, '.' + String(micros).padStart(6, '0') + 'Z')
}
export function parseUtc(value: string): string {
  const millis = Date.parse(value + 'Z')
  if (!Number.isSafeInteger(millis)) throw new Error('Invalid UTC time')
  return String(BigInt(millis) * 1000n)
}
export function secondsMicros(value: string): string {
  const parts = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value)
  if (!parts) throw new Error('Invalid microsecond duration')
  const micros = BigInt(parts[1]!) * 1000000n + BigInt((parts[2] ?? '').padEnd(6, '0'))
  if (micros <= 0n) throw new Error('Invalid microsecond duration')
  return String(micros)
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
  return `v${row.sample.series.definition.version} · ${row.device} · ${row.source} · ${row.epoch} · ${JSON.stringify(row.sample.series.dimensions)}`
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
  if (value === 'Cutoff')
    return locale === 'en'
      ? 'Retention cutoff does not cover the cleanup range'
      : '保留边界尚未覆盖清理范围'
  if (locale === 'en') return value
  return (
    (
      {
        accepted_batches_pending: '已接收的批次等待发布',
        budget_exceeded: '超过维护预算',
        PendingWrite: '等待写入',
        DirtySummary: '汇总待刷新',
        RestoreWindow: '处于恢复窗口',
        ReplayGuarantee: '需保留重放数据',
        StreamOpen: '数据流仍开放',
        RetainedData: '仍有保留数据',
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
  return String(current.version) === row.sample.series.definition.version
    ? valid.filter((v) => current.definition?.timeSeries?.aggregations.includes(v))
    : valid
}
