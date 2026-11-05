import { useTelemetryRead } from './telemetry-read'
import { useState } from 'react'
import { Alert, Button, Card, Collapse, Form, Input, InputNumber, Select, Space } from 'antd'
import type { HistoryQuery } from '@rss/mdm-telemetry'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { labels, ReadState, Failure, validateInput } from './AdminUi'
import { useAdministration } from './useAdministration'
import { useSecretVisibility } from './SecretTabs'
import { TelemetryResults } from './TelemetryResults'
import { TelemetryHealth } from './TelemetryHealth'
import { parseUtc } from './telemetry-format'

export function TelemetryQuery({
  runtime,
  locale,
  device,
  canFields,
}: {
  runtime: Runtime
  locale: Locale
  device: string
  canFields: boolean
}) {
  const l = labels(locale),
    { telemetry, inventory, binding } = useAdministration(runtime),
    visible = useSecretVisibility(),
    [field, setField] = useState(''),
    [resource, setResource] = useState(''),
    [catalogAfter, setCatalogAfter] = useState<string | null>(null),
    [resourceAfter, setResourceAfter] = useState<string | null>(null),
    fields = useTelemetryRead(`${binding}/telemetry-fields/${visible}/${catalogAfter}`, () =>
      visible && canFields
        ? inventory.fields({ limit: 50, ...(catalogAfter ? { cursor: catalogAfter } : {}) })
        : Promise.resolve(null),
    ),
    resources = useTelemetryRead(
      `${binding}/telemetry-resources/${visible}/${device}/${field}/${resourceAfter}`,
      () =>
        visible && field
          ? telemetry.resources(device, field, resourceAfter)
          : Promise.resolve(null),
    ),
    [end, setEnd] = useState(new Date().toISOString().slice(0, 19)),
    [start, setStart] = useState(new Date(Date.now() - 3600000).toISOString().slice(0, 19)),
    [mode, setMode] = useState<'history' | 'latest'>('history'),
    [maxPoints, setMaxPoints] = useState(200),
    [query, setQuery] = useState<HistoryQuery | null>(null),
    [error, setError] = useState<unknown>(null)
  function resetField(value: string) {
    setField(value)
    setResource('')
    setResourceAfter(null)
    setQuery(null)
  }
  if (!visible) return null
  return (
    <div className="admin-stack">
      <Card title={l('观察数据', 'Observations')}>
        <Form
          layout="vertical"
          onFinish={() => {
            setQuery(null)
            setError(null)
            try {
              let from = 0,
                until = 0
              validateInput(() => {
                from = parseUtc(start)
                until = parseUtc(end)
                if (from >= until) throw new Error('Invalid window')
              })
              setQuery({
                device,
                field,
                resource,
                startMicros: from,
                endMicros: until,
                maxPoints,
                mode,
                after: null,
              })
            } catch (e) {
              setError(e)
            }
          }}
        >
          <div className="admin-form-grid">
            <Form.Item label={l('字段键', 'Field key')}>
              <Input
                aria-label={l('字段键', 'Field key')}
                value={field}
                onChange={(e) => resetField(e.target.value)}
                autoComplete="off"
              />
            </Form.Item>
            <Form.Item label={l('序列资源', 'Series resource')}>
              <Input
                aria-label={l('序列资源', 'Series resource')}
                value={resource}
                onChange={(e) => {
                  setResource(e.target.value)
                  setQuery(null)
                }}
                autoComplete="off"
              />
            </Form.Item>
            <Form.Item label={l('开始时间（UTC）', 'Start (UTC)')}>
              <Input
                type="datetime-local"
                step="1"
                aria-label={l('开始时间（UTC）', 'Start (UTC)')}
                value={start}
                onChange={(e) => {
                  setStart(e.target.value)
                  setQuery(null)
                }}
              />
            </Form.Item>
            <Form.Item label={l('结束时间（UTC，不含）', 'End (UTC, exclusive)')}>
              <Input
                type="datetime-local"
                step="1"
                aria-label={l('结束时间（UTC，不含）', 'End (UTC, exclusive)')}
                value={end}
                onChange={(e) => {
                  setEnd(e.target.value)
                  setQuery(null)
                }}
              />
            </Form.Item>
            <Form.Item label={l('查询模式', 'Query mode')}>
              <Select
                aria-label={l('查询模式', 'Query mode')}
                value={mode}
                options={[
                  { value: 'history', label: l('历史观察', 'Historical observations') },
                  { value: 'latest', label: l('最新有效来源', 'Latest effective source') },
                ]}
                onChange={(v) => {
                  setMode(v)
                  setQuery(null)
                }}
              />
            </Form.Item>
            <Form.Item label={l('每页点数上限', 'Maximum points per page')}>
              <InputNumber
                min={1}
                max={10000}
                value={maxPoints}
                onChange={(v) => {
                  setMaxPoints(v ?? 200)
                  setQuery(null)
                }}
              />
            </Form.Item>
          </div>
          <Button type="primary" htmlType="submit" disabled={!field || !resource}>
            {l('查询已上报数据', 'Query reported data')}
          </Button>
        </Form>
        <Failure locale={locale} error={error} kind="read" />
        <Collapse
          items={[
            {
              key: 'discovery',
              label: l('字段与资源目录', 'Field and resource directory'),
              children: (
                <div className="admin-stack">
                  <ReadState locale={locale} busy={fields.busy} error={fields.error} />
                  <Space wrap>
                    {fields.value?.items
                      .filter((f) => f.timeSeries)
                      .map((f) => (
                        <Button key={f.key} onClick={() => resetField(f.key)}>
                          {f.key}
                        </Button>
                      ))}
                  </Space>
                  {fields.value?.nextCursor && (
                    <Button onClick={() => setCatalogAfter(fields.value!.nextCursor)}>
                      {l('下一页字段', 'Next fields')}
                    </Button>
                  )}
                  <ReadState locale={locale} busy={resources.busy} error={resources.error} />
                  <Space wrap>
                    {resources.value?.resources.map((r) => (
                      <Button
                        key={r}
                        onClick={() => {
                          setResource(r)
                          setQuery(null)
                        }}
                      >
                        {r}
                      </Button>
                    ))}
                  </Space>
                  {resources.value?.retired && (
                    <Alert
                      type="warning"
                      title={l(
                        '字段已退休；历史数据按保留策略提供。',
                        'Field retired; historical data follows retention policy.',
                      )}
                    />
                  )}
                  {catalogAfter && (
                    <Button onClick={() => setCatalogAfter(null)}>
                      {l('字段首页', 'First fields')}
                    </Button>
                  )}
                  {resourceAfter && (
                    <Button onClick={() => setResourceAfter(null)}>
                      {l('资源首页', 'First resources')}
                    </Button>
                  )}
                  {resources.value?.nextAfter && (
                    <Button onClick={() => setResourceAfter(resources.value!.nextAfter)}>
                      {l('下一页资源', 'Next resources')}
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>
      {query && (
        <div key={JSON.stringify(query)} className="admin-stack">
          <TelemetryResults runtime={runtime} locale={locale} query={query} />
          <TelemetryHealth runtime={runtime} locale={locale} query={query} />
        </div>
      )}
    </div>
  )
}
