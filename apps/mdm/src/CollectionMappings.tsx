import type { ContentUseCases } from './ContentUpload'
import { useRef, useState } from 'react'
import { Alert, Button, Card, Form, Input, Select } from 'antd'
import {
  replaceDeclaration,
  validateDraft,
  variantKey,
  type MappingResource,
  type ResourceRow,
  type PreparedMapping,
  type PreparedMaterial,
} from '@rss/mdm-resources'
import {
  CursorControls,
  DirectoryControls,
  directoryQuery,
  Failure,
  isUnknown,
  labels,
  ReadState,
  useAction,
  useRead,
  validateInput,
  type Query,
} from './AdminUi'
import { DataTable } from './DataTable'
import { CollectionMappingEditor } from './CollectionMappingEditor'
import type { UploadIntent, UploadSession } from '@rss/mdm-content'
import { MappingUpload, type MappingUseCases } from './MappingUpload'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'
import { useProtectedDelivery } from './useProtectedDelivery'
import type { Locale } from './i18n'

function MappingVersionEditor({
  mappings,
  content,
  resource,
  locale,
  canWrite,
  done,
}: {
  mappings: MappingUseCases
  content: ContentUseCases
  resource: MappingResource
  locale: Locale
  canWrite: boolean
  done: () => void
}) {
  const l = labels(locale),
    action = useAction(),
    [baseId, setBaseId] = useState(resource.versions[0]?.id ?? ''),
    [variants, setVariants] = useState(resource.versions[0]?.variants ?? []),
    [selected, setSelected] = useState(
      resource.versions[0]?.variants[0] ? variantKey(resource.versions[0].variants[0]) : '',
    ),
    [version, setVersion] = useState(''),
    [pending, setPending] = useState<PreparedMapping | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    [receipts, setReceipts] = useState<readonly string[]>([]),
    [intents, setIntents] = useState<readonly UploadIntent[]>([]),
    [contentAvailable, setContentAvailable] = useState(false),
    buffers = useRef<PreparedMapping | null>(null),
    delivery = useProtectedDelivery(() => {
      for (const upload of buffers.current?.materials ?? []) new Uint8Array(upload.bytes).fill(0)
      setContentAvailable(false)
    }, canWrite),
    selectedVariant = variants.find((variant) => variantKey(variant) === selected),
    allContents =
      pending !== null &&
      intents.length === pending.materials.length &&
      intents.every((intent) => receipts.includes(intent.id))
  usePendingSelection(
    action.busy || (pending !== null && outcome !== 'confirmed' && outcome !== 'rejected'),
  )
  async function prepare() {
    const generation = delivery.capture()
    await action.run(async () => {
      const draft = {
        operationId: crypto.randomUUID(),
        resource: resource.id,
        expectedRevision: resource.revision,
        baseVersion: baseId,
        version,
        kind: resource.kind,
        variants,
      }
      validateInput(() => validateDraft(draft))
      const prepared = await mappings.prepare(draft)
      // Transfer or erase before useAction can discard a late successful response.
      if (!delivery.isCurrent(generation)) {
        for (const upload of prepared.materials) new Uint8Array(upload.bytes).fill(0)
        return
      }
      buffers.current = prepared
      setContentAvailable(true)
      setIntents(
        prepared.materials.map((material) => content.intent(crypto.randomUUID(), material.target)),
      )
      setPending(prepared)
    })
  }
  async function declare(change: PreparedMapping) {
    const result = await action.run(() => mappings.declare(change))
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
  }
  return (
    <>
      <p className="subtitle">
        {resource.id} · {l('已读取存储版本', 'Observed storage revision')} {resource.revision}
      </p>
      <Alert
        type="info"
        title={l(
          '映射保存为新固定版本。原生定义同步到同平台架构；Agent 与脚本只修改选定变体。原版本、物理计划和脚本内容保留。',
          'Mappings are saved as a new fixed version. Native definitions update paired architectures on the same platform; Agent and script changes apply to the selected variant. Existing versions, physical plans and script content are retained.',
        )}
      />
      <Failure locale={locale} error={action.error} />
      <Form
        layout="vertical"
        disabled={!canWrite || action.busy || pending !== null}
        onFinish={() => void prepare()}
      >
        <div className="admin-form-grid">
          <Form.Item label={l('来源固定版本', 'Source fixed version')}>
            <Select
              aria-label={l('来源固定版本', 'Source fixed version')}
              value={baseId || null}
              options={resource.versions.map((v) => ({
                value: v.id,
                label: `${v.id} · ${v.state}`,
              }))}
              onChange={(id: string) => {
                const base = resource.versions.find((v) => v.id === id)!
                setBaseId(id)
                setVariants(base.variants)
                setSelected(base.variants[0] ? variantKey(base.variants[0]) : '')
              }}
            />
          </Form.Item>
          <Form.Item label={l('新固定版本名称', 'New fixed version name')}>
            <Input
              aria-label={l('新固定版本名称', 'New fixed version name')}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
          </Form.Item>
          <Form.Item label={l('精确物理变体', 'Exact physical variant')}>
            <Select
              aria-label={l('精确物理变体', 'Exact physical variant')}
              value={selected || null}
              options={variants.map((v) => ({
                value: variantKey(v),
                label: `${v.platform} / ${v.architecture} / ${v.key}`,
              }))}
              onChange={(next: string) => setSelected(next)}
            />
          </Form.Item>
        </div>
        {selectedVariant && (
          <CollectionMappingEditor
            key={`${baseId}/${selected}`}
            locale={locale}
            value={selectedVariant.declaration}
            onChange={(declaration) =>
              setVariants(replaceDeclaration(variants, selectedVariant, declaration))
            }
          />
        )}
        <Button
          htmlType="submit"
          disabled={
            !canWrite ||
            action.busy ||
            pending !== null ||
            !selectedVariant ||
            !version ||
            version === baseId ||
            resource.versions.some((v) => v.id === version)
          }
        >
          {l('准备新版本内容与摘要', 'Prepare new version content and digests')}
        </Button>
      </Form>
      {pending && (
        <div className="admin-recovery">
          <p>
            {l('原版本声明操作', 'Original version declaration')} ·{' '}
            <code>{pending.change.operationId}</code>
          </p>
          <p>
            {pending.resource} / {pending.change.input.version} ·{' '}
            {pending.change.input.variants.length} {l('个变体', 'variants')} ·{' '}
            {pending.materials.length} {l('份内容', 'artifacts')}
          </p>
          {outcome === 'confirmed' ? (
            <>
              <Alert
                type="success"
                title={l(
                  '固定版本声明已确认，逐项提交内容后查询回执。',
                  'Fixed version declaration confirmed. Commit each artifact and read its receipt.',
                )}
              />
              {pending.materials.map((upload, index) => (
                <MappingUpload
                  key={intents[index]!.id}
                  mappings={mappings}
                  content={content}
                  intent={intents[index]!}
                  locale={locale}
                  upload={upload}
                  canWrite={canWrite}
                  initialAvailable={contentAvailable}
                  scriptSourceVersion={baseId}
                  confirmed={() =>
                    setReceipts((current) => [...new Set([...current, intents[index]!.id])])
                  }
                />
              ))}
              {allContents && (
                <Button onClick={done}>
                  {l(
                    '全部内容回执已确认，重新读取资源',
                    'All content receipts confirmed; read resource again',
                  )}
                </Button>
              )}
            </>
          ) : outcome === 'rejected' ? (
            <Button onClick={done}>
              {l('放弃已拒绝版本并重读', 'Discard rejected version and read again')}
            </Button>
          ) : (
            <>
              {outcome === 'unknown' && (
                <Alert
                  type="warning"
                  title={l(
                    '版本声明结果未确认。读取当前资源不能确认原请求；仅显式重提同一声明。',
                    'Version declaration is unconfirmed. Reading the current resource does not confirm the original request; explicitly resubmit the same declaration.',
                  )}
                />
              )}
              <Button
                type="primary"
                disabled={!canWrite || action.busy}
                onClick={() => void declare(pending)}
              >
                {outcome === 'unknown'
                  ? l('显式重提原版本声明', 'Resubmit original version declaration')
                  : l('声明新固定版本', 'Declare new fixed version')}
              </Button>
            </>
          )}
        </div>
      )}
    </>
  )
}
function UploadRecovery({
  mappings,
  content,
  locale,
  canWrite,
}: {
  mappings: MappingUseCases
  content: ContentUseCases
  locale: Locale
  canWrite: boolean
}) {
  const l = labels(locale),
    action = useAction(),
    guard = useSelectionGuard(),
    [resource, setResource] = useState(''),
    [id, setId] = useState(''),
    [source, setSource] = useState(''),
    [restored, setRestored] = useState<{
      upload: PreparedMaterial
      scriptSource: string
      session: UploadSession
      intent: UploadIntent
    } | null>(null),
    material = useRef<PreparedMaterial | null>(null),
    delivery = useProtectedDelivery(() => {
      if (material.current) new Uint8Array(material.current.bytes).fill(0)
    }, canWrite)
  usePendingSelection(guard.locked || action.busy)
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Card title={l('恢复原固定版本上传', 'Recover original fixed version upload')}>
        <p className="subtitle">
          {l(
            '使用原上传标识。脚本续传还需选择原内容所在的精确固定版本。',
            'Use the original upload ID. Resuming a script also requires the exact fixed version containing its original bytes.',
          )}
        </p>
        <Failure locale={locale} error={action.error} />
        <Form
          layout="vertical"
          disabled={!canWrite || action.busy || guard.locked}
          onFinish={() => {
            const generation = delivery.capture()
            void action.run(async () => {
              const session = await content.read(resource, id)
              if (!delivery.isCurrent(generation)) return
              const upload = await mappings.restore(
                session.target,
                source ? { version: source } : undefined,
              )
              if (!delivery.isCurrent(generation)) {
                new Uint8Array(upload.bytes).fill(0)
                return
              }
              if (material.current) new Uint8Array(material.current.bytes).fill(0)
              material.current = upload
              setRestored({
                upload,
                scriptSource: source,
                session,
                intent: content.intent(session.id, session.target),
              })
            })
          }}
        >
          <div className="admin-form-grid">
            <Form.Item label={l('资源标识', 'Resource ID')}>
              <Input
                aria-label={l('资源标识', 'Resource ID')}
                value={resource}
                onChange={(e) => setResource(e.target.value)}
              />
            </Form.Item>
            <Form.Item label={l('原上传标识', 'Original upload ID')}>
              <Input
                aria-label={l('原上传标识', 'Original upload ID')}
                value={id}
                onChange={(e) => setId(e.target.value)}
              />
            </Form.Item>
            <Form.Item
              label={l('脚本原内容固定版本（可选）', 'Original script content version (optional)')}
            >
              <Input
                aria-label={l(
                  '脚本原内容固定版本（可选）',
                  'Original script content version (optional)',
                )}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </Form.Item>
          </div>
          <Button
            htmlType="submit"
            disabled={!resource || !id || action.busy || guard.locked || !canWrite}
          >
            {l('读取并核验原上传', 'Read and verify original upload')}
          </Button>
        </Form>
        {restored && (
          <MappingUpload
            key={restored.intent.id}
            mappings={mappings}
            content={content}
            intent={restored.intent}
            initialSession={restored.session}
            locale={locale}
            upload={restored.upload}
            scriptSourceVersion={restored.scriptSource}
            canWrite={canWrite}
          />
        )}
      </Card>
    </SelectionGuard.Provider>
  )
}
const resourceColumns = [
  'id',
  'kind',
  'revision',
  'activeVersion',
  'presentation',
] as const satisfies readonly (keyof ResourceRow)[]
export function CollectionMappings({
  mappings,
  content,
  locale,
  canWrite,
}: {
  mappings: MappingUseCases
  content: ContentUseCases
  locale: Locale
  canWrite: boolean
}) {
  const l = labels(locale),
    action = useAction(),
    guard = useSelectionGuard(),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    read = useRead(`mapping-resources/${JSON.stringify(query)}`, () =>
      mappings.resources(directoryQuery(query, resourceColumns)),
    ),
    [detail, setDetail] = useState<MappingResource | null>(null),
    [editor, setEditor] = useState(0)
  usePendingSelection(guard.locked || action.busy)
  async function open(id: string) {
    const result = await action.run(() => mappings.resource(id))
    if (result.ok) {
      setDetail(result.value)
      setEditor((v) => v + 1)
    }
  }
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Card title={l('采集字段映射', 'Collection field mappings')}>
        <fieldset className="permission-panel" disabled={guard.locked || action.busy}>
          <DirectoryControls
            locale={locale}
            query={query}
            onChange={setQuery}
            fields={resourceColumns}
            sort={['id', 'kind']}
          />
          <Button onClick={read.reload}>{l('读取采集资源', 'Read collection resources')}</Button>
          <ReadState locale={locale} busy={read.busy} error={read.error} />
          {read.value && (
            <>
              <DataTable
                locale={locale}
                dataSource={read.value.items}
                rowKey="id"
                columns={[
                  {
                    title: l('资源', 'Resource'),
                    dataIndex: 'id',
                    render: (_, row) => (
                      <Button type="link" onClick={() => void open(row.id)}>
                        {row.id}
                      </Button>
                    ),
                  },
                  { title: l('类型', 'Kind'), dataIndex: 'kind' },
                  { title: l('存储版本', 'Storage revision'), dataIndex: 'revision' },
                  { title: l('已激活版本', 'Active version'), dataIndex: 'activeVersion' },
                ]}
              />
              <CursorControls
                locale={locale}
                query={query}
                next={read.value.nextCursor}
                count={read.value.items.length}
                onChange={setQuery}
              />
            </>
          )}
          {!read.value && query.cursor && (
            <Button
              onClick={() => {
                const next = { ...query }
                delete next.cursor
                setQuery(next)
              }}
            >
              {l('返回首页', 'First page')}
            </Button>
          )}
        </fieldset>
        <Failure locale={locale} error={action.error} />
      </Card>
      {detail && (
        <Card
          className="admin-subsection"
          title={detail.id}
          extra={
            <Button disabled={guard.locked || action.busy} onClick={() => setDetail(null)}>
              {l('关闭资源详情', 'Close resource detail')}
            </Button>
          }
        >
          <MappingVersionEditor
            key={editor}
            mappings={mappings}
            content={content}
            resource={detail}
            locale={locale}
            canWrite={canWrite}
            done={() => {
              setDetail(null)
              read.reload()
            }}
          />
        </Card>
      )}
      <div className="admin-subsection">
        <UploadRecovery mappings={mappings} content={content} locale={locale} canWrite={canWrite} />
      </div>
    </SelectionGuard.Provider>
  )
}
