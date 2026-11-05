import type { Observation } from '@rss/mdm-telemetry'
import type { Locale } from './i18n'
import { labels } from './AdminUi'
import { utcMicros } from './telemetry-format'
/** Observed points only: no zero fill, cross-source join, interpolation or local aggregation. */
export function TelemetryChart({ rows, locale }: { rows: readonly Observation[]; locale: Locale }) {
  const l = labels(locale),
    points = rows.flatMap((r) =>
      r.sample.reading.quality === 'valid' && typeof r.sample.reading.value === 'number'
        ? [{ at: r.sample.observedAt, value: r.sample.reading.value }]
        : [],
    )
  if (!points.length) return null
  const from = Math.min(...points.map((p) => p.at)),
    until = Math.max(...points.map((p) => p.at)),
    low = Math.min(...points.map((p) => p.value)),
    high = Math.max(...points.map((p) => p.value)),
    unit = rows[0]?.sample.series.definition.unit ?? ''
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
          {high.toPrecision(4)}
        </text>
        <text x="4" y="160">
          {low.toPrecision(4)}
        </text>
        {points.map((p, i) => (
          <circle
            key={i}
            cx={50 + ((p.at - from) / Math.max(1, until - from)) * 640}
            cy={150 - ((p.value - low) / (high - low || 1)) * 125}
            r="3"
            className="telemetry-point"
          >
            <title>
              {utcMicros(p.at)} · {String(p.value)} {unit}
            </title>
          </circle>
        ))}
      </svg>
      <div className="telemetry-chart-times">
        <span>{utcMicros(from)}</span>
        <span>{utcMicros(until)}</span>
      </div>
    </figure>
  )
}
