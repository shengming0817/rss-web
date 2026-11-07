import { useState } from 'react'
import { Alert, Button, Card, Checkbox, Form, Input, InputNumber, Select, Space } from 'antd'
import { Link } from 'react-router-dom'
import { freeze, validateQuery, type QueryDefinition, type Operation } from '@rss/mdm-inventory'
import type { InventoryUseCases } from './FieldEditor'
import type { Locale } from './i18n'
import {
  CursorControls,
  Failure,
  firstPage,
  isUnknown,
  labels,
  ReadState,
  readFailure,
  useAction,
  useRead,
  type Query,
} from './AdminUi'
import { ConditionContextEditor, scopeName } from './InventoryScopeEditor'
import { StringItems } from './ValueTypeEditor'
import { FieldValue, Status } from './DevicePresentation'
import { DataTable } from './DataTable'
import { devicePath } from './Devices'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'

export const emptyQuery = (): QueryDefinition => ({
  filter: null,
  scope: { selector: { kind: 'device' }, quantifier: 'one' },
  fields: [],
  sort: [],
})
export function QueryDefinitionEditor({
  value,
  onChange,
  locale,
}: {
  value: QueryDefinition
  onChange: (value: QueryDefinition) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <>
      <Form.Item label={l('服务端 RSQL 条件', 'Server RSQL filter')}>
        <Input.TextArea
          aria-label={l('服务端 RSQL 条件', 'Server RSQL filter')}
          rows={3}
          value={value.filter ?? ''}
          onChange={(e) => onChange({ ...value, filter: e.target.value || null })}
        />
      </Form.Item>
      <ConditionContextEditor
        locale={locale}
        value={value.scope}
        onChange={(scope) => onChange({ ...value, scope })}
      />
      <StringItems
        locale={locale}
        label={l('返回字段（留空使用服务端默认）', 'Result fields (empty uses server defaults)')}
        value={value.fields}
        onChange={(fields) => onChange({ ...value, fields })}
      />
      <fieldset className="asset-editor-section">
        <legend>{l('排序优先级', 'Sort precedence')}</legend>
        {value.sort.map((sort, index) => (
          <div className="asset-editor-row" key={index}>
            <Input
              aria-label={`${l('排序字段', 'Sort field')} ${index + 1}`}
              value={sort.field}
              onChange={(e) =>
                onChange({
                  ...value,
                  sort: value.sort.map((v, i) =>
                    i === index ? { ...v, field: e.target.value } : v,
                  ),
                })
              }
            />
            <Checkbox
              checked={sort.descending}
              onChange={(e) =>
                onChange({
                  ...value,
                  sort: value.sort.map((v, i) =>
                    i === index ? { ...v, descending: e.target.checked } : v,
                  ),
                })
              }
            >
              {l('降序', 'Descending')}
            </Checkbox>
            <Button
              disabled={index === 0}
              onClick={() => {
                const next = [...value.sort]
                ;[next[index - 1], next[index]] = [next[index]!, next[index - 1]!]
                onChange({ ...value, sort: next })
              }}
            >
              {l('上移', 'Move up')}
            </Button>
            <Button
              onClick={() => onChange({ ...value, sort: value.sort.filter((_, i) => i !== index) })}
            >
              {l('移除', 'Remove')}
            </Button>
          </div>
        ))}
        <Button
          disabled={value.sort.length >= 16}
          onClick={() =>
            onChange({ ...value, sort: [...value.sort, { field: '', descending: false }] })
          }
        >
          {l('添加排序', 'Add sort')}
        </Button>
      </fieldset>
    </>
  )
}
function FixedFacets({
  inventory,
  locale,
  task,
  onRerun,
}: {
  inventory: InventoryUseCases
  locale: Locale
  task: string
  onRerun?: (() => void) | undefined
}) {
  const l = labels(locale),
    [facet, setFacet] = useState<'os_versions' | 'channels' | 'asset_states'>('os_versions'),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    read = useRead(
      `${task}/facets/${facet}/${JSON.stringify(query)}`,
      (signal) => inventory.facets(task, facet, query, signal),
      { retryReadConflict: false },
    )
  return (
    <Card size="small" title={l('固定结果分布', 'Fixed result facets')}>
      <Select
        aria-label={l('分布维度', 'Facet')}
        value={facet}
        options={[
          { value: 'os_versions', label: l('系统版本', 'OS versions') },
          { value: 'channels', label: l('通道', 'Channels') },
          { value: 'asset_states', label: l('资产状态', 'Asset states') },
        ]}
        onChange={(value: typeof facet) => {
          setFacet(value)
          setQuery(firstPage(query))
        }}
      />
      <Button onClick={read.reload}>{l('读取分布', 'Read facets')}</Button>
      <ReadState
        locale={locale}
        busy={read.busy}
        error={read.error}
        onRetry={read.reload}
        onRestart={
          readFailure(read.error) === 'result'
            ? onRerun
            : () => (query.cursor ? setQuery(firstPage(query)) : read.reload())
        }
      />
      {read.value && (
        <>
          <DataTable
            locale={locale}
            rowKey="label"
            dataSource={read.value.items}
            columns={[
              { title: l('值', 'Value'), dataIndex: 'label' },
              { title: l('总数', 'Total'), dataIndex: 'total' },
            ]}
          />
          <CursorControls
            locale={locale}
            next={read.value.nextCursor}
            count={read.value.items.length}
            query={query}
            onChange={setQuery}
          />
        </>
      )}
    </Card>
  )
}
export function FixedQueryResult({
  inventory,
  locale,
  task,
  onRerun,
}: {
  inventory: InventoryUseCases
  locale: Locale
  task: string
  onRerun?: (() => void) | undefined
}) {
  const l = labels(locale),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    [columns, setColumns] = useState<readonly string[]>([]),
    status = useRead(`query-status/${task}`, (signal) => inventory.queryStatus(task, signal), {
      retryReadConflict: false,
    }),
    results = useRead(
      `query-items/${task}/${status.value?.status ?? ''}/${JSON.stringify(query)}`,
      (signal) =>
        status.value?.status === 'completed'
          ? inventory.queryItems(task, query, signal)
          : Promise.resolve(null),
      { retryReadConflict: false },
    )
  const available = [
      ...new Set((results.value?.items ?? []).flatMap((item) => Object.keys(item.fields))),
    ],
    shown = columns.length ? columns : available.slice(0, 6)
  return (
    <Card title={l('查询任务与固定结果', 'Query task and fixed results')}>
      <p>
        <code>{task}</code>
      </p>
      <Button
        onClick={() => {
          status.reload()
          results.reload()
        }}
      >
        {l('读取查询进度与结果', 'Read query progress and results')}
      </Button>
      <ReadState
        locale={locale}
        busy={status.busy}
        error={status.error}
        onRetry={status.reload}
        onRestart={onRerun}
      />
      {status.value && (
        <>
          <p>
            <Status locale={locale} value={status.value.status} /> {status.value.failure ?? ''}
          </p>
          <dl className="device-facts">
            <div>
              <dt>{l('服务端完整授权范围', 'Full authorized scope')}</dt>
              <dd>{status.value.summary.total}</dd>
            </div>
            <div>
              <dt>{l('匹配', 'Matched')}</dt>
              <dd>{status.value.summary.matched}</dd>
            </div>
            <div>
              <dt>{l('未知', 'Unknown')}</dt>
              <dd>{status.value.summary.unknown}</dd>
            </div>
          </dl>
        </>
      )}
      <ReadState
        locale={locale}
        busy={results.busy}
        error={results.error}
        onRetry={results.reload}
        onRestart={
          readFailure(results.error) === 'result'
            ? onRerun
            : () => (query.cursor ? setQuery(firstPage(query)) : results.reload())
        }
      />
      {results.value && (
        <>
          <Alert
            type="info"
            title={l(
              '这是任务的不可变结果。设备详情单独读取实时事实；重新执行会生成另一份结果。',
              'These are immutable task results. Device details read live facts separately; executing again creates another result.',
            )}
          />
          <Select
            mode="multiple"
            className="admin-fields"
            aria-label={l('固定结果显示字段', 'Fixed result columns')}
            value={[...columns]}
            placeholder={l('选择本页可用字段', 'Select fields available on this page')}
            options={[...new Set([...available, ...columns])].map((value) => ({
              value,
              label: value,
            }))}
            onChange={setColumns}
          />
          <Form.Item label={l('固定结果每页条目', 'Fixed result page size')}>
            <InputNumber
              aria-label={l('固定结果每页条目', 'Fixed result page size')}
              value={query.limit ?? 20}
              min={1}
              max={1000}
              precision={0}
              onChange={(limit) => {
                if (limit) setQuery({ ...firstPage(query), limit })
              }}
            />
          </Form.Item>
          <DataTable
            locale={locale}
            dataSource={results.value.items}
            rowKey={(row) => JSON.stringify([row.device, row.collectionScope])}
            columns={[
              {
                title: l('终端 / 实时详情', 'Endpoint / live detail'),
                dataIndex: 'device',
                render: (_, row) => (
                  <Link to={devicePath('endpoint', row.device)}>{row.device}</Link>
                ),
              },
              {
                title: l('命名空间', 'Namespace'),
                render: (_, row) => scopeName(row.collectionScope),
              },
              ...shown.map((field) => ({
                title: field,
                render: (_: unknown, row: NonNullable<typeof results.value>['items'][number]) =>
                  row.fields[field] ? (
                    <FieldValue locale={locale} value={row.fields[field].state} />
                  ) : (
                    '—'
                  ),
              })),
            ]}
          />
          <CursorControls
            locale={locale}
            next={results.value.nextCursor}
            count={results.value.items.length}
            query={query}
            onChange={setQuery}
          />
          <FixedFacets inventory={inventory} locale={locale} task={task} onRerun={onRerun} />
        </>
      )}
      {!onRerun &&
        [status.error, results.error].some((error) => readFailure(error) === 'result') && (
          <p>
            {l(
              '请返回原查询定义，显式运行一次新查询。',
              'Return to the original query definition and explicitly run a new query.',
            )}
          </p>
        )}
    </Card>
  )
}
type Execution =
  | { readonly kind: 'query'; readonly operationId: string; readonly definition: QueryDefinition }
  | {
      readonly kind: 'saved'
      readonly id: string
      readonly change: Operation<Record<string, never>>
    }
export function QueryExecution({
  inventory,
  locale,
  definition,
  saved,
}: {
  inventory: InventoryUseCases
  locale: Locale
  definition: QueryDefinition
  saved?: { readonly id: string; readonly revision: number }
}) {
  const l = labels(locale),
    action = useAction(),
    [pending, setPending] = useState<Execution | null>(null),
    [outcome, setOutcome] = useState<'none' | 'accepted' | 'unknown' | 'rejected'>('none'),
    [invalid, setInvalid] = useState(false)
  usePendingSelection(
    action.busy || (pending !== null && !['accepted', 'rejected'].includes(outcome)),
  )
  const task = pending?.kind === 'query' ? pending.operationId : pending?.change.operationId
  async function submit(change: Execution) {
    const result = await action.run(() =>
      change.kind === 'query'
        ? inventory.query(change.operationId, change.definition)
        : inventory.executeSavedQuery(change.id, change.change),
    )
    setOutcome((previous) =>
      result.ok
        ? 'accepted'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
  }
  return (
    <>
      <Failure locale={locale} error={action.error} />
      {invalid && (
        <Alert
          type="error"
          title={l(
            '请检查查询范围、筛选、字段与排序。',
            'Check query scope, filter, fields and sort.',
          )}
        />
      )}
      <Button
        type="primary"
        disabled={action.busy || pending !== null}
        onClick={() => {
          try {
            validateQuery(definition)
            const operationId = crypto.randomUUID(),
              change: Execution = freeze(
                saved
                  ? {
                      kind: 'saved',
                      id: saved.id,
                      change: { operationId, expectedRevision: saved.revision, input: {} },
                    }
                  : { kind: 'query', operationId, definition },
              )
            setInvalid(false)
            setPending(change)
            void submit(change)
          } catch {
            setInvalid(true)
          }
        }}
      >
        {saved
          ? l('执行已读取版本的保存查询', 'Execute observed saved query revision')
          : l('运行资产查询', 'Run asset query')}
      </Button>
      {pending && task && (
        <>
          <div className="admin-recovery">
            <code>{task}</code>
            {outcome === 'accepted' || outcome === 'rejected' ? (
              <Button
                disabled={action.busy}
                onClick={() => {
                  setPending(null)
                  setOutcome('none')
                  action.clear()
                }}
              >
                {outcome === 'accepted'
                  ? l('开始另一次查询', 'Start another query')
                  : l('放弃已拒绝查询', 'Discard rejected query')}
              </Button>
            ) : (
              <Space wrap>
                <Button
                  disabled={action.busy}
                  onClick={() =>
                    void action
                      .run(() => inventory.queryStatus(task))
                      .then((result) => {
                        if (result.ok) setOutcome('accepted')
                      })
                  }
                >
                  {l('查询原任务', 'Read original task')}
                </Button>
                <Button disabled={action.busy} onClick={() => void submit(pending)}>
                  {l('显式重提原查询', 'Resubmit original query')}
                </Button>
              </Space>
            )}
          </div>
          <FixedQueryResult
            key={task}
            inventory={inventory}
            locale={locale}
            task={task}
            onRerun={
              outcome === 'accepted' && !action.busy
                ? () => {
                    const operationId = crypto.randomUUID()
                    const next: Execution = freeze(
                      pending.kind === 'query'
                        ? { ...pending, operationId }
                        : { ...pending, change: { ...pending.change, operationId } },
                    )
                    setPending(next)
                    setOutcome('none')
                    void submit(next)
                  }
                : undefined
            }
          />
        </>
      )}
    </>
  )
}
export function InventoryQuery({
  inventory,
  locale,
}: {
  inventory: InventoryUseCases
  locale: Locale
}) {
  const l = labels(locale),
    guard = useSelectionGuard(),
    [definition, setDefinition] = useState(emptyQuery),
    [taskDraft, setTaskDraft] = useState(''),
    [task, setTask] = useState('')
  usePendingSelection(guard.locked)
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Card title={l('资产查询', 'Asset query')}>
        <Form layout="vertical" disabled={guard.locked}>
          <QueryDefinitionEditor locale={locale} value={definition} onChange={setDefinition} />
        </Form>
        <QueryExecution inventory={inventory} locale={locale} definition={definition} />
      </Card>
      <Card
        title={l('读取已有固定查询', 'Read an existing fixed query')}
        className="admin-subsection"
      >
        <Form layout="inline" onFinish={() => setTask(taskDraft)}>
          <Form.Item label={l('原查询任务标识', 'Original query task ID')}>
            <Input
              aria-label={l('原查询任务标识', 'Original query task ID')}
              value={taskDraft}
              onChange={(e) => setTaskDraft(e.target.value)}
            />
          </Form.Item>
          <Button htmlType="submit">{l('读取固定结果', 'Read fixed results')}</Button>
        </Form>
        {task && <FixedQueryResult key={task} inventory={inventory} locale={locale} task={task} />}
      </Card>
    </SelectionGuard.Provider>
  )
}
