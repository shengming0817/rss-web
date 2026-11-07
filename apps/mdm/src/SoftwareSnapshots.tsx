import { useState } from 'react'
import { Alert, Button, Card, Form, Input, Space } from 'antd'
import { freeze } from '@rss/mdm-inventory'
import type { Resource } from '@rss/mdm-resources'
import type {
  createSoftwareSnapshots,
  SnapshotEntry,
  SnapshotExtraction,
  SnapshotImport,
  SnapshotReceipt,
} from '@rss/mdm-software'
import {
  CursorControls,
  Failure,
  isUnknown,
  labels,
  ReadState,
  useAction,
  usePageRead,
  type Query,
} from './AdminUi'
import { DataTable } from './DataTable'
import { ResourceCatalogSearch } from './ResourceCatalogSearch'
import { ResourceVersionEditor } from './ResourceVersionEditor'
import { ResourceCommandState, useResourceCommand, type ResourcesUseCases } from './ResourceCommand'
import type { ContentUseCases } from './ContentUpload'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'
import type { Locale } from './i18n'

type Snapshots = ReturnType<typeof createSoftwareSnapshots>
const sourceFields = [
  'source',
  'revision',
  'entryCount',
  'importedAt',
  'documentSha256',
  'extraction',
] as const
const entryFields = ['entryId', 'source', 'revision', 'packageId', 'name', 'version'] as const
const first = { limit: 20 }
const digest = (bytes: readonly number[]) =>
  bytes.map((b) => b.toString(16).padStart(2, '0')).join('')

export function SoftwareSnapshots({
  snapshots,
  binding,
  locale,
  canRead,
  canWrite,
  useEntry,
}: {
  snapshots: Snapshots
  binding: string
  locale: Locale
  canRead: boolean
  canWrite: boolean
  useEntry?: ((entry: SnapshotEntry) => void) | undefined
}) {
  const l = labels(locale),
    action = useAction(),
    [source, setSource] = useState<{ id: string; revision: number } | null>(null),
    [sourcePage, setSourcePage] = useState<Query>(first),
    [entryPage, setEntryPage] = useState<Query>(first),
    [entry, setEntry] = useState<string | null>(null),
    [documentOpen, setDocumentOpen] = useState(false),
    [epoch, setEpoch] = useState(0),
    [newSource, setNewSource] = useState(''),
    [document, setDocument] = useState(''),
    [extraction, setExtraction] = useState<SnapshotExtraction>({}),
    [pending, setPending] = useState<{ source: string; intent: SnapshotImport } | null>(null),
    [receipt, setReceipt] = useState<SnapshotReceipt | null>(null),
    selected = canRead ? source : null,
    sources = usePageRead(
      `${binding}/snapshot-sources/${canRead}/${epoch}/${JSON.stringify(sourcePage)}`,
      (signal) =>
        canRead
          ? snapshots.sources({ ...sourcePage, fields: sourceFields }, signal)
          : Promise.resolve(null),
    ),
    entries = usePageRead(
      `${binding}/snapshot-entries/${epoch}/${JSON.stringify([selected, entryPage])}`,
      async (signal) => {
        if (!selected) return null
        const page = await snapshots.entries(
          selected.id,
          { ...entryPage, fields: entryFields },
          signal,
        )
        if (
          page.items.some((row) => row.source !== selected.id || row.revision !== selected.revision)
        )
          throw { cause: 'client', status: 409, code: 'configuration_changed' }
        return page
      },
    ),
    detail = usePageRead(
      `${binding}/snapshot-detail/${epoch}/${JSON.stringify([selected, documentOpen])}`,
      async (signal) => {
        if (!selected || !documentOpen) return null
        const value = await snapshots.snapshot(selected.id, signal)
        if (value.revision !== selected.revision)
          throw { cause: 'client', status: 409, code: 'configuration_changed' }
        return value
      },
    ),
    rawEntry = usePageRead(
      `${binding}/snapshot-entry/${epoch}/${JSON.stringify([selected, entry])}`,
      (signal) =>
        selected && entry
          ? snapshots.entry(selected.id, selected.revision, entry, signal)
          : Promise.resolve(null),
    )
  usePendingSelection(action.busy || pending !== null)
  function select(next: typeof source) {
    setSource(next)
    setEntryPage(first)
    setEntry(null)
    setDocumentOpen(false)
  }
  function refreshSources() {
    setSourcePage(first)
    select(null)
    setEpoch((previous) => previous + 1)
  }
  function confirm(value: SnapshotReceipt) {
    setReceipt(value)
    setPending(null)
    setDocument('')
    setExtraction({})
    refreshSources()
  }
  async function send(original: NonNullable<typeof pending>) {
    const result = await action.run(() => snapshots.replace(original.source, original.intent))
    if (result.ok) confirm(result.value)
    else if (!isUnknown(result.error) && !pending) setPending(null)
    else setPending(original)
  }
  async function recover() {
    if (!pending) return
    const result = await action.run(() =>
      snapshots.receipt(pending.source, pending.intent.operationId),
    )
    if (result.ok) confirm(result.value)
  }
  return (
    <>
      {canRead && (
        <Card title={l('来源快照', 'Source snapshots')}>
          <Button onClick={refreshSources}>{l('刷新来源', 'Refresh sources')}</Button>
          <ReadState
            locale={locale}
            busy={sources.busy}
            error={sources.error}
            empty={sources.value?.items.length === 0}
            onRetry={sources.reload}
            onRestart={refreshSources}
          />
          {sources.value && (
            <>
              <DataTable
                locale={locale}
                rowKey="source"
                dataSource={sources.value.items}
                columns={[
                  {
                    title: l('来源', 'Source'),
                    render: (_, row) => (
                      <Button
                        type="link"
                        disabled={row.revision === undefined || pending !== null}
                        onClick={() => select({ id: row.source, revision: row.revision! })}
                      >
                        {row.source}
                      </Button>
                    ),
                  },
                  { title: l('修订', 'Revision'), dataIndex: 'revision' },
                  { title: l('记录数', 'Record count'), dataIndex: 'entryCount' },
                ]}
              />
              <CursorControls
                locale={locale}
                query={sourcePage}
                next={sources.value.nextCursor}
                count={sources.value.items.length}
                onChange={setSourcePage}
              />
            </>
          )}
          {selected && (
            <>
              <h3>
                {selected.id} · {selected.revision}
              </h3>
              <Button onClick={() => setDocumentOpen(!documentOpen)}>
                {documentOpen
                  ? l('关闭文档原文', 'Close original document')
                  : l('读取文档原文', 'Read original document')}
              </Button>
              {documentOpen && (
                <>
                  <ReadState
                    locale={locale}
                    busy={detail.busy}
                    error={detail.error}
                    onRetry={detail.reload}
                    onRestart={refreshSources}
                  />
                  {detail.value && (
                    <>
                      <p>
                        SHA-256 · <code>{digest(detail.value.documentSha256)}</code>
                      </p>
                      <Input.TextArea
                        aria-label={l('文档原文', 'Original document')}
                        readOnly
                        value={detail.value.document}
                        rows={8}
                      />
                    </>
                  )}
                </>
              )}
              <ReadState
                locale={locale}
                busy={entries.busy}
                error={entries.error}
                empty={entries.value?.items.length === 0}
                onRetry={entries.reload}
                onRestart={refreshSources}
              />
              {entries.value && (
                <>
                  <DataTable
                    locale={locale}
                    rowKey="entryId"
                    dataSource={entries.value.items}
                    columns={[
                      { title: l('名称', 'Name'), dataIndex: 'name' },
                      { title: l('包标识', 'Package ID'), dataIndex: 'packageId' },
                      { title: l('软件版本', 'Software version'), dataIndex: 'version' },
                      {
                        title: l('记录', 'Record'),
                        render: (_, row) => (
                          <Button
                            onClick={() => setEntry(row.entryId)}
                            aria-label={l('读取记录', 'Read entry') + ' ' + row.entryId}
                          >
                            {l('读取记录', 'Read entry')}
                          </Button>
                        ),
                      },
                    ]}
                  />
                  <CursorControls
                    locale={locale}
                    query={entryPage}
                    next={entries.value.nextCursor}
                    count={entries.value.items.length}
                    onChange={(page) => {
                      setEntry(null)
                      setEntryPage(page)
                    }}
                  />
                </>
              )}
              {entry && (
                <ReadState
                  locale={locale}
                  busy={rawEntry.busy}
                  error={rawEntry.error}
                  onRetry={rawEntry.reload}
                  onRestart={refreshSources}
                />
              )}
              {rawEntry.value && (
                <>
                  <Input.TextArea
                    aria-label={l('记录原文', 'Original entry')}
                    readOnly
                    value={rawEntry.value.data}
                    rows={6}
                  />
                  {useEntry && (
                    <Button
                      onClick={() => {
                        if (!rawEntry.value) return
                        const { source, revision, entryId, packageId, name, version } =
                          rawEntry.value
                        useEntry({ source, revision, entryId, packageId, name, version })
                      }}
                    >
                      {l('用于软件草稿', 'Use in software draft')}
                    </Button>
                  )}
                </>
              )}
            </>
          )}
        </Card>
      )}
      {canWrite && (
        <Card title={l('导入或替换 JSON 快照', 'Import or replace JSON snapshot')}>
          <Form
            layout="vertical"
            disabled={pending !== null || action.busy}
            onFinish={() => {
              const target = selected?.id ?? newSource.trim()
              if (!target || !document) return
              void send(
                freeze({
                  source: target,
                  intent: {
                    operationId: crypto.randomUUID(),
                    expectedRevision: selected?.revision ?? 0,
                    input: { document, extraction },
                  },
                }),
              )
            }}
          >
            {selected ? (
              <p>
                {l('替换已选来源', 'Replace selected source')} · {selected.id} · {selected.revision}
              </p>
            ) : (
              <Form.Item label={l('新来源标识', 'New source ID')}>
                <Input
                  aria-label={l('新来源标识', 'New source ID')}
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                />
              </Form.Item>
            )}
            {selected && (
              <Button onClick={() => select(null)}>
                {l('改为导入新来源', 'Import a new source instead')}
              </Button>
            )}
            <label>
              {l('选择 JSON 文件', 'Choose JSON file')}
              <input
                type="file"
                accept=".json,application/json"
                disabled={pending !== null || action.busy}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file)
                    void action.run(async () => {
                      if (file.size > 64 * 1024 * 1024)
                        throw { cause: 'client', status: 413, code: 'request_too_large' }
                      setDocument(
                        new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()),
                      )
                    })
                }}
              />
            </label>
            <Form.Item label={l('导入 JSON 原文', 'JSON to import')}>
              <Input.TextArea
                aria-label={l('导入 JSON 原文', 'JSON to import')}
                value={document}
                onChange={(e) => setDocument(e.target.value)}
                rows={6}
              />
            </Form.Item>
            <details>
              <summary>{l('可选 JSON Pointer', 'Optional JSON Pointers')}</summary>
              {(['records', 'packageId', 'name', 'version'] as const).map((key) => (
                <Form.Item key={key} label={key}>
                  <Input
                    aria-label={key + ' JSON Pointer'}
                    value={extraction[key] ?? ''}
                    onChange={(e) =>
                      setExtraction({ ...extraction, [key]: e.target.value || null })
                    }
                  />
                </Form.Item>
              ))}
            </details>
            <Button
              type="primary"
              htmlType="submit"
              disabled={!document || !(selected || newSource.trim())}
            >
              {selected
                ? l('完整替换快照', 'Replace snapshot')
                : l('导入新快照', 'Import snapshot')}
            </Button>
          </Form>
        </Card>
      )}
      <Failure error={action.error} locale={locale} kind="write" />
      {receipt && (
        <p role="status">
          {l('原操作已确认', 'Original operation confirmed')} · {receipt.source} ·{' '}
          {receipt.revision} · {receipt.entryCount} · <code>{receipt.operationId}</code>
        </p>
      )}
      {pending && (
        <Alert
          type="warning"
          title={l('提交结果未知', 'Submission outcome unknown')}
          description={
            <Space wrap>
              <code>{pending.intent.operationId}</code>
              {canRead && (
                <Button disabled={action.busy} onClick={() => void recover()}>
                  {l('查询原回执', 'Read original receipt')}
                </Button>
              )}
              {canWrite && (
                <Button disabled={action.busy} onClick={() => void send(pending)}>
                  {l('重提同一请求', 'Resubmit the same request')}
                </Button>
              )}
              <Button
                disabled={action.busy}
                onClick={() => {
                  setPending(null)
                  setDocument('')
                  refreshSources()
                }}
              >
                {l('退出恢复并重新读取', 'Leave recovery and read again')}
              </Button>
            </Space>
          }
        />
      )}
    </>
  )
}

export function SnapshotDraft({
  seed,
  resources,
  content,
  locale,
  close,
}: {
  seed: SnapshotEntry
  resources: ResourcesUseCases
  content: ContentUseCases
  locale: Locale
  close: () => void
}) {
  const l = labels(locale),
    action = useAction(),
    command = useResourceCommand(resources),
    guard = useSelectionGuard(),
    [query, setQuery] = useState<Query>(first),
    [id, setId] = useState(''),
    [target, setTarget] = useState<Resource | null>(null),
    candidates = usePageRead(`snapshot-draft-resources/${JSON.stringify(query)}`, (signal) =>
      resources.list({ ...query, fields: ['id', 'presentation'] }, 'software', signal),
    )
  async function open(resourceId: string) {
    const result = await action.run(async () => {
      const value = await resources.read(resourceId)
      if (value.kind !== 'software') throw { cause: 'client', code: 'invalid_input' }
      return value
    })
    if (result.ok) setTarget(result.value)
  }
  usePendingSelection(guard.locked)
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Card title={l('独立软件草稿', 'Independent software draft')}>
        <p>
          <code>
            {seed.source} · {seed.revision} · {seed.entryId}
          </code>
        </p>
        <p>
          {seed.name} · {seed.packageId} · {seed.version}
        </p>
        <Button
          disabled={command.outcome === 'unknown' || action.busy || guard.locked}
          onClick={close}
        >
          {l('关闭软件草稿', 'Close software draft')}
        </Button>
        {target ? (
          <ResourceVersionEditor
            key={target.id}
            resources={resources}
            content={content}
            resource={target}
            locale={locale}
            canWrite
            blocked={false}
            snapshotSeed={seed}
          />
        ) : (
          <>
            <ResourceCatalogSearch
              key={query.filter ?? ''}
              locale={locale}
              query={query}
              onChange={setQuery}
              disabled={action.busy || command.pending !== null}
            />
            <ReadState
              locale={locale}
              busy={candidates.busy}
              error={candidates.error}
              onRetry={candidates.reload}
            />
            {candidates.value && (
              <>
                <DataTable
                  locale={locale}
                  rowKey="id"
                  dataSource={candidates.value.items}
                  columns={[
                    {
                      title: l('现有软件资源', 'Existing software resource'),
                      render: (_, row) => (
                        <Button
                          disabled={action.busy || command.pending !== null}
                          onClick={() => void open(row.id)}
                        >
                          {typeof row.presentation?.name === 'string'
                            ? row.presentation.name
                            : row.id}
                        </Button>
                      ),
                    },
                  ]}
                />
                <CursorControls
                  locale={locale}
                  query={query}
                  next={candidates.value.nextCursor}
                  count={candidates.value.items.length}
                  onChange={setQuery}
                />
              </>
            )}
            <Form
              layout="inline"
              onFinish={() => void command.submit(id, 0, { action: 'create', kind: 'software' })}
            >
              <Form.Item label={l('新软件资源标识', 'New software resource ID')}>
                <Input
                  aria-label={l('新软件资源标识', 'New software resource ID')}
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                />
              </Form.Item>
              <Button htmlType="submit" disabled={!id || action.busy || command.pending !== null}>
                {l('创建软件资源', 'Create software resource')}
              </Button>
            </Form>
            <ResourceCommandState command={command} locale={locale} canWrite />
            {command.outcome === 'confirmed' && command.pending && (
              <Button onClick={() => void open(command.pending!.resource)}>
                {l('编辑新资源版本', 'Edit new resource version')}
              </Button>
            )}
          </>
        )}
        <Failure error={action.error} locale={locale} kind="read" />
      </Card>
    </SelectionGuard.Provider>
  )
}
