import { useId, useRef, useState } from 'react'
import { Alert, Button, Card, Checkbox, Form, Input, Select, Space } from 'antd'
import { Link } from 'react-router-dom'
import { hashMaterial, type SoftwareUploadIntent, type UploadSession } from '@rss/mdm-content'
import type {
  Preparation,
  Save,
  Inspection,
  PackageReceipt,
  ManagedPackage,
} from '@rss/mdm-software/agent-packages'
import type { SoftwareBehavior } from '@rss/mdm-resources'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, ReadState, useAction, useRead } from './AdminUi'
import { useAdministration } from './useAdministration'
import { ContentUpload } from './ContentUpload'
import { fileMaterial, type OwnedMaterialSource } from './MaterialSource'
import { SoftwareBehaviorAuthor, emptySoftwareBehavior } from './SoftwareBehaviorAuthor'
import { useProtectedDelivery } from './useProtectedDelivery'
import { usePendingSelection } from './SelectionGuard'
import { DataTable } from './DataTable'
type Pending =
  | { readonly kind: 'prepare'; readonly input: Preparation }
  | { readonly kind: 'save'; readonly input: Save }
  | { readonly kind: 'publish' | 'withdraw'; readonly operationId: string; readonly id: string }
export function AgentPackages({
  runtime,
  locale,
  canRead,
  canPrepare,
  canPublish,
  canWithdraw,
}: {
  runtime: Runtime
  locale: Locale
  canRead: boolean
  canPrepare: boolean
  canPublish: boolean
  canWithdraw: boolean
}) {
  const formId = useId()
  const l = labels(locale),
    { agentPackages, content, binding } = useAdministration(runtime),
    action = useAction(),
    [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState(''),
    [packageId, setPackageId] = useState(''),
    [operation, setOperation] = useState(''),
    [pending, setPending] = useState<Pending | null>(null),
    [unknown, setUnknown] = useState(false),
    [inspection, setInspection] = useState<Inspection | null>(null),
    [receipt, setReceipt] = useState<PackageReceipt | null>(null),
    [behavior, setBehavior] = useState<SoftwareBehavior | null>(null),
    [upload, setUpload] = useState<{
      intent: SoftwareUploadIntent
      session: UploadSession
      source?: OwnedMaterialSource
    } | null>(null),
    source = useRef<OwnedMaterialSource | null>(null)
  const [saveForm] = Form.useForm<{
    version?: string
    platform: 'windows' | 'macos'
    architecture: 'x86_64' | 'aarch64'
  }>()
  const [uploadConfirmed, setUploadConfirmed] = useState(false)
  const delivery = useProtectedDelivery(() => {
    source.current?.release()
    source.current = null
  }, canPrepare)
  const page = useRead(`${binding}/agent-packages/${cursor}/${canRead}`, (signal) =>
    canRead ? agentPackages.list(cursor, signal) : Promise.resolve(null),
  )
  const detail = useRead(`${binding}/agent-package/${selected}/${canRead}`, (signal) =>
    canRead && selected ? agentPackages.read(selected, signal) : Promise.resolve(null),
  )
  const original = useRef({ binding, pending, operation })
  original.current = { binding, pending, operation }
  usePendingSelection(action.busy || unknown)
  async function submit(intent: Pending) {
    const generation = delivery.capture()
    const result = await action.run(async () => {
      if (intent.kind === 'prepare') {
        const prepared = await agentPackages.prepare(intent.input)
        const session = await content.read(prepared.resource, prepared.upload)
        if (
          session.purpose !== 'software' ||
          session.target.filename !== intent.input.filename ||
          session.target.artifact.length !== intent.input.length ||
          session.target.artifact.sha256.some((byte, i) => byte !== intent.input.sha256[i])
        )
          throw new Error('Wrong prepared original upload')
        if (!delivery.isCurrent(generation)) return
        const material = source.current
        source.current = null
        setUploadConfirmed(false)
        setPackageId(prepared.packageId)
        setUpload({
          intent: content.prepared(prepared.upload, session.target),
          session,
          ...(material ? { source: material } : {}),
        })
      } else if (intent.kind === 'save') setReceipt(await agentPackages.save(intent.input))
      else if (intent.kind === 'publish')
        setReceipt(await agentPackages.publish(intent.operationId, intent.id))
      else {
        await agentPackages.withdraw(intent.operationId, intent.id)
        setReceipt({ withdrawn: intent.id })
      }
    })
    setUnknown((previous) => !result.ok && (previous || isUnknown(result.error)))
    if (result.ok) {
      setPending(null)
      page.reload()
      detail.reload()
    }
  }
  function start(intent: Pending) {
    setPending(intent)
    setOperation('input' in intent ? intent.input.operationId : intent.operationId)
    setReceipt(null)
    void submit(intent)
  }
  async function readInspection(parse: boolean) {
    await action.run(async () =>
      setInspection(
        await (parse ? agentPackages.parse(packageId) : agentPackages.inspect(packageId)),
      ),
    )
  }
  async function readOperation() {
    const coordinate = original.current
    const result = await action.run(() => agentPackages.operation(coordinate.operation))
    if (
      !result.ok ||
      original.current.binding !== coordinate.binding ||
      original.current.operation !== coordinate.operation
    )
      return
    const value = result.value,
      intent = coordinate.pending
    setReceipt(value)
    if (
      value &&
      intent &&
      intent === original.current.pending &&
      coordinate.operation ===
        ('input' in intent ? intent.input.operationId : intent.operationId) &&
      ((intent.kind === 'save' &&
        'packageId' in value &&
        value.packageId === intent.input.packageId) ||
        (intent.kind === 'publish' && 'releaseId' in value) ||
        (intent.kind === 'withdraw' && 'withdrawn' in value && value.withdrawn === intent.id))
    ) {
      setUnknown(false)
      page.reload()
      detail.reload()
    }
  }
  const locked = action.busy || pending !== null
  return (
    <div className="admin-stack agent-packages">
      <Alert
        type="info"
        title={l(
          '上传、解析、保存、发布、可下载与设备安装分别确认。',
          'Upload, inspection, save, publication, download and device installation are separate facts.',
        )}
      />
      <ReadState locale={locale} busy={page.busy} error={page.error} onRetry={page.reload} />
      {page.value && (
        <Card title={l('Agent 安装包', 'Agent packages')}>
          <DataTable<ManagedPackage>
            locale={locale}
            rowKey="releaseId"
            dataSource={page.value.items}
            columns={[
              {
                title: l('固定发布', 'Fixed release'),
                render: (_, row) => (
                  <Button type="link" onClick={() => setSelected(row.releaseId)}>
                    {row.releaseId}
                  </Button>
                ),
              },
              {
                title: l('目标', 'Target'),
                render: (_, row) => `${row.platform} / ${row.architecture}`,
              },
              { title: l('版本', 'Version'), dataIndex: 'version' },
              { title: l('状态', 'State'), dataIndex: 'state' },
            ]}
          />
          {page.value.nextCursor && (
            <Button onClick={() => setCursor(page.value!.nextCursor)}>
              {l('下一页包', 'Next packages')}
            </Button>
          )}
          {cursor && (
            <Button onClick={() => setCursor(null)}>{l('包首页', 'First packages')}</Button>
          )}
        </Card>
      )}
      <ReadState locale={locale} busy={detail.busy} error={detail.error} />
      {detail.value && (
        <Card title={l('固定包详情', 'Fixed package details')}>
          <pre className="definition-preview">{JSON.stringify(detail.value, null, 2)}</pre>
          <Button
            danger
            disabled={!canWithdraw || locked || detail.value.state === 'withdrawn'}
            onClick={() =>
              start({
                kind: 'withdraw',
                operationId: crypto.randomUUID(),
                id: detail.value!.releaseId,
              })
            }
          >
            {l('明确撤回此发布', 'Explicitly withdraw this release')}
          </Button>
          <Link to="/downloads/agent">{l('公开安装包入口', 'Public installer entry')}</Link>
        </Card>
      )}
      {canPrepare && (
        <Card title={l('上传原安装包', 'Upload original installer')}>
          <label>
            {l('选择 Agent 安装包', 'Select Agent installer')}
            <input
              type="file"
              aria-label={l('选择 Agent 安装包', 'Select Agent installer')}
              disabled={locked || upload !== null}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (!file) return
                const generation = delivery.capture(),
                  incoming = fileMaterial(file)
                void action
                  .run(async () => {
                    const sha256 = await hashMaterial(incoming.source)
                    if (!delivery.isCurrent(generation)) {
                      incoming.release()
                      return
                    }
                    source.current?.release()
                    source.current = incoming
                    const intent: Pending = {
                      kind: 'prepare',
                      input: {
                        operationId: crypto.randomUUID(),
                        filename: file.name,
                        length: file.size,
                        sha256,
                      },
                    }
                    setPending(intent)
                    setOperation(intent.input.operationId)
                  })
                  .then((result) => {
                    if (!result.ok) incoming.release()
                  })
              }}
            />
          </label>
          {pending?.kind === 'prepare' && !unknown && (
            <Button disabled={action.busy} onClick={() => void submit(pending)}>
              {l('明确准备此上传', 'Explicitly prepare this upload')}
            </Button>
          )}
        </Card>
      )}
      {upload && (
        <ContentUpload
          key={upload.intent.id}
          content={content}
          intent={upload.intent}
          initialSession={upload.session}
          {...(upload.source ? { initialSource: upload.source } : {})}
          canWrite={canPrepare}
          confirmed={() => {
            setUploadConfirmed(true)
            setUpload((current) =>
              current ? { intent: current.intent, session: current.session } : null,
            )
          }}
          locale={locale}
        />
      )}
      <Card title={l('原包定位', 'Original package locator')}>
        <Input
          aria-label={l('原包 UUID', 'Original package UUID')}
          value={packageId}
          disabled={locked || (upload !== null && !uploadConfirmed)}
          onChange={(event) => {
            setPackageId(event.target.value)
            setInspection(null)
          }}
        />
      </Card>
      {uploadConfirmed && (
        <Button
          disabled={locked || unknown}
          onClick={() => {
            source.current?.release()
            source.current = null
            setUpload(null)
            setUploadConfirmed(false)
            setPackageId('')
            setInspection(null)
            setBehavior(null)
            setReceipt(null)
            saveForm.resetFields()
          }}
        >
          {l('结束此包，准备另一包', 'Finish this package and prepare another')}
        </Button>
      )}
      {canPrepare && (
        <Card title={l('解析与保存软件定义', 'Inspect and save software definition')}>
          <Space wrap>
            <Button disabled={!packageId || action.busy} onClick={() => void readInspection(false)}>
              {l('读取持久解析', 'Read persisted inspection')}
            </Button>
            <Button disabled={!packageId || locked} onClick={() => void readInspection(true)}>
              {l('明确解析原上传', 'Explicitly inspect original upload')}
            </Button>
          </Space>
          {inspection && (
            <pre className="definition-preview">{JSON.stringify(inspection, null, 2)}</pre>
          )}
          <Form
            name={formId}
            form={saveForm}
            layout="vertical"
            disabled={locked}
            onFinish={(value: {
              version?: string
              platform: 'windows' | 'macos'
              architecture: 'x86_64' | 'aarch64'
            }) => {
              if (behavior === null) return
              start({
                kind: 'save',
                input: {
                  operationId: crypto.randomUUID(),
                  packageId,
                  version: value.version || null,
                  target: { platform: value.platform, architecture: value.architecture },
                  behavior,
                },
              })
            }}
          >
            <Form.Item
              name="version"
              label={l(
                '明确产品版本（留空仅使用正式解析结果）',
                'Product version (blank uses formal inspection only)',
              )}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="platform"
              label={l('目标系统', 'Target platform')}
              rules={[{ required: true }]}
            >
              <Select options={['windows', 'macos'].map((value) => ({ value, label: value }))} />
            </Form.Item>
            <Form.Item
              name="architecture"
              label={l('原生架构', 'Native architecture')}
              rules={[{ required: true }]}
            >
              <Select options={['x86_64', 'aarch64'].map((value) => ({ value, label: value }))} />
            </Form.Item>
            <Checkbox
              checked={behavior !== null}
              onChange={(event) =>
                setBehavior(event.target.checked ? emptySoftwareBehavior('exe') : null)
              }
            >
              {l('提供完整安装定义', 'Provide complete installation definition')}
            </Checkbox>
            {behavior && (
              <Alert
                type="info"
                title={l(
                  '原文件的安装材料键为 package；EXE 布局需包含该材料。',
                  'The original installer material key is package; include it in the EXE layout.',
                )}
              />
            )}
            {behavior && (
              <SoftwareBehaviorAuthor value={behavior} onChange={setBehavior} locale={locale} />
            )}
            <Button htmlType="submit" disabled={!packageId || locked || behavior === null}>
              {l('明确保存软件定义', 'Explicitly save software definition')}
            </Button>
          </Form>
          <Link to="/software">{l('核对软件准入', 'Inspect software admission')}</Link>
        </Card>
      )}
      <Space wrap>
        <Button
          disabled={!canPublish || !packageId || locked}
          onClick={() =>
            start({ kind: 'publish', operationId: crypto.randomUUID(), id: packageId })
          }
        >
          {l('明确发布已保存软件', 'Explicitly publish saved software')}
        </Button>
        <Input
          aria-label={l('原包操作 UUID', 'Original package operation UUID')}
          value={operation}
          disabled={action.busy}
          onChange={(e) => setOperation(e.target.value)}
        />
        <Button disabled={!operation || action.busy} onClick={() => void readOperation()}>
          {l('读取原包操作', 'Read original package operation')}
        </Button>
      </Space>
      {pending && (
        <Card title={l('保留原操作', 'Retained original operation')}>
          <code>{'input' in pending ? pending.input.operationId : pending.operationId}</code>
          <Button disabled={action.busy} onClick={() => void submit(pending)}>
            {l('显式重提完全相同请求', 'Explicitly resubmit the identical request')}
          </Button>
          {!unknown && (
            <Button disabled={action.busy} onClick={() => setPending(null)}>
              {l('结束此操作', 'Finish this operation')}
            </Button>
          )}
        </Card>
      )}
      {receipt && <pre className="definition-preview">{JSON.stringify(receipt, null, 2)}</pre>}
      <Failure locale={locale} error={action.error} />
    </div>
  )
}
