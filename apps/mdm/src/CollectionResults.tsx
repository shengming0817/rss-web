import { useState } from 'react'
import { Alert, Button, Card, Form, Input } from 'antd'
import type { CollectionScope, QualityRun } from '@rss/mdm-inventory'
import type { InventoryUseCases } from './FieldEditor'
import type { Locale } from './i18n'
import { CursorControls, firstPage, labels, ReadState, useRead, type Query } from './AdminUi'
import { DataTable } from './DataTable'
import { ScalarValue, Status, timestamp } from './DevicePresentation'
import { scopeName } from './InventoryScopeEditor'
import { CollectionPlan } from './CollectionMappingEditor'

export function QualityRuns({
  values,
  locale,
  open,
}: {
  values: readonly { endpoint: string; quality: readonly QualityRun[] }[]
  locale: Locale
  open: (device: string, run: string, scope: CollectionScope) => void
}) {
  const l = labels(locale),
    rows = values.flatMap(({ endpoint, quality }) => quality.map((run) => ({ endpoint, ...run })))
  return (
    <Card title={l('采集质量与覆盖', 'Collection quality and coverage')}>
      <DataTable
        locale={locale}
        dataSource={rows}
        rowKey={(row) => JSON.stringify([row.endpoint, row.device, row.epoch, row.runId])}
        columns={[
          {
            title: l('来源 / 运行', 'Source / run'),
            render: (_, row) => (
              <>
                <strong>{row.source}</strong>
                <p>
                  <Button
                    type="link"
                    onClick={() =>
                      open(row.endpoint, row.runId, row.fields[0]?.scope ?? { kind: 'device' })
                    }
                  >
                    {row.runId}
                  </Button>
                </p>
                <code>{row.endpoint}</code>
              </>
            ),
          },
          {
            title: l('原设备与来源', 'Original device and source'),
            render: (_, row) => (
              <>
                {row.device}
                <p>
                  {row.epoch} · {row.sequence}
                </p>
              </>
            ),
          },
          {
            title: l('覆盖与结果', 'Coverage and result'),
            render: (_, row) => (
              <>
                <Status locale={locale} value={row.result} />
                <p>
                  {l('完整快照', 'Complete snapshot')} · {String(row.complete)}
                </p>
                <p>
                  {l('投递待确认', 'Delivery pending')} · {String(row.deliveryPending)}
                </p>
                <details>
                  <summary>{l('覆盖坐标', 'Coverage coordinates')}</summary>
                  <CollectionPlan
                    value={{
                      dataset: row.dataset,
                      templateVersion: row.templateVersion,
                      fingerprint: row.fingerprint,
                      coverage: row.coverage,
                    }}
                  />
                </details>
              </>
            ),
          },
          {
            title: l('字段质量', 'Field quality'),
            render: (_, row) => (
              <details>
                <summary>
                  {row.fields.length} {l('个字段', 'fields')}
                </summary>
                {row.fields.map((field, index) => (
                  <p key={index}>
                    <Button type="link" onClick={() => open(row.endpoint, row.runId, field.scope)}>
                      {field.field}
                    </Button>{' '}
                    · {scopeName(field.scope)} · <Status locale={locale} value={field.quality} /> ·{' '}
                    {field.reason ?? '—'}
                  </p>
                ))}
              </details>
            ),
          },
        ]}
      />
    </Card>
  )
}
function CollectionFieldItems({
  inventory,
  locale,
  device,
  run,
  field,
  scope,
}: {
  inventory: InventoryUseCases
  locale: Locale
  device: string
  run: string
  field: string
  scope: CollectionScope
}) {
  const l = labels(locale),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    read = useRead(
      `collection-items/${device}/${run}/${field}/${JSON.stringify(scope)}/${JSON.stringify(query)}`,
      () => inventory.collectionItems(device, run, field, scope, query),
    )
  return (
    <Card size="small" title={`${field} · ${scopeName(scope)}`}>
      <Button onClick={read.reload}>{l('读取逐项质量', 'Read item quality')}</Button>
      <ReadState locale={locale} busy={read.busy} error={read.error} />
      {read.value && (
        <>
          <DataTable
            locale={locale}
            dataSource={read.value.items}
            rowKey="index"
            columns={[
              { title: l('采集条目序号', 'Collection item index'), dataIndex: 'index' },
              {
                title: l('质量', 'Quality'),
                render: (_, row) => <Status locale={locale} value={row.quality} />,
              },
              {
                title: l('值', 'Value'),
                render: (_, row) => (row.value === null ? '—' : <ScalarValue value={row.value} />),
              },
            ]}
          />
          <CursorControls
            locale={locale}
            next={read.value.nextCursor}
            query={query}
            onChange={setQuery}
            count={read.value.items.length}
          />
        </>
      )}
      {!!read.error && query.cursor && (
        <Button onClick={() => setQuery(firstPage(query))}>{l('返回首页', 'First page')}</Button>
      )}
    </Card>
  )
}
export function CollectionResults({
  inventory,
  locale,
  device,
  initialRun = '',
  scope,
}: {
  inventory: InventoryUseCases
  locale: Locale
  device: string
  initialRun?: string
  scope: CollectionScope
}) {
  const l = labels(locale),
    [draft, setDraft] = useState(initialRun),
    [run, setRun] = useState(initialRun),
    [field, setField] = useState<{ key: string; scope: CollectionScope } | null>(null),
    read = useRead(`collection/${device}/${run}/${JSON.stringify(scope)}`, () =>
      run ? inventory.collection(device, run, scope) : Promise.resolve(null),
    )
  return (
    <Card title={l('采集运行与逐项结果', 'Collection run and item results')}>
      <p className="subtitle">
        {device} · {scopeName(scope)}
      </p>
      <Form
        layout="inline"
        onFinish={() => {
          setRun(draft)
          setField(null)
          read.reload()
        }}
      >
        <Form.Item label={l('采集运行标识', 'Collection run ID')}>
          <Input
            aria-label={l('采集运行标识', 'Collection run ID')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </Form.Item>
        <Button htmlType="submit">{l('读取采集运行', 'Read collection run')}</Button>
      </Form>
      <ReadState locale={locale} busy={read.busy} error={read.error} />
      {read.value && (
        <>
          <Alert
            type="info"
            title={l(
              '采集结果、完整覆盖、投影状态与投递回执分别表示不同事实。部分结果不会变成完整快照。',
              'Collection outcome, complete coverage, projection and delivery receipts are separate facts. Partial results remain partial.',
            )}
          />
          <dl className="device-facts">
            <div>
              <dt>{l('结果', 'Result')}</dt>
              <dd>
                <Status locale={locale} value={read.value.result} /> · {read.value.reason ?? '—'}
              </dd>
            </div>
            <div>
              <dt>{l('完整覆盖', 'Complete coverage')}</dt>
              <dd>{String(read.value.complete)}</dd>
            </div>
            <div>
              <dt>{l('投递待确认', 'Delivery pending')}</dt>
              <dd>{String(read.value.deliveryPending)}</dd>
            </div>
            <div>
              <dt>{l('投影', 'Projection')}</dt>
              <dd>
                <Status locale={locale} value={read.value.delivery.projection} />
              </dd>
            </div>
            <div>
              <dt>{l('开始 / 结束', 'Started / finished')}</dt>
              <dd>
                {timestamp(locale, read.value.startedAt)} /{' '}
                {timestamp(locale, read.value.finishedAt)}
              </dd>
            </div>
            <div>
              <dt>{l('原设备与来源', 'Original device and source')}</dt>
              <dd>{read.value.device}</dd>
            </div>
          </dl>
          <details>
            <summary>{l('精确覆盖与回执', 'Exact coverage and receipt')}</summary>
            <CollectionPlan
              value={{
                source: read.value.source,
                epoch: read.value.epoch,
                sequence: read.value.sequence,
                dataset: read.value.dataset,
                templateVersion: read.value.templateVersion,
                fingerprint: read.value.fingerprint,
                coverage: read.value.coverage,
                receipt: read.value.delivery.receipt,
              }}
            />
          </details>
          <DataTable
            locale={locale}
            dataSource={read.value.fields}
            rowKey={(row) => JSON.stringify([row.field, row.scope])}
            columns={[
              {
                title: l('字段', 'Field'),
                render: (_, row) => (
                  <Button
                    type="link"
                    onClick={() => setField({ key: row.field, scope: row.scope })}
                  >
                    {row.field}
                  </Button>
                ),
              },
              { title: l('命名空间', 'Namespace'), render: (_, row) => scopeName(row.scope) },
              {
                title: l('质量', 'Quality'),
                render: (_, row) => <Status locale={locale} value={row.quality} />,
              },
              { title: l('状态码', 'Status code'), dataIndex: 'status' },
              { title: l('原因', 'Reason'), dataIndex: 'reason' },
              {
                title: l('条目 / 无效', 'Items / invalid'),
                render: (_, row) => `${row.itemCount} / ${row.invalidItems}`,
              },
            ]}
          />
        </>
      )}
      {field && (
        <CollectionFieldItems
          key={JSON.stringify([device, run, field])}
          inventory={inventory}
          locale={locale}
          device={device}
          run={run}
          field={field.key}
          scope={field.scope}
        />
      )}
    </Card>
  )
}
