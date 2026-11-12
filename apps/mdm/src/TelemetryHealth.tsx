import { useTelemetryRead } from './telemetry-read'
import { useState } from 'react'
import { Alert, Button, Card, Space } from 'antd'
import type { GapCursor, HistoryQuery } from '@rss/mdm-telemetry'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { labels, ReadState } from './AdminUi'
import { useAdministration } from './useAdministration'
import { DataTable } from './DataTable'
import { diagnosticName, utcMicros } from './telemetry-format'
export function TelemetryHealth({
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
    [after, setAfter] = useState<GapCursor>(null),
    health = useTelemetryRead(`${binding}/telemetry-health/${JSON.stringify(query)}`, () =>
      telemetry.health(query.device, query.field, query.startMicros, query.endMicros),
    ),
    gaps = useTelemetryRead(
      `${binding}/telemetry-gaps/${JSON.stringify(query)}/${JSON.stringify(after)}`,
      () => telemetry.gaps(query.device, query.startMicros, query.endMicros, after),
    )
  return (
    <div className="telemetry-health-grid">
      <Card
        title={l('接收健康', 'Reception health')}
        extra={<Button onClick={health.reload}>{l('重读健康', 'Read health again')}</Button>}
      >
        <p className="subtitle">
          {l(
            '按所选接收时间范围读取批次；接收时间与观察时间不同。',
            'Batches in the selected reception window. Reception time differs from observation time.',
          )}
        </p>
        <ReadState
          locale={locale}
          busy={health.busy}
          error={health.error}
          empty={health.value?.batches.length === 0}
        />
        {health.value && (
          <>
            <Space wrap>
              {(health.value.batchesTruncated || health.value.retentionTruncated) && (
                <Alert type="warning" title={l('返回结果已截断', 'Results truncated')} />
              )}
              {health.value.retired && (
                <Alert type="warning" title={l('字段已退休', 'Field retired')} />
              )}
            </Space>
            <DataTable
              locale={locale}
              rowKey="batchId"
              dataSource={health.value.batches}
              columns={[
                {
                  title: l('接收（UTC）', 'Received (UTC)'),
                  render: (_, r) => utcMicros(r.receivedAt),
                },
                {
                  title: l('有效 / 缺失 / 失败', 'Valid / missing / failed'),
                  render: (_, r) => r.qualityCounts.join(' / '),
                },
                { title: l('上传状态', 'Delivery'), dataIndex: 'delivery' },
              ]}
            />
            {health.value.retention.length > 0 && (
              <details>
                <summary>{l('保留与清理状态', 'Retention and cleanup')}</summary>
                <DataTable
                  locale={locale}
                  rowKey={(r) => `${r.resource}/${r.definitionVersion}`}
                  dataSource={health.value.retention}
                  columns={[
                    { title: l('资源', 'Resource'), dataIndex: 'resource' },
                    { title: l('定义版本', 'Definition version'), dataIndex: 'definitionVersion' },
                    { title: l('到期（UTC）', 'Due (UTC)'), render: (_, r) => utcMicros(r.dueAt) },
                    { title: l('阶段', 'Phase'), dataIndex: 'phase' },
                  ]}
                />
              </details>
            )}
          </>
        )}
      </Card>
      <Card
        title={l('设备自报缺口', 'Device-reported gaps')}
        extra={<Button onClick={gaps.reload}>{l('重读缺口', 'Read gaps again')}</Button>}
      >
        <p className="subtitle">
          {l(
            '缺口针对整台设备的上传诊断。没有缺口报告不代表完整覆盖。',
            'Gap reports diagnose device uploads. No reports do not imply complete coverage.',
          )}
        </p>
        <ReadState
          locale={locale}
          busy={gaps.busy}
          error={gaps.error}
          empty={gaps.value?.reports.length === 0}
        />
        {gaps.value && (
          <>
            <DataTable
              locale={locale}
              rowKey="reportId"
              dataSource={gaps.value.reports}
              columns={[
                {
                  title: l('原设备', 'Original device'),
                  render: (_, r) => (
                    <code>
                      {r.deviceId}
                    </code>
                  ),
                },
                {
                  title: l('缺口', 'Gaps'),
                  render: (_, r) => (
                    <ul>
                      {r.gaps.map((g, i) => (
                        <li key={i}>
                          {diagnosticName(g.reason, locale)} · {g.count} · {utcMicros(g.first)} –{' '}
                          {utcMicros(g.last)}
                        </li>
                      ))}
                    </ul>
                  ),
                },
              ]}
            />
            <Space>
              {gaps.value.next && (
                <Button onClick={() => setAfter(gaps.value!.next)}>
                  {l('下一页缺口', 'Next gaps')}
                </Button>
              )}
              {after && (
                <Button onClick={() => setAfter(null)}>{l('缺口首页', 'First gaps')}</Button>
              )}
            </Space>
          </>
        )}
        {!!gaps.error && after && (
          <Button onClick={() => setAfter(null)}>
            {l('从首页重新查询', 'Restart from first page')}
          </Button>
        )}
      </Card>
    </div>
  )
}
