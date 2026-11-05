import { useTelemetryRead } from './telemetry-read'
import { useState } from 'react'
import { Alert, Button, Card, Form, InputNumber, Select, Space, Tag } from 'antd'
import {
  aggregateSelection,
  seriesKey,
  type AggregateQuery,
  type AggregateValue,
  type HistoryQuery,
  type Unavailable,
} from '@rss/mdm-telemetry'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { labels, ReadState, Failure, validateInput } from './AdminUi'
import { useAdministration } from './useAdministration'
import { useSecretVisibility } from './SecretTabs'
import { DataTable } from './DataTable'
import {
  aggregationName,
  diagnosticName,
  allowedAggregations,
  seriesLabel,
  utcMicros,
} from './telemetry-format'
import { TelemetryChart } from './TelemetryChart'

export function TelemetryUnavailable({
  items,
  locale,
}: {
  items: readonly Unavailable[]
  locale: Locale
}) {
  const l = labels(locale)
  return items.length ? (
    <div className="telemetry-unavailable">
      <Alert
        type="warning"
        title={l(
          '部分时间范围不可用，不能按零值解读。',
          'Some intervals are unavailable; they are not zero values.',
        )}
      />
      <DataTable
        locale={locale}
        rowKey={(_, i) => String(i)}
        dataSource={items}
        columns={[
          {
            title: l('开始 / 结束（UTC）', 'Start / end (UTC)'),
            render: (_, r) => `${utcMicros(r.window.start)} – ${utcMicros(r.window.end)}`,
          },
          { title: l('原因', 'Reason'), render: (_, r) => diagnosticName(r.reason, locale) },
        ]}
      />
    </div>
  ) : null
}
function AggregateResults({
  runtime,
  locale,
  request,
  unit,
}: {
  runtime: Runtime
  locale: Locale
  request: AggregateQuery
  unit: string
}) {
  const l = labels(locale),
    { telemetry, binding } = useAdministration(runtime),
    [after, setAfter] = useState<string | null>(null),
    query = { ...request, query: { ...request.query, after } },
    read = useTelemetryRead(`${binding}/aggregate/${JSON.stringify(query)}`, () =>
      telemetry.aggregate(query),
    )
  return (
    <Card title={l('服务端聚合', 'Server aggregation')} className="telemetry-aggregate">
      <Space wrap>
        <Tag>{aggregationName(request.operation, locale)}</Tag>
        <span>{l('仅统计已观察数据', 'Observed data only')}</span>
        <Button onClick={read.reload}>{l('重新读取聚合', 'Read aggregation again')}</Button>
      </Space>
      <ReadState
        locale={locale}
        busy={read.busy}
        error={read.error}
        empty={read.value?.buckets.length === 0}
      />
      {read.value && (
        <>
          <p className="subtitle">
            {l('聚合刷新水位（UTC）', 'Aggregate refresh watermark (UTC)')} ·{' '}
            {read.value.refreshedThrough === null
              ? l('尚未提供', 'Not provided')
              : utcMicros(read.value.refreshedThrough)}
          </p>
          <TelemetryUnavailable items={read.value.unavailable} locale={locale} />
          <DataTable
            locale={locale}
            rowKey={(r) => String(r.window.start)}
            dataSource={read.value.buckets}
            columns={[
              {
                title: l('时间段（UTC）', 'Interval (UTC)'),
                render: (_, r) => `${utcMicros(r.window.start)} – ${utcMicros(r.window.end)}`,
              },
              {
                title: l('聚合结果', 'Aggregate value'),
                render: (_, r) => (
                  <AggregateReading
                    value={r.value}
                    unit={
                      request.operation === 'rate'
                        ? unit + '/s'
                        : request.operation === 'count'
                          ? ''
                          : unit
                    }
                    locale={locale}
                  />
                ),
              },
              { title: l('有效样本', 'Valid samples'), dataIndex: 'validSamples' },
              {
                title: l('已覆盖 / 桶时长（微秒）', 'Covered / bucket duration (µs)'),
                render: (_, r) => `${r.coveredMicros} / ${r.window.end - r.window.start}`,
              },
              {
                title: l('完整性', 'Completeness'),
                render: (_, r) =>
                  r.completeness.length
                    ? r.completeness.map((v) => diagnosticName(v, locale)).join(' · ')
                    : r.coveredMicros < r.window.end - r.window.start
                      ? l('覆盖不足', 'Insufficient coverage')
                      : l('已覆盖', 'Covered'),
              },
            ]}
          />
          <Space wrap>
            {read.value.next && (
              <Button onClick={() => setAfter(read.value!.next)}>
                {l('下一页聚合', 'Next aggregate page')}
              </Button>
            )}
            {after && (
              <Button onClick={() => setAfter(null)}>
                {l('聚合首页', 'First aggregate page')}
              </Button>
            )}
          </Space>
        </>
      )}
      {!!read.error && after && (
        <Button onClick={() => setAfter(null)}>
          {l('从首页重新查询', 'Restart from first page')}
        </Button>
      )}
    </Card>
  )
}
export function TelemetryResults({
  runtime,
  locale,
  query,
}: {
  runtime: Runtime
  locale: Locale
  query: HistoryQuery
}) {
  const l = labels(locale),
    { telemetry, binding } = useAdministration(runtime),
    visible = useSecretVisibility(),
    [after, setAfter] = useState<string | null>(null),
    read = useTelemetryRead(
      `${binding}/telemetry-history/${visible}/${JSON.stringify(query)}/${after}`,
      () => (visible ? telemetry.history({ ...query, after }) : Promise.resolve(null)),
    ),
    [selection, setSelection] = useState(''),
    [operation, setOperation] = useState<AggregateQuery['operation']>('mean'),
    [resolution, setResolution] = useState(300),
    [gap, setGap] = useState<number | null>(300),
    [aggregate, setAggregate] = useState<AggregateQuery | null>(null),
    [error, setError] = useState<unknown>(null),
    rows = read.value?.rows ?? [],
    series = [...new Map(rows.map((row) => [seriesKey(row), row])).values()],
    selected = series.find((row) => seriesKey(row) === selection),
    choices = selected ? allowedAggregations(selected) : []
  function reset() {
    setAggregate(null)
    setSelection('')
    setError(null)
  }
  if (!visible) return null
  return (
    <>
      <Card
        title={l('查询结果', 'Query results')}
        className="telemetry-results"
        extra={
          <Button
            onClick={() => {
              reset()
              read.reload()
            }}
          >
            {l('重新读取数据', 'Read data again')}
          </Button>
        }
      >
        <p className="subtitle">
          {query.mode === 'latest'
            ? l(
                '最新值由服务端按当前来源选择；观察时间不代表当前在线。',
                'The server selects latest values using current sources. Observation time does not assert current availability.',
              )
            : l(
                '历史值保留原注册、来源与定义版本。每页单独展示，不跨缺口插值。',
                'Historical values retain their registration, source and definition. Pages are shown separately, without interpolation across gaps.',
              )}
        </p>
        <ReadState
          locale={locale}
          busy={read.busy}
          error={read.error}
          empty={read.value?.rows.length === 0}
        />
        {read.value && (
          <>
            {read.value.retired && (
              <Alert
                type="warning"
                title={l(
                  '字段已退休。这里只显示仍保留的观察。',
                  'Field retired. Only retained observations are shown.',
                )}
              />
            )}
            <TelemetryUnavailable items={read.value.unavailable} locale={locale} />
            <Form.Item label={l('精确序列与维度', 'Exact series and dimensions')}>
              <Select
                aria-label={l('精确序列与维度', 'Exact series and dimensions')}
                value={selection || null}
                placeholder={l('选择一个真实序列', 'Choose an observed series')}
                options={series.map((row) => ({ value: seriesKey(row), label: seriesLabel(row) }))}
                onChange={(value) => {
                  setSelection(value)
                  setAggregate(null)
                  setError(null)
                  const row = series.find((r) => seriesKey(r) === value)
                  setOperation(row ? (allowedAggregations(row)[0] ?? 'mean') : 'mean')
                }}
              />
            </Form.Item>
            {selected && (
              <>
                <p className="telemetry-coordinate">
                  <code>{seriesLabel(selected)}</code>
                </p>
                <TelemetryChart
                  rows={rows.filter((r) => seriesKey(r) === selection)}
                  locale={locale}
                />
              </>
            )}
            <DataTable
              locale={locale}
              rowKey={(r) => JSON.stringify([seriesKey(r), r.sample.id, r.sample.sequence])}
              dataSource={selection ? rows.filter((r) => seriesKey(r) === selection) : rows}
              columns={[
                {
                  title: l('观察时间（UTC）', 'Observed (UTC)'),
                  render: (_, r) => utcMicros(r.sample.observedAt),
                },
                {
                  title: l('接收时间（UTC）', 'Received (UTC)'),
                  render: (_, r) => utcMicros(r.receivedAt),
                },
                {
                  title: l('值 / 单位', 'Value / unit'),
                  render: (_, r) =>
                    r.sample.reading.quality === 'valid'
                      ? `${String(r.sample.reading.value)} ${r.sample.series.definition.unit}`
                      : r.sample.reading.quality === 'missing'
                        ? l('缺失', 'Missing')
                        : l('采集失败', 'Collection failed'),
                },
                {
                  title: l('来源状态', 'Source state'),
                  render: (_, r) => (
                    <Space wrap>
                      <Tag color={r.liveSource ? 'success' : 'warning'}>
                        {r.liveSource
                          ? l('当前来源', 'Current source')
                          : l('旧来源', 'Historical source')}
                      </Tag>
                      {r.sourceConflict && (
                        <Tag color="warning">{l('来源冲突', 'Source conflict')}</Tag>
                      )}
                    </Space>
                  ),
                },
                {
                  title: l('精确坐标', 'Exact coordinates'),
                  render: (_, r) => (
                    <details>
                      <summary>{`v${r.sample.series.definition.version} · ${r.source}`}</summary>
                      <code className="telemetry-coordinate">{seriesLabel(r)}</code>
                    </details>
                  ),
                },
              ]}
            />
            <Space wrap>
              {query.mode === 'history' && read.value.next && (
                <Button
                  onClick={() => {
                    reset()
                    setAfter(read.value!.next)
                  }}
                >
                  {l('下一页观察', 'Next observations')}
                </Button>
              )}
              {after && (
                <Button
                  onClick={() => {
                    reset()
                    setAfter(null)
                  }}
                >
                  {l('观察首页', 'First observations')}
                </Button>
              )}
            </Space>
            {selected && (
              <Form
                className="telemetry-aggregate-form"
                layout="vertical"
                onFinish={() => {
                  setError(null)
                  setAggregate(null)
                  try {
                    let request!: AggregateQuery
                    validateInput(() => {
                      request = aggregateSelection(
                        query,
                        selected,
                        operation,
                        resolution * 1_000_000,
                        gap === null ? null : gap * 1_000_000,
                      )
                    })
                    setAggregate(request)
                  } catch (e) {
                    setError(e)
                  }
                }}
              >
                <h3>{l('查询此序列的服务端聚合', 'Query server aggregation for this series')}</h3>
                <div className="admin-form-grid">
                  <Form.Item label={l('聚合含义', 'Aggregation')}>
                    <Select
                      aria-label={l('聚合含义', 'Aggregation')}
                      value={operation}
                      options={choices.map((value) => ({
                        value,
                        label: aggregationName(value, locale),
                      }))}
                      onChange={(v) => {
                        setOperation(v)
                        setAggregate(null)
                      }}
                    />
                  </Form.Item>
                  <Form.Item label={l('分辨率（秒）', 'Resolution (seconds)')}>
                    <InputNumber
                      min={1}
                      value={resolution}
                      onChange={(v) => {
                        setResolution(v ?? 300)
                        setAggregate(null)
                      }}
                    />
                  </Form.Item>
                  <Form.Item
                    label={l(
                      '最大连续间隔（秒，空为无上限）',
                      'Maximum gap (seconds, empty for unbounded)',
                    )}
                  >
                    <InputNumber
                      min={1}
                      value={gap}
                      onChange={(v) => {
                        setGap(v)
                        setAggregate(null)
                      }}
                    />
                  </Form.Item>
                </div>
                <Button htmlType="submit">{l('查询聚合', 'Query aggregation')}</Button>
              </Form>
            )}
          </>
        )}
        {!!read.error && after && (
          <Button
            onClick={() => {
              reset()
              setAfter(null)
            }}
          >
            {l('从首页重新查询', 'Restart from first page')}
          </Button>
        )}
        <Failure locale={locale} error={error} kind="read" />
      </Card>
      {aggregate && read.value && (
        <AggregateResults
          key={JSON.stringify(aggregate)}
          runtime={runtime}
          locale={locale}
          request={aggregate}
          unit={selected?.sample.series.definition.unit ?? ''}
        />
      )}
    </>
  )
}

function AggregateReading({
  value,
  unit,
  locale,
}: {
  value: AggregateValue
  unit: string
  locale: Locale
}) {
  const l = labels(locale)
  if (value.kind === 'missing') return l('无数据', 'No data')
  if (value.kind === 'number') return `${value.value} ${unit}`
  if (value.kind === 'timeline')
    return (
      <ul>
        {value.segments.map((v, i) => (
          <li key={i}>
            {String(v.value)} · {utcMicros(v.window.start)} – {utcMicros(v.window.end)}
          </li>
        ))}
      </ul>
    )
  if (value.kind === 'transitions')
    return (
      <ul>
        {value.transitions.map((v, i) => (
          <li key={i}>
            {utcMicros(v.at)} · {String(v.from)} → {String(v.to)}
          </li>
        ))}
      </ul>
    )
  return (
    <ul>
      {value.durations.map((v, i) => (
        <li key={i}>
          {String(v.value)} · {v.micros} {l('微秒', 'µs')}
        </li>
      ))}
    </ul>
  )
}
