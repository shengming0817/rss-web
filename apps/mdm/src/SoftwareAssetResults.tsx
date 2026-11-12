import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Button, Card, Select, Space, Tag } from 'antd'
import { Link } from 'react-router-dom'
import type { DeviceRef, Page, WindowQuery } from '@rss/mdm-devices'
import {
  type Compliance,
  type Dimension,
  type SoftwareBucket,
  type SoftwareQuality,
  type SoftwareTask,
} from '@rss/mdm-inventory'
import { CursorControls, labels, readFailure, ReadState, usePageRead, type Query } from './AdminUi'
import { DataTable } from './DataTable'
import { devicePath } from './Devices'
import {
  contextName,
  dimensionName,
  firstAssetPage,
  riskName,
  type SoftwareAssetsUseCases,
} from './SoftwareAssetControls'
import type { Locale } from './i18n'

function complianceLabel(value: Compliance, locale: Locale) {
  const l = labels(locale)
  return {
    disabled: l('已关闭', 'Disabled'),
    compliant: l('合规', 'Compliant'),
    non_compliant: l('违规', 'Non-compliant'),
    unknown: l('无法判断', 'Unknown'),
  }[value]
}
function ObjectLink({ object }: { object: DeviceRef }) {
  return (
    <Link to={devicePath(object.kind, object.id)}>
      {object.kind} / {object.id}
    </Link>
  )
}

function ResultPage<T, P extends Page<T>>({
  title,
  locale,
  load,
  invalidate,
  children,
  onPage,
}: {
  title: string
  locale: Locale
  load: (page: WindowQuery, signal: AbortSignal) => Promise<P>
  invalidate: () => void
  children: (page: P) => ReactNode
  onPage?: () => void
}) {
  const [query, setQuery] = useState<Query>(firstAssetPage),
    read = usePageRead(`software-result/${JSON.stringify(query)}`, (signal) => load(query, signal)),
    failure = readFailure(read.error),
    invalid =
      failure === 'result' ||
      failure === 'denied' ||
      failure === 'conflict' ||
      (typeof read.error === 'object' &&
        read.error !== null &&
        'status' in read.error &&
        read.error.status === 409 &&
        failure !== 'cursor')
  useEffect(() => {
    if (invalid) invalidate()
  }, [invalid, invalidate])
  function change(page: Query) {
    onPage?.()
    setQuery(page)
  }
  return (
    <Card size="small" title={title}>
      <ReadState
        locale={locale}
        busy={read.busy}
        error={read.error}
        empty={read.value?.items.length === 0}
        onRetry={read.reload}
        onRestart={() => change(firstAssetPage)}
      />
      {read.value && (
        <>
          {children(read.value)}
          <CursorControls
            locale={locale}
            query={query}
            next={read.value.nextCursor}
            count={read.value.items.length}
            onChange={change}
          />
        </>
      )}
    </Card>
  )
}

export function SoftwareAssetResults({
  assets,
  task,
  locale,
  openMapping,
  invalidate,
}: {
  assets: SoftwareAssetsUseCases
  task: SoftwareTask
  locale: Locale
  openMapping: (id: string) => void
  invalidate: () => void
}) {
  const l = labels(locale),
    [bucket, setBucket] = useState<SoftwareBucket | null>(null),
    [coverage, setCoverage] = useState(false)
  return (
    <Space direction="vertical" className="software-asset-panels">
      <ResultPage
        title={l('软件聚合', 'Software aggregates')}
        locale={locale}
        invalidate={invalidate}
        load={(page, signal) => assets.buckets(task, page, signal)}
        onPage={() => setBucket(null)}
      >
        {(page) => (
          <DataTable
            locale={locale}
            rowKey="id"
            dataSource={page.items}
            columns={[
              {
                title: l('软件', 'Software'),
                render: (_, row) => {
                  const identity = row.identity
                  return (
                    <div>
                      <Button type="link" onClick={() => setBucket(row)}>
                        {identity.name}
                      </Button>
                      {identity.kind === 'standard' ? (
                        <Tag>{riskName(identity.risk, locale)}</Tag>
                      ) : identity.kind === 'conflict' ? (
                        <>
                          <Tag color="warning">{l('映射冲突', 'Mapping conflict')}</Tag>
                          <Space wrap>
                            {identity.rules.map((id) => (
                              <Button type="link" key={id} onClick={() => openMapping(id)}>
                                {id}
                              </Button>
                            ))}
                          </Space>
                        </>
                      ) : (
                        <>
                          <Tag>{l('未映射', 'Unmapped')}</Tag>
                          <small>
                            {identity.publisher} · {identity.native_id} · {identity.source}
                          </small>
                        </>
                      )}
                    </div>
                  )
                },
              },
              { title: l('筛选范围设备数', 'Devices in filtered scope'), dataIndex: 'devices' },
              {
                title: l('租户阈值评估', 'Tenant threshold assessment'),
                render: (_, row) => (
                  <div>
                    <span>
                      {row.thresholdState === 'disabled'
                        ? l('已关闭', 'Disabled')
                        : row.thresholdState === 'unknown'
                          ? l('无法判断', 'Unknown')
                          : row.thresholdState === 'reached'
                            ? l('达到阈值', 'Threshold reached')
                            : l('未达阈值', 'Below threshold')}
                    </span>
                    {row.threshold !== null && (
                      <p>
                        {row.assessmentDevices} / {row.threshold}
                      </p>
                    )}
                  </div>
                ),
              },
              {
                title: l('允许组判断', 'Allowed group assessment'),
                render: (_, row) => (
                  <Space wrap>
                    {(Object.keys(row.compliance) as (keyof typeof row.compliance)[])
                      .filter((key) => row.compliance[key] > 0)
                      .map((key) => (
                        <Tag key={key}>
                          {complianceLabel(key === 'nonCompliant' ? 'non_compliant' : key, locale)}{' '}
                          · {row.compliance[key]}
                        </Tag>
                      ))}
                  </Space>
                ),
              },
            ]}
          />
        )}
      </ResultPage>
      {bucket && (
        <SoftwareBucketDetail
          key={bucket.id}
          assets={assets}
          task={task}
          bucket={bucket}
          locale={locale}
          invalidate={invalidate}
        />
      )}
      <Button onClick={() => setCoverage(!coverage)}>
        {coverage
          ? l('关闭覆盖质量', 'Close coverage quality')
          : l('查看覆盖质量', 'View coverage quality')}
      </Button>
      {coverage && (
        <ResultPage
          title={l('采集覆盖质量', 'Collection coverage quality')}
          locale={locale}
          invalidate={invalidate}
          load={(page, signal) => assets.coverage(task, page, signal)}
        >
          {(page) => (
            <DataTable
              locale={locale}
              rowKey={(row) => `${row.object.kind}/${row.object.id}`}
              dataSource={page.items}
              columns={[
                {
                  title: l('设备', 'Device'),
                  render: (_, row) => <ObjectLink object={row.object} />,
                },
                {
                  title: l('筛选匹配', 'Filter match'),
                  render: (_, row) =>
                    row.unknown
                      ? l('无法判断', 'Unknown')
                      : row.matched
                        ? l('匹配', 'Matched')
                        : l('未匹配', 'Not matched'),
                },
                {
                  title: l('质量', 'Quality'),
                  render: (_, row) => <Quality items={row.quality} locale={locale} />,
                },
              ]}
            />
          )}
        </ResultPage>
      )}
    </Space>
  )
}

function SoftwareBucketDetail({
  assets,
  task,
  bucket,
  locale,
  invalidate,
}: {
  assets: SoftwareAssetsUseCases
  task: SoftwareTask
  bucket: SoftwareBucket
  locale: Locale
  invalidate: () => void
}) {
  const l = labels(locale),
    [dimension, setDimension] = useState<Dimension>(),
    [object, setObject] = useState<DeviceRef | null>(null)
  return (
    <Card title={bucket.identity.name}>
      {task.dimensions.length > 0 && (
        <label>
          {l('分桶维度', 'Breakdown dimension')}
          <Select
            aria-label={l('分桶维度', 'Breakdown dimension')}
            value={dimension}
            onChange={setDimension}
            allowClear
            options={task.dimensions.map((value) => ({
              value,
              label: dimensionName(value, locale),
            }))}
          />
        </label>
      )}
      {dimension && (
        <ResultPage
          key={dimension}
          title={dimensionName(dimension, locale)}
          locale={locale}
          invalidate={invalidate}
          load={(page, signal) => assets.breakdowns(task, bucket.id, dimension, page, signal)}
        >
          {(page) => (
            <DataTable
              locale={locale}
              dataSource={page.items}
              rowKey="value"
              columns={[
                { title: l('值', 'Value'), dataIndex: 'value' },
                { title: l('设备数', 'Devices'), dataIndex: 'devices' },
              ]}
            />
          )}
        </ResultPage>
      )}
      <ResultPage
        title={l('安装设备', 'Devices with installations')}
        locale={locale}
        invalidate={invalidate}
        load={(page, signal) => assets.devices(task, bucket.id, page, signal)}
        onPage={() => setObject(null)}
      >
        {(page) => (
          <DataTable
            locale={locale}
            rowKey={(row) => `${row.object.kind}/${row.object.id}`}
            dataSource={page.items}
            columns={[
              {
                title: l('设备', 'Device'),
                render: (_, row) => <ObjectLink object={row.object} />,
              },
              {
                title: l('合规', 'Compliance'),
                render: (_, row) => complianceLabel(row.compliance, locale),
              },
              {
                title: l('组判断', 'Group decisions'),
                render: (_, row) => (
                  <Space wrap>
                    {Object.entries(row.groupDecisions).map(([id, decision]) => (
                      <Tag key={id}>
                        {id} ·{' '}
                        {decision === 'match'
                          ? l('匹配', 'Match')
                          : decision === 'no_match'
                            ? l('不匹配', 'No match')
                            : l('无法判断', 'Unknown')}
                      </Tag>
                    ))}
                  </Space>
                ),
              },
              {
                title: l('安装证据', 'Installation evidence'),
                render: (_, row) => (
                  <Button onClick={() => setObject(row.object)}>
                    {l('查看证据', 'View evidence')}
                  </Button>
                ),
              },
            ]}
          />
        )}
      </ResultPage>
      {object && (
        <ResultPage
          key={`${object.kind}/${object.id}`}
          title={l('原始安装证据', 'Original installation evidence')}
          locale={locale}
          invalidate={invalidate}
          load={(page, signal) => assets.evidence(task, bucket.id, object, page, signal)}
        >
          {(page) => (
            <>
              <p>
                {contextName(task.context, locale)} · <ObjectLink object={object} />
              </p>
              <DataTable
                locale={locale}
                dataSource={page.items}
                rowKey={(row) =>
                  JSON.stringify([row.endpoint, row.source, row.arrayVersion, row.ordinal])
                }
                columns={[
                  {
                    title: l('终端与采集来源', 'Endpoint and collection source'),
                    render: (_, row) => (
                      <div>
                        {row.endpoint}
                        <br />
                        {row.source}
                      </div>
                    ),
                  },
                  {
                    title: l('观察', 'Observation'),
                    render: (_, row) => (
                      <div>
                        {new Date(row.evidence.observedAt * 1000).toLocaleString(locale)}
                        <br />
                        <code>{row.evidence.snapshotId}</code>
                        <br />
                        <Tag>
                          {row.confirmed ? l('已确认', 'Confirmed') : l('未确认', 'Unconfirmed')}
                        </Tag>
                      </div>
                    ),
                  },
                  {
                    title: l('原始值与命中规则', 'Original value and matched rules'),
                    render: (_, row) => (
                      <details>
                        <summary>{l('展开原始记录', 'Inspect original record')}</summary>
                        <pre>{JSON.stringify(row, null, 2)}</pre>
                      </details>
                    ),
                  },
                ]}
              />
              <Quality items={page.quality} locale={locale} />
            </>
          )}
        </ResultPage>
      )}
    </Card>
  )
}

function Quality({ items, locale }: { items: readonly SoftwareQuality[]; locale: Locale }) {
  const l = labels(locale)
  return items.length === 0 ? (
    <Alert type="info" title={l('无覆盖质量记录', 'No coverage quality records')} />
  ) : (
    <details>
      <summary>{l('覆盖质量与最后可信证据', 'Coverage quality and last trusted evidence')}</summary>
      {items.map((row) => (
        <div key={JSON.stringify([row.endpoint, row.source, row.scope])}>
          <strong>
            {row.endpoint} · {row.source} · {row.state.kind}
          </strong>
          {row.lastKnown.map((value) => (
            <p key={value.arrayVersion}>
              {new Date(value.evidence.observedAt * 1000).toLocaleString(locale)} · {value.count} ·{' '}
              {value.evidence.snapshotId}
            </p>
          ))}
          <pre>
            {JSON.stringify({ scope: row.scope, state: row.state, runs: row.runs }, null, 2)}
          </pre>
        </div>
      ))}
    </details>
  )
}
