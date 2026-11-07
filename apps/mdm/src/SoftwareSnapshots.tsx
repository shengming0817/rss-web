import { useEffect, useRef, useState, type ComponentRef } from 'react'
import { Alert, Button, Card, Checkbox, Form, Input, InputNumber, Space } from 'antd'
import { freeze } from '@rss/mdm-inventory'
import { formatFilter } from '@rss/api/mdm-filter'
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
  codeOf,
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
import { useProtectedDelivery } from './useProtectedDelivery'
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

function originalOffset(text: string, offset: number): number {
  if (!text.includes('\r')) return offset
  let raw = 0
  for (let visible = 0; visible < offset; visible++, raw++)
    if (text[raw] === '\r' && text[raw + 1] === '\n') raw++
  return raw
}

type SnapshotSelection = { start: number; end: number; inputType: string }

function editSnapshotText(raw: string, next: string, selection: SnapshotSelection | null): string {
  if (!raw.includes('\r')) return next
  const visible = raw.replace(/\r\n?/g, '\n')
  if (visible === next) return raw
  if (selection) {
    let { start, end } = selection
    const deleted = visible.length - next.length
    if (start === end && deleted > 0 && selection.inputType.startsWith('delete')) {
      if (selection.inputType.endsWith('Backward')) start -= deleted
      if (selection.inputType.endsWith('Forward')) end += deleted
    }
    const newEnd = next.length - (visible.length - end)
    if (
      start >= 0 &&
      end <= visible.length &&
      newEnd >= start &&
      next.startsWith(visible.slice(0, start)) &&
      next.endsWith(visible.slice(end))
    ) {
      return (
        raw.slice(0, originalOffset(raw, start)) +
        next.slice(start, newEnd) +
        raw.slice(originalOffset(raw, end))
      )
    }
  }
  let start = 0
  while (start < visible.length && start < next.length && visible[start] === next[start]) start++
  let oldEnd = visible.length
  let newEnd = next.length
  while (oldEnd > start && newEnd > start && visible[oldEnd - 1] === next[newEnd - 1]) {
    oldEnd--
    newEnd--
  }
  return (
    raw.slice(0, originalOffset(raw, start)) +
    next.slice(start, newEnd) +
    raw.slice(originalOffset(raw, oldEnd))
  )
}

function sourceIdentity(id: string) {
  return {
    filter: formatFilter({ kind: 'compare', field: 'source', operator: '==', values: [id] }),
    fields: ['source', 'revision'] as const,
    limit: 1,
  }
}

function SnapshotRaw({ label, raw, name }: { label: string; raw: string; name: string }) {
  const delivery = useProtectedDelivery()
  return (
    <>
      <Input.TextArea aria-label={label} readOnly value={raw} rows={8} />
      <Button
        onClick={() =>
          delivery.deliver(
            {
              bytes: new TextEncoder().encode(raw).buffer as ArrayBuffer,
              contentType: 'application/json',
              filename: name,
            },
            delivery.capture(),
          )
        }
      >
        {label} · JSON
      </Button>
      {delivery.download && (
        <a href={delivery.download.url} download={delivery.download.filename}>
          {delivery.download.filename}
        </a>
      )}
    </>
  )
}

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
    textArea = useRef<ComponentRef<typeof Input.TextArea>>(null),
    selectionBeforeInput = useRef<SnapshotSelection | null>(null),
    [source, setSource] = useState<{ id: string; revision: number } | null>(null),
    [sourcePage, setSourcePage] = useState<Query>(first),
    [entryPage, setEntryPage] = useState<Query>(first),
    [entry, setEntry] = useState<string | null>(null),
    [documentOpen, setDocumentOpen] = useState(false),
    [epoch, setEpoch] = useState(0),
    [manualSource, setManualSource] = useState<{ id: string; revision: number | null }>({
      id: '',
      revision: null,
    }),
    [document, setDocument] = useState(''),
    [fileIssue, setFileIssue] = useState<'size' | 'encoding' | null>(null),
    [extraction, setExtraction] = useState<SnapshotExtraction>({}),
    [pending, setPending] = useState<{ source: string; intent: SnapshotImport } | null>(null),
    [receipt, setReceipt] = useState<SnapshotReceipt | null>(null),
    [receiptMissing, setReceiptMissing] = useState(false),
    selected = canRead ? source : null,
    target = selected?.id ?? manualSource.id.trim(),
    revision = selected?.revision ?? (canRead ? 0 : manualSource.revision),
    validRevision = revision !== null && Number.isSafeInteger(revision) && revision >= 0,
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
        const matches = (row: { source?: string | undefined; revision?: number | undefined }) =>
          row.source === selected.id && row.revision === selected.revision
        const correct = page.items.length
          ? page.items.every(matches)
          : (await snapshots.sources(sourceIdentity(selected.id), signal)).items.some(matches)
        if (!correct) throw { cause: 'client', status: 409, code: 'configuration_changed' }
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
  useEffect(() => {
    const element = textArea.current?.nativeElement
    if (!element) return
    // The native event captures textarea selection before deletion and IME edits.
    function capture(event: Event) {
      if (!(event instanceof InputEvent) || !(event.target instanceof HTMLTextAreaElement)) return
      selectionBeforeInput.current = {
        start: event.target.selectionStart,
        end: event.target.selectionEnd,
        inputType: event.inputType,
      }
    }
    element.addEventListener('beforeinput', capture)
    return () => {
      selectionBeforeInput.current = null
      element.removeEventListener('beforeinput', capture)
    }
  }, [canWrite])
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
  async function restartSource() {
    if (!selected) {
      refreshSources()
      return
    }
    const id = selected.id
    const result = await action.run(() => snapshots.sources(sourceIdentity(id)))
    if (!result.ok) return
    const row = result.value.items.find((item) => item.source === id)
    if (row?.revision !== undefined) select({ id, revision: row.revision })
    else select(null)
    setEpoch((previous) => previous + 1)
  }
  function confirm(value: SnapshotReceipt) {
    setReceipt(value)
    setReceiptMissing(false)
    if (!canRead) setManualSource({ id: value.source, revision: value.revision })
    setPending(null)
    setDocument('')
    setExtraction({})
    refreshSources()
  }
  async function send(original: NonNullable<typeof pending>) {
    setReceiptMissing(false)
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
    else if (
      result.error &&
      typeof result.error === 'object' &&
      'status' in result.error &&
      result.error.status === 404
    ) {
      action.clear()
      setReceiptMissing(true)
    }
  }
  return (
    <>
      {canRead && (
        <Card title={l('来源快照', 'Source snapshots')}>
          <Button disabled={action.busy || pending !== null} onClick={refreshSources}>
            {l('刷新来源', 'Refresh sources')}
          </Button>
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
                        disabled={row.revision === undefined || pending !== null || action.busy}
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
                    onRetry={() => void restartSource()}
                    onRestart={() => void restartSource()}
                  />
                  {detail.value && (
                    <>
                      <p>
                        SHA-256 · <code>{digest(detail.value.documentSha256)}</code>
                      </p>
                      <SnapshotRaw
                        key={detail.value.revision}
                        label={l('文档原文', 'Original document')}
                        raw={detail.value.document}
                        name="snapshot.json"
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
                onRetry={() => void restartSource()}
                onRestart={() => void restartSource()}
              />
              {entries.value && (
                <>
                  <DataTable
                    locale={locale}
                    rowKey="entryId"
                    dataSource={entries.value.items}
                    columns={[
                      { title: l('记录标识', 'Entry ID'), dataIndex: 'entryId' },
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
                  onRetry={() => void restartSource()}
                  onRestart={() => void restartSource()}
                />
              )}
              {rawEntry.value && (
                <>
                  <p>
                    <code>{rawEntry.value.entryId}</code>
                  </p>
                  <SnapshotRaw
                    key={rawEntry.value.entryId}
                    label={l('记录原文', 'Original entry')}
                    raw={rawEntry.value.data}
                    name="record.json"
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
              if (!target || !document || !validRevision) return
              void send(
                freeze({
                  source: target,
                  intent: {
                    operationId: crypto.randomUUID(),
                    expectedRevision: revision,
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
              <Form.Item
                label={canRead ? l('新来源标识', 'New source ID') : l('来源标识', 'Source ID')}
              >
                <Input
                  aria-label={
                    canRead ? l('新来源标识', 'New source ID') : l('来源标识', 'Source ID')
                  }
                  value={manualSource.id}
                  onChange={(e) => {
                    const id = e.target.value
                    setManualSource((current) => ({
                      id,
                      revision: id.trim() === current.id.trim() ? current.revision : null,
                    }))
                  }}
                />
              </Form.Item>
            )}
            {!canRead && (
              <Form.Item
                label={l('已知来源修订（新建填 0）', 'Known source revision (0 for a new source)')}
              >
                <InputNumber
                  aria-label={l('已知来源修订', 'Known source revision')}
                  min={0}
                  precision={0}
                  value={manualSource.revision}
                  onChange={(revision) => setManualSource((current) => ({ ...current, revision }))}
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
                  if (!file) return
                  setDocument('')
                  setFileIssue(null)
                  if (file.size > 64 * 1024 * 1024) {
                    setFileIssue('size')
                    return
                  }
                  void action.run(async () => {
                    try {
                      setDocument(
                        new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()),
                      )
                    } catch {
                      setFileIssue('encoding')
                    }
                  })
                }}
              />
            </label>
            {fileIssue && (
              <Alert
                type="error"
                title={
                  fileIssue === 'size'
                    ? l('所选文件超过 64 MiB。', 'The selected file exceeds 64 MiB.')
                    : l('无法读取 UTF-8 JSON 文件。', 'The UTF-8 JSON file could not be read.')
                }
              />
            )}
            <Form.Item label={l('导入 JSON 原文', 'JSON to import')}>
              <Input.TextArea
                ref={textArea}
                aria-label={l('导入 JSON 原文', 'JSON to import')}
                value={document}
                spellCheck={false}
                onPaste={(event) => {
                  const text = event.clipboardData.getData('text/plain')
                  if (!text) return
                  event.preventDefault()
                  selectionBeforeInput.current = null
                  const { selectionStart, selectionEnd } = event.currentTarget
                  const from = originalOffset(document, selectionStart)
                  const to = originalOffset(document, selectionEnd)
                  setFileIssue(null)
                  setDocument(document.slice(0, from) + text + document.slice(to))
                }}
                onChange={(e) => {
                  setFileIssue(null)
                  const selection = selectionBeforeInput.current
                  selectionBeforeInput.current = null
                  setDocument(editSnapshotText(document, e.target.value, selection))
                }}
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
                    disabled={extraction[key] === ''}
                    onChange={(e) =>
                      setExtraction({ ...extraction, [key]: e.target.value || null })
                    }
                  />
                  <Checkbox
                    checked={extraction[key] === ''}
                    onChange={(e) =>
                      setExtraction({ ...extraction, [key]: e.target.checked ? '' : null })
                    }
                  >
                    {l('指向根值', 'Use the root value')}
                  </Checkbox>
                </Form.Item>
              ))}
            </details>
            <Button
              type="primary"
              htmlType="submit"
              disabled={!document || !target || !validRevision}
            >
              {selected || (!canRead && revision !== null && revision > 0)
                ? l('完整替换快照', 'Replace snapshot')
                : l('导入新快照', 'Import snapshot')}
            </Button>
          </Form>
        </Card>
      )}
      {action.error &&
      typeof action.error === 'object' &&
      'status' in action.error &&
      action.error.status === 413 ? (
        <Alert
          type="error"
          title={l('完整 UTF-8 请求超过 64 MiB。', 'The complete UTF-8 request exceeds 64 MiB.')}
        />
      ) : ['invalid_input', 'INVALID_REQUEST', 'malformed_request'].includes(
          codeOf(action.error),
        ) ? (
        <Alert
          type="error"
          title={l(
            '检查 JSON 语法、来源修订和 JSON Pointer。',
            'Check the JSON syntax, source revision and JSON Pointers.',
          )}
        />
      ) : (
        <Failure error={action.error} locale={locale} kind="write" />
      )}
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
              {receiptMissing && (
                <span>
                  {l(
                    '尚未读到原回执，提交结果仍待确认。',
                    'The original receipt is unavailable. The outcome remains unconfirmed.',
                  )}
                </span>
              )}
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
                  setReceiptMissing(false)
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
  allowed,
  close,
}: {
  seed: SnapshotEntry
  resources: ResourcesUseCases
  content: ContentUseCases
  locale: Locale
  allowed: boolean
  close: () => void
}) {
  const l = labels(locale),
    action = useAction(),
    command = useResourceCommand(resources),
    guard = useSelectionGuard(),
    [query, setQuery] = useState<Query>(first),
    [id, setId] = useState(''),
    [target, setTarget] = useState<Resource | null>(null),
    candidates = usePageRead(
      `snapshot-draft-resources/${allowed}/${Boolean(target)}/${JSON.stringify(query)}`,
      (signal) =>
        allowed && !target
          ? resources.list({ ...query, fields: ['id', 'presentation'] }, 'software', signal)
          : Promise.resolve(null),
    )
  async function open(resourceId: string) {
    if (!allowed) return
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
      <Card
        className="software-snapshot-draft"
        title={l('独立软件草稿', 'Independent software draft')}
      >
        <p>
          <code>
            {seed.source} · {seed.revision} · {seed.entryId}
          </code>
        </p>
        <p>
          {seed.name} · {seed.packageId} · {seed.version}
        </p>
        <p className="subtitle">
          {l(
            '记录提供包标识和版本。保存资源版本前，请配置已注册的私有软件来源、证据和安装材料。',
            'The record supplies a package ID and version. Configure a registered private software source, provenance and installation materials before saving the Resource version.',
          )}
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
            canWrite={allowed}
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
              onFinish={() => {
                if (allowed) void command.submit(id, 0, { action: 'create', kind: 'software' })
              }}
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
            <ResourceCommandState command={command} locale={locale} canWrite={allowed} />
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
