import { useState } from 'react'
import { Alert, Button, Card, Form, Input, InputNumber, Space } from 'antd'
import {
  freeze,
  validateScalar,
  type AssetView,
  type CollectionScope,
  type DisplayGroup,
  type Evidence,
  type FieldDefinition,
  type ListRead,
  type ListState,
  type ManualChange,
  type Operation,
} from '@rss/mdm-inventory'
import type { DeviceRef, Scalar } from '@rss/mdm-devices'
import type { InventoryUseCases } from './FieldEditor'
import type { Locale } from './i18n'
import {
  CursorControls,
  Failure,
  firstPage,
  isUnknown,
  labels,
  ReadState,
  useAction,
  useRead,
  type Query,
} from './AdminUi'
import { DataTable } from './DataTable'
import { FieldValue, ScalarValue, Status, timestamp } from './DevicePresentation'
import { scopeName } from './InventoryScopeEditor'
import { CollectionResults, QualityRuns } from './CollectionResults'
import { ScalarEditor } from './ScalarEditor'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'

export function EvidenceFacts({ evidence, locale }: { evidence: Evidence; locale: Locale }) {
  const l = labels(locale)
  return (
    <dl className="device-facts">
      <div>
        <dt>{l('来源', 'Source')}</dt>
        <dd>{evidence.source}</dd>
      </div>
      <div>
        <dt>{l('命名空间', 'Namespace')}</dt>
        <dd>{scopeName(evidence.scope)}</dd>
      </div>
      <div>
        <dt>{l('原设备', 'Original device')}</dt>
        <dd>
          {evidence.deviceId ?? '—'}
        </dd>
      </div>
      <div>
        <dt>{l('数据集 / 来源代际', 'Dataset / epoch')}</dt>
        <dd>
          {evidence.dataset ?? '—'} / {evidence.epoch ?? '—'}
        </dd>
      </div>
      <div>
        <dt>{l('快照', 'Snapshot')}</dt>
        <dd>
          <code>{evidence.snapshotId}</code>
        </dd>
      </div>
      <div>
        <dt>{l('观测 / 接收时间', 'Observed / received')}</dt>
        <dd>
          {timestamp(locale, evidence.observedAt)} / {timestamp(locale, evidence.receivedAt)}
        </dd>
      </div>
      <div>
        <dt>{l('录入主体', 'Actor')}</dt>
        <dd>{evidence.actor ?? '—'}</dd>
      </div>
    </dl>
  )
}
function ListStateFact({ state, locale }: { state: ListState; locale: Locale }) {
  const l = labels(locale)
  return (
    <>
      <Status locale={locale} value={state.kind} />
      {state.kind === 'known' && (
        <p>
          {l('条目数', 'Item count')} · {state.count} · <code>{state.digest}</code>
        </p>
      )}
      {state.kind === 'unknown' && <p>{state.reason}</p>}
    </>
  )
}
function FieldFacts({
  fields,
  locale,
  layout = [],
}: {
  fields: AssetView['fields']
  locale: Locale
  layout?: readonly DisplayGroup[]
}) {
  const l = labels(locale)
  if (layout.length) {
    const placed = new Set(layout.flatMap((group) => group.fields))
    return (
      <>
        {layout.map((group) => (
          <Card key={group.id} size="small" title={group.name}>
            <FieldFacts
              locale={locale}
              fields={Object.fromEntries(
                group.fields.flatMap((field) => (fields[field] ? [[field, fields[field]]] : [])),
              )}
            />
          </Card>
        ))}
        <FieldFacts
          locale={locale}
          fields={Object.fromEntries(
            Object.entries(fields).filter(([field]) => !placed.has(field)),
          )}
        />
      </>
    )
  }
  return (
    <DataTable
      locale={locale}
      dataSource={Object.values(fields)}
      rowKey="field"
      columns={[
        { title: l('字段', 'Field'), dataIndex: 'field' },
        {
          title: l('当前事实', 'Current fact'),
          render: (_, row) => (
            <>
              <FieldValue locale={locale} value={row.state} />
              {row.state.kind === 'unknown' && <p>{row.state.value.reason}</p>}
            </>
          ),
        },
        {
          title: l('来源与历史证据', 'Sources and historical evidence'),
          render: (_, row) => (
            <details>
              <summary>
                {row.sources.length} {l('个来源', 'sources')}
              </summary>
              {row.sources.map(({ endpoint, fact }, index) => (
                <section className="asset-editor-section" key={index}>
                  <p>
                    <code>{endpoint}</code> · <FieldValue locale={locale} value={fact.state} />
                    {fact.state.kind === 'unknown' && <span> · {fact.state.value.reason}</span>}
                  </p>
                  <EvidenceFacts locale={locale} evidence={fact.evidence} />
                  {fact.lastKnown && (
                    <details>
                      <summary>
                        {l('历史已知值（不代表当前值）', 'Last known value (historical)')}
                      </summary>
                      <ScalarValue value={fact.lastKnown.value} />
                      <EvidenceFacts locale={locale} evidence={fact.lastKnown.evidence} />
                    </details>
                  )}
                </section>
              ))}
            </details>
          ),
        },
      ]}
    />
  )
}
function ListContents({
  inventory,
  locale,
  initial,
  refresh,
}: {
  inventory: InventoryUseCases
  locale: Locale
  initial: ListRead
  refresh: () => void
}) {
  const l = labels(locale),
    [query, setQuery] = useState<Query>({ limit: 50 }),
    read = useRead(
      `inventory-list/${JSON.stringify(initial)}/${JSON.stringify(query)}`,
      (signal) =>
        inventory.list(
          {
            ...initial,
            cursor: query.cursor ?? initial.cursor,
            limit: query.limit ?? 50,
          },
          signal,
        ),
      { retryReadConflict: false },
    )
  return (
    <Card
      size="small"
      title={`${initial.field} · ${initial.endpoint} · ${scopeName(initial.scope)}`}
    >
      <Form.Item label={l('集合每页条目', 'Collection page size')}>
        <InputNumber
          aria-label={l('集合每页条目', 'Collection page size')}
          value={query.limit ?? 50}
          min={1}
          max={1000}
          precision={0}
          onChange={(limit) => {
            if (limit) setQuery({ ...firstPage(query), limit })
          }}
        />
      </Form.Item>
      <ReadState
        locale={locale}
        busy={read.busy}
        error={read.error}
        onRetry={read.reload}
        onRestart={refresh}
      />
      {read.value && (
        <>
          <p className="subtitle">
            {l('来源集合总数', 'Source collection total')} · {read.value.total} ·{' '}
            {l('输入快照世代', 'Input snapshot epoch')} {read.value.assetCut?.epoch ?? '—'}
          </p>
          {read.value.source && (
            <details>
              <summary>{l('集合来源坐标', 'List source coordinates')}</summary>
              <EvidenceFacts locale={locale} evidence={read.value.source} />
            </details>
          )}
          <DataTable
            locale={locale}
            dataSource={read.value.items.map((value, index) => ({ index, value }))}
            rowKey="index"
            columns={[
              { title: l('条目', 'Item'), render: (_, row) => <ScalarValue value={row.value} /> },
            ]}
          />
          <CursorControls
            locale={locale}
            query={query}
            onChange={setQuery}
            next={read.value.nextCursor}
            count={read.value.items.length}
          />
        </>
      )}
      <Button onClick={refresh}>
        {l('重新读取来源并选择首页', 'Read fresh sources and choose the first page')}
      </Button>
    </Card>
  )
}
function ManualAssignment({
  inventory,
  locale,
  device,
  canWrite,
}: {
  inventory: InventoryUseCases
  locale: Locale
  device: string
  canWrite: boolean
}) {
  const l = labels(locale),
    action = useAction(),
    [key, setKey] = useState(''),
    [baseline, setBaseline] = useState<{ definition: FieldDefinition; revision: number } | null>(
      null,
    ),
    [value, setValue] = useState<Scalar>({ kind: 'string', value: '' }),
    [pending, setPending] = useState<Operation<ManualChange> | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    [invalid, setInvalid] = useState(false)
  usePendingSelection(
    action.busy || (pending !== null && !['confirmed', 'rejected'].includes(outcome)),
  )
  async function submit(change: NonNullable<typeof pending>) {
    const result = await action.run(() =>
      inventory.assign(device, baseline!.definition.key, change),
    )
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
  }
  function start(input: ManualChange) {
    try {
      if (input.action === 'set') validateScalar(input.value)
      const change = freeze({
        operationId: crypto.randomUUID(),
        expectedRevision: baseline!.revision,
        input,
      })
      setInvalid(false)
      setPending(change)
      void submit(change)
    } catch {
      setInvalid(true)
    }
  }
  return (
    <Card title={l('手工资产值', 'Manual asset values')}>
      <p className="subtitle">
        {l(
          '手工值写入当前终端的设备命名空间，使用该字段独立版本。',
          'Manual values belong to this endpoint’s device namespace and use the field’s own revision.',
        )}
      </p>
      <Failure locale={locale} error={action.error} />
      {invalid && (
        <Alert
          type="error"
          title={l('请检查输入值类型和数值范围。', 'Check the input type and numeric bounds.')}
        />
      )}
      <Form
        layout="inline"
        disabled={!canWrite || action.busy || pending !== null}
        onFinish={() => {
          void action
            .run(async () => {
              const [field, view] = await Promise.all([
                inventory.field(key),
                inventory.inventory(device),
              ])
              if (!field.definition?.manual) throw { cause: 'client', code: 'field_not_assignable' }
              return { definition: field.definition, revision: view.revisions[key] ?? 0 }
            })
            .then((result) => {
              if (result.ok) setBaseline(result.value)
            })
        }}
      >
        <Form.Item label={l('手工字段键', 'Manual field key')}>
          <Input
            aria-label={l('手工字段键', 'Manual field key')}
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              setBaseline(null)
            }}
          />
        </Form.Item>
        <Button htmlType="submit">
          {l('读取字段与写入版本', 'Read field and write revision')}
        </Button>
      </Form>
      {baseline && (
        <>
          <p>
            <code>{baseline.definition.key}</code> ·{' '}
            {l('已读取手工值版本', 'Observed manual value revision')} {baseline.revision}
          </p>
          <Form
            layout="vertical"
            disabled={!canWrite || action.busy || pending !== null}
            onFinish={() => start({ action: 'set', value })}
          >
            <ScalarEditor locale={locale} value={value} onChange={setValue} />
            <Space wrap>
              <Button type="primary" htmlType="submit">
                {l('设置手工值', 'Set manual value')}
              </Button>
              <Button
                disabled={!baseline.definition.nullable}
                onClick={() => start({ action: 'null' })}
              >
                {l('设置空值', 'Set null')}
              </Button>
              <Button onClick={() => start({ action: 'delete' })}>
                {l('删除手工值', 'Delete manual value')}
              </Button>
            </Space>
          </Form>
        </>
      )}
      {pending && (
        <div className="admin-recovery">
          <code>{pending.operationId}</code>
          {outcome === 'confirmed' || outcome === 'rejected' ? (
            <Button
              disabled={action.busy}
              onClick={() => {
                setPending(null)
                setBaseline(null)
                setOutcome('none')
                action.clear()
              }}
            >
              {outcome === 'confirmed'
                ? l('原手工值变更已确认，重新选择', 'Manual change confirmed; select again')
                : l('放弃已拒绝手工值变更', 'Discard rejected manual change')}
            </Button>
          ) : (
            <>
              <Alert
                type="warning"
                title={l(
                  '当前值不确认原变更。显式重提仍使用原版本与内容。',
                  'Current values do not confirm the original change. Resubmission uses the original revision and content.',
                )}
              />
              <Button disabled={!canWrite || action.busy} onClick={() => void submit(pending)}>
                {l('显式重提原手工值变更', 'Resubmit original manual change')}
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
export function AssetFacts({
  inventory,
  reference,
  endpoint,
  locale,
  canAssign,
}: {
  inventory: InventoryUseCases
  reference: DeviceRef
  endpoint: string
  locale: Locale
  canAssign: boolean
}) {
  const l = labels(locale),
    guard = useSelectionGuard(),
    layout = useRead('asset-layout', inventory.layout),
    view = useRead(
      `asset-view/${reference.kind}/${reference.id}`,
      (signal) => inventory.view(reference, signal),
      { retryReadConflict: true },
    ),
    [namespace, setNamespace] = useState<CollectionScope>({ kind: 'device' }),
    [scopeQuery, setScopeQuery] = useState<Query>({ limit: 20 }),
    scopes = useRead(`asset-scopes/${endpoint}/${JSON.stringify(scopeQuery)}`, () =>
      inventory.scopes(endpoint, scopeQuery),
    ),
    observed = useRead(`endpoint-inventory/${endpoint}/${JSON.stringify(namespace)}`, () =>
      inventory.inventory(endpoint, namespace),
    ),
    [list, setList] = useState<ListRead | null>(null),
    [collection, setCollection] = useState<{
      device: string
      run: string
      scope: CollectionScope
    } | null>(null)
  usePendingSelection(guard.locked)
  const refresh = () => {
    setList(null)
    view.reload()
    layout.reload()
    observed.reload()
    scopes.reload()
  }
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Card title={l('实时资产事实', 'Live asset facts')}>
        <Button onClick={refresh}>{l('读取最新资产事实', 'Read latest asset facts')}</Button>
        <ReadState locale={locale} busy={view.busy} error={view.error} onRetry={view.reload} />
        {view.value && (
          <>
            <p className="subtitle">
              {reference.kind} · {reference.id} · {l('关联版本', 'Association revision')}{' '}
              {view.value.association?.version ?? '—'}
            </p>
            <ReadState locale={locale} busy={layout.busy} error={layout.error} />
            <FieldFacts
              locale={locale}
              fields={view.value.fields}
              layout={layout.value?.groups ?? []}
            />
            <h3>{l('来源集合', 'Source collections')}</h3>
            <DataTable
              locale={locale}
              dataSource={Object.entries(view.value.lists).map(([field, value]) => ({
                field,
                ...value,
              }))}
              rowKey="field"
              columns={[
                { title: l('字段', 'Field'), dataIndex: 'field' },
                {
                  title: l('当前集合状态', 'Current list state'),
                  render: (_, row) => <ListStateFact locale={locale} state={row.state} />,
                },
                {
                  title: l('精确来源', 'Exact sources'),
                  render: (_, row) =>
                    row.sources.map((source, index) => (
                      <details key={index}>
                        <summary>
                          {source.endpoint} · {scopeName(source.evidence.scope)} ·{' '}
                          {source.state.kind}
                        </summary>
                        <ListStateFact locale={locale} state={source.state} />
                        <EvidenceFacts locale={locale} evidence={source.evidence} />
                        {source.lastKnown && (
                          <details>
                            <summary>
                              {l(
                                '历史集合状态（不代表当前集合）',
                                'Historical list state (not current)',
                              )}
                            </summary>
                            <ListStateFact locale={locale} state={source.lastKnown.state} />
                            <EvidenceFacts locale={locale} evidence={source.lastKnown.evidence} />
                          </details>
                        )}
                        <Button
                          onClick={() =>
                            setList({
                              reference,
                              endpoint: source.endpoint,
                              field: row.field,
                              scope: source.evidence.scope,
                              cursor: source.cursor,
                            })
                          }
                        >
                          {l('读取此来源集合', 'Read this source list')}
                        </Button>
                      </details>
                    )),
                },
              ]}
            />
            <QualityRuns
              locale={locale}
              values={view.value.inventorySources}
              open={(device, run, scope) => setCollection({ device, run, scope })}
            />
          </>
        )}
      </Card>
      <Card className="admin-subsection" title={l('终端命名空间', 'Endpoint namespaces')}>
        <p className="subtitle">
          {endpoint} · {scopeName(namespace)}
        </p>
        <ReadState locale={locale} busy={scopes.busy} error={scopes.error} />
        <Button
          onClick={() => {
            setNamespace({ kind: 'device' })
            setList(null)
          }}
        >
          {l('设备命名空间', 'Device namespace')}
        </Button>
        {scopes.value && (
          <>
            <DataTable
              locale={locale}
              dataSource={scopes.value.items}
              rowKey={(row) => JSON.stringify(row.scope)}
              columns={[
                {
                  title: l('已观察命名空间', 'Observed namespace'),
                  render: (_, row) => (
                    <Button
                      type="link"
                      onClick={() => {
                        setNamespace(row.scope)
                        setList(null)
                      }}
                    >
                      {scopeName(row.scope)}
                    </Button>
                  ),
                },
              ]}
            />
            <CursorControls
              locale={locale}
              query={scopeQuery}
              onChange={setScopeQuery}
              next={scopes.value.nextCursor}
              count={scopes.value.items.length}
            />
          </>
        )}
        {!!scopes.error && scopeQuery.cursor && (
          <Button onClick={() => setScopeQuery(firstPage(scopeQuery))}>
            {l('返回命名空间首页', 'First namespace page')}
          </Button>
        )}
        <ReadState locale={locale} busy={observed.busy} error={observed.error} />
        {observed.value && (
          <>
            <FieldFacts
              locale={locale}
              layout={layout.value?.groups ?? []}
              fields={Object.fromEntries(
                Object.entries(observed.value.fields).map(([key, value]) => [
                  key,
                  { ...value, sources: value.sources.map((fact) => ({ endpoint, fact })) },
                ]),
              )}
            />
            {Object.entries(observed.value.lists).map(([field, summary]) => (
              <div className="asset-editor-section" key={field}>
                <strong>{field}</strong> · <ListStateFact locale={locale} state={summary.state} />
                <Button
                  onClick={() =>
                    setList({
                      reference: { kind: 'endpoint', id: endpoint },
                      endpoint,
                      field,
                      scope: namespace,
                      cursor: summary.cursor,
                    })
                  }
                >
                  {l('读取命名空间集合', 'Read namespace list')}
                </Button>
                <details>
                  <summary>{l('集合来源', 'List sources')}</summary>
                  {summary.sources.map((source, index) => (
                    <div key={index}>
                      <ListStateFact locale={locale} state={source.state} />
                      <EvidenceFacts locale={locale} evidence={source.evidence} />
                      <Button
                        onClick={() =>
                          setList({
                            reference: { kind: 'endpoint', id: endpoint },
                            endpoint,
                            field,
                            scope: namespace,
                            cursor: source.cursor,
                          })
                        }
                      >
                        {l('读取具体来源集合', 'Read exact source list')}
                      </Button>
                    </div>
                  ))}
                </details>
              </div>
            ))}
            <QualityRuns
              locale={locale}
              values={[{ endpoint, quality: observed.value.quality }]}
              open={(device, run, scope) => setCollection({ device, run, scope })}
            />
          </>
        )}
      </Card>
      {list && (
        <div className="admin-subsection">
          <ListContents
            key={JSON.stringify(list)}
            inventory={inventory}
            locale={locale}
            initial={list}
            refresh={refresh}
          />
        </div>
      )}
      <div className="admin-subsection">
        <CollectionResults
          key={JSON.stringify(collection ?? [endpoint, namespace])}
          inventory={inventory}
          locale={locale}
          device={collection?.device ?? endpoint}
          initialRun={collection?.run ?? ''}
          scope={collection?.scope ?? namespace}
        />
      </div>
      <fieldset
        className="permission-panel admin-subsection"
        hidden={!!view.error}
        disabled={!canAssign || !!view.error}
      >
        <ManualAssignment
          inventory={inventory}
          locale={locale}
          device={endpoint}
          canWrite={canAssign && !view.error}
        />
      </fieldset>
    </SelectionGuard.Provider>
  )
}
