import type { Observation, Numeric } from '@rss/mdm-telemetry'
import { numericText } from '@rss/mdm-telemetry'
import type { Locale } from './i18n'
import { labels } from './AdminUi'
import { utcMicros } from './telemetry-format'
/** Observed points only. Integer differences precede the bounded screen projection. */
export function TelemetryChart({ rows, locale }: { rows: readonly Observation[]; locale: Locale }) {
  const l = labels(locale),
    points = rows.flatMap((row) =>
      row.sample.reading.quality === 'valid' && typeof row.sample.reading.value === 'object'
        ? [{ at: BigInt(row.sample.observedAt), value: row.sample.reading.value }]
        : [],
    )
  if (!points.length) return null
  const float = points[0]!.value.type === 'f64'
  if (points.some((point) => (point.value.type === 'f64') !== float))
    throw new Error('Mixed telemetry numeric series')
  const compare = (a: Numeric, b: Numeric) =>
    float
      ? Number(a.value) - Number(b.value)
      : BigInt(a.value) < BigInt(b.value)
        ? -1
        : BigInt(a.value) > BigInt(b.value)
          ? 1
          : 0
  const low = points.reduce((a, b) => (compare(a.value, b.value) < 0 ? a : b)).value,
    high = points.reduce((a, b) => (compare(a.value, b.value) > 0 ? a : b)).value
  const from = points.reduce((a, b) => (a < b.at ? a : b.at), points[0]!.at),
    until = points.reduce((a, b) => (a > b.at ? a : b.at), from)
  const ratio = (n: bigint, d: bigint) => (d === 0n ? 0 : Number((n * 1000000n) / d) / 1000000)
  const y = (value: Numeric) =>
    float
      ? (Number(value.value) / 2 - Number(low.value) / 2) /
        (Number(high.value) / 2 - Number(low.value) / 2 || 1)
      : ratio(BigInt(value.value) - BigInt(low.value), BigInt(high.value) - BigInt(low.value))
  const unit = rows[0]?.sample.series.definition.unit ?? ''
  return (
    <figure className="telemetry-chart">
      <figcaption>
        {l('已观察采样点', 'Observed samples')} · {unit}
      </figcaption>
      <svg
        viewBox="0 0 720 200"
        role="img"
        aria-label={l(
          '当前页数值观察散点图；精确值见下方表格',
          'Numeric observations on this page; exact values are in the table below',
        )}
      >
        <path d="M50 12V165H700" className="telemetry-axis" />
        <text x="4" y="22">
          {numericText(high)}
        </text>
        <text x="4" y="160">
          {numericText(low)}
        </text>
        {points.map((point, i) => (
          <circle
            key={i}
            cx={50 + ratio(point.at - from, until - from) * 640}
            cy={150 - y(point.value) * 125}
            r="3"
            className="telemetry-point"
          >
            <title>
              {utcMicros(String(point.at))} · {numericText(point.value)} {unit}
            </title>
          </circle>
        ))}
      </svg>
      <div className="telemetry-chart-times">
        <span>{utcMicros(String(from))}</span>
        <span>{utcMicros(String(until))}</span>
      </div>
    </figure>
  )
}
