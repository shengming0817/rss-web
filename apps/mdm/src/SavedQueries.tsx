import { useState } from 'react'
import { Alert, Button, Card, Checkbox, Form, Input, Space } from 'antd'
import {
  freeze,
  validateQuery,
  type Operation,
  type SavedQuery,
  type SavedQueryChange,
  type SavedQueryRow,
} from '@rss/mdm-inventory'
import {
  CursorControls,
  DirectoryControls,
  directoryQuery,
  Failure,
  firstPage,
  isUnknown,
  labels,
  ReadState,
  useAction,
  useRead,
  type Query,
} from './AdminUi'
import type { InventoryUseCases } from './FieldEditor'
import type { Locale } from './i18n'
import { DataTable } from './DataTable'
import { emptyQuery, QueryDefinitionEditor, QueryExecution } from './InventoryQuery'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'

function SavedQueryEditor({
  inventory,
  locale,
  baseline,
  canWrite,
  done,
}: {
  inventory: InventoryUseCases
  locale: Locale
  baseline: SavedQuery
  canWrite: boolean
  done: () => void
}) {
  const l = labels(locale),
    action = useAction(),
    guard = useSelectionGuard(),
    [name, setName] = useState(baseline.definition?.name ?? ''),
    [query, setQuery] = useState(baseline.definition?.query ?? emptyQuery()),
    [pending, setPending] = useState<Operation<SavedQueryChange> | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    [approved, setApproved] = useState(false),
    [invalid, setInvalid] = useState(false)
  usePendingSelection(
    guard.locked ||
      action.busy ||
      (pending !== null && !['confirmed', 'rejected'].includes(outcome)),
  )
  async function submit(change: NonNullable<typeof pending>) {
    const result = await action.run(() => inventory.putSavedQuery(baseline.id, change))
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
  }
  function start(input: SavedQueryChange) {
    try {
      if (input.action === 'put') {
        if (!input.definition.name.trim()) throw new Error('Name required')
        validateQuery(input.definition.query)
      }
      const change = freeze({
        operationId: crypto.randomUUID(),
        expectedRevision: baseline.revision,
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
    <SelectionGuard.Provider value={guard.register}>
      <p className="subtitle">
        <code>{baseline.id}</code> · {l('已读取版本', 'Observed revision')} {baseline.revision}
      </p>
      <Failure locale={locale} error={action.error} />
      {invalid && (
        <Alert
          type="error"
          title={l('请填写名称并检查查询定义。', 'Enter a name and check the query definition.')}
        />
      )}
      <Form
        layout="vertical"
        disabled={!canWrite || guard.locked || action.busy || pending !== null}
        onFinish={() => start({ action: 'put', definition: { name, query } })}
      >
        <Form.Item label={l('查询名称', 'Query name')}>
          <Input
            aria-label={l('查询名称', 'Query name')}
            value={name}
            maxLength={512}
            onChange={(e) => setName(e.target.value)}
          />
        </Form.Item>
        <QueryDefinitionEditor locale={locale} value={query} onChange={setQuery} />
        <Button type="primary" htmlType="submit">
          {l('保存查询定义', 'Save query definition')}
        </Button>
      </Form>
      {canWrite && baseline.definition && !pending && (
        <div className="admin-subsection">
          <Checkbox
            disabled={guard.locked}
            checked={approved}
            onChange={(e) => setApproved(e.target.checked)}
          >
            {l('确认删除保存的定义', 'Confirm deletion of the saved definition')}
          </Checkbox>
          <Button
            danger
            disabled={guard.locked || action.busy || !approved}
            onClick={() => start({ action: 'delete' })}
          >
            {l('删除保存查询', 'Delete saved query')}
          </Button>
        </div>
      )}
      {pending && (
        <div className="admin-recovery">
          <code>{pending.operationId}</code>
          {outcome === 'confirmed' ? (
            <Button disabled={guard.locked} onClick={done}>
              {l('查询定义变更已确认，重新读取', 'Query definition change confirmed; read again')}
            </Button>
          ) : outcome === 'rejected' ? (
            <Button disabled={guard.locked} onClick={done}>
              {l('放弃已拒绝变更并重读', 'Discard rejected change and read again')}
            </Button>
          ) : (
            <>
              <Alert
                type="warning"
                title={l(
                  '当前定义不能确认原变更；显式重提仍使用原版本和原内容。',
                  'Current definitions do not confirm the original change; explicit resubmission uses the original revision and content.',
                )}
              />
              <Button disabled={!canWrite || action.busy} onClick={() => void submit(pending)}>
                {l('显式重提原保存查询变更', 'Resubmit original saved query change')}
              </Button>
            </>
          )}
        </div>
      )}
      {baseline.definition && (
        <fieldset
          className="permission-panel admin-subsection"
          disabled={
            action.busy || (pending !== null && !['confirmed', 'rejected'].includes(outcome))
          }
        >
          <QueryExecution
            inventory={inventory}
            locale={locale}
            definition={baseline.definition.query}
            saved={{ id: baseline.id, revision: baseline.revision }}
          />
        </fieldset>
      )}
    </SelectionGuard.Provider>
  )
}
const fields = [
  'id',
  'revision',
  'name',
  'deleted',
  'definition',
] as const satisfies readonly (keyof SavedQueryRow)[]
export function SavedQueries({
  inventory,
  locale,
  canWrite,
}: {
  inventory: InventoryUseCases
  locale: Locale
  canWrite: boolean
}) {
  const l = labels(locale),
    action = useAction(),
    guard = useSelectionGuard(),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    read = useRead(`saved-query-directory/${JSON.stringify(query)}`, () =>
      inventory.savedQueries(directoryQuery(query, fields)),
    ),
    [detail, setDetail] = useState<SavedQuery | null>(null),
    [editor, setEditor] = useState(0)
  usePendingSelection(guard.locked || action.busy)
  async function open(id: string) {
    const result = await action.run(() => inventory.savedQuery(id))
    if (result.ok) {
      setDetail(result.value)
      setEditor((n) => n + 1)
    }
  }
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Card title={l('保存查询', 'Saved queries')}>
        <fieldset className="permission-panel" disabled={action.busy || guard.locked}>
          <DirectoryControls
            locale={locale}
            query={query}
            onChange={setQuery}
            fields={fields}
            sort={['id', 'name', 'revision']}
          />
          <Space wrap>
            <Button onClick={read.reload}>{l('读取保存查询', 'Read saved queries')}</Button>
            {canWrite && (
              <Button
                onClick={() => {
                  setDetail({ id: crypto.randomUUID(), revision: 0, definition: null })
                  setEditor((n) => n + 1)
                }}
              >
                {l('新建保存查询', 'New saved query')}
              </Button>
            )}
          </Space>
          <ReadState locale={locale} busy={read.busy} error={read.error} />
          {read.value && (
            <>
              <DataTable
                locale={locale}
                dataSource={read.value.items}
                rowKey="id"
                columns={[
                  {
                    title: l('名称', 'Name'),
                    render: (_, row) => (
                      <Button type="link" onClick={() => void open(row.id)}>
                        {row.name ?? row.id}
                      </Button>
                    ),
                  },
                  { title: l('标识', 'ID'), dataIndex: 'id' },
                  { title: l('版本', 'Revision'), dataIndex: 'revision' },
                  { title: l('已删除', 'Deleted'), dataIndex: 'deleted' },
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
          {!!read.error && query.cursor && (
            <Button onClick={() => setQuery(firstPage(query))}>
              {l('返回首页', 'First page')}
            </Button>
          )}
        </fieldset>
        <Failure locale={locale} error={action.error} />
      </Card>
      {detail && (
        <Card
          className="admin-subsection"
          title={detail.definition?.name ?? l('新建保存查询', 'New saved query')}
          extra={
            <Button disabled={action.busy || guard.locked} onClick={() => setDetail(null)}>
              {l('关闭查询详情', 'Close query detail')}
            </Button>
          }
        >
          <SavedQueryEditor
            key={editor}
            inventory={inventory}
            locale={locale}
            baseline={detail}
            canWrite={canWrite}
            done={() => {
              setDetail(null)
              read.reload()
            }}
          />
        </Card>
      )}
    </SelectionGuard.Provider>
  )
}
