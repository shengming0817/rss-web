import { useId, useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Form, Input, InputNumber, Space } from 'antd'
import { freeze } from '@rss/mdm-inventory'
import type {
  CertificateArchive,
  ExportFile,
  ExportIntent,
  Reference,
} from '@rss/mdm-certificates/archive'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, useAction } from './AdminUi'
import { Status } from './DevicePresentation'
import { usePendingSelection } from './SelectionGuard'
import { useProtectedDelivery } from './useProtectedDelivery'
export function ArchiveExport({
  archive,
  target,
  locale,
  canRead,
  canExport,
  unlocked,
}: {
  archive: CertificateArchive
  target: Reference | null
  locale: Locale
  canRead: boolean
  canExport: boolean
  unlocked: boolean
}) {
  const formPrefix = useId()

  const l = labels(locale),
    action = useAction(),
    [form] = Form.useForm<Reference>(),
    [pending, setPending] = useState<ExportIntent | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    [receipted, setReceipted] = useState(false),
    [downloads, setDownloads] = useState<readonly { name: string; url: string }[]>([]),
    owned = useRef<readonly (ExportFile & { url: string })[]>([]),
    controller = useRef<AbortController | null>(null)
  function clearFiles() {
    controller.current?.abort()
    for (const file of owned.current) {
      URL.revokeObjectURL(file.url)
      new Uint8Array(file.bytes).fill(0)
    }
    owned.current = []
    setDownloads([])
  }
  const delivery = useProtectedDelivery(clearFiles, canExport && unlocked)
  usePendingSelection(!!pending)
  useEffect(() => {
    if (target && !pending) form.setFieldsValue(target)
  }, [target, pending, form])
  function clear() {
    delivery.clear()
    clearFiles()
  }
  async function submit(input: Reference) {
    clear()
    const epoch = delivery.capture(),
      transfer = new AbortController()
    controller.current = transfer
    const original =
      pending ??
      freeze({ operationId: crypto.randomUUID(), entryId: input.entryId, version: input.version })
    if (!canExport || !unlocked || !delivery.isCurrent(epoch)) return
    setPending(original)
    const result = await action.run(async () => {
      const files = await archive.export(original, transfer.signal)
      if (!delivery.isCurrent(epoch)) {
        files.forEach((file) => new Uint8Array(file.bytes).fill(0))
        return false
      }
      const prepared: (ExportFile & { url: string })[] = []
      try {
        for (const file of files)
          prepared.push({
            ...file,
            url: URL.createObjectURL(new Blob([file.bytes], { type: 'application/octet-stream' })),
          })
        owned.current = prepared
        setDownloads(prepared.map((file) => ({ name: file.name, url: file.url })))
        return true
      } catch (error) {
        prepared.forEach((file) => URL.revokeObjectURL(file.url))
        files.forEach((file) => new Uint8Array(file.bytes).fill(0))
        throw error
      }
    })
    setOutcome((previous) =>
      result.ok && result.value
        ? 'confirmed'
        : previous === 'unknown' ||
            (!result.ok && isUnknown(result.error)) ||
            transfer.signal.aborted
          ? 'unknown'
          : 'rejected',
    )
    if (controller.current === transfer) controller.current = null
  }
  return (
    <Card title={l('导出精确证书材料', 'Export exact certificate material')}>
      <Alert
        type="warning"
        title={l(
          '导出可能包含明文私钥。仅在此页面暂存，隐藏、关闭、权限变化、解锁过期或离开时清除；回执不证明文件已保存。',
          'Exports may include plaintext private keys. They remain local to this page and are cleared on hiding, closing, permission changes, unlock expiry or departure. A receipt does not prove that files were saved.',
        )}
      />
      <Form
        name={formPrefix + '-0'}
        form={form}
        layout="vertical"
        onFinish={(value) => void submit(value)}
        disabled={!canExport || !unlocked || action.busy || !!pending}
      >
        <div className="admin-form-grid">
          <Form.Item
            name="entryId"
            label={l('条目 UUID', 'Entry UUID')}
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="version"
            label={l('精确材料版本', 'Exact material version')}
            rules={[{ required: true }]}
          >
            <InputNumber min={1} precision={0} />
          </Form.Item>
        </div>
        <Button htmlType="submit" disabled={!canExport || !unlocked || action.busy || !!pending}>
          {l('请求导出此版本', 'Request export of this version')}
        </Button>
      </Form>
      {!unlocked && (
        <p>{l('先确认当前档案已解锁。', 'Confirm that the current archive is unlocked first.')}</p>
      )}
      <Failure error={action.error} locale={locale} />
      {pending && (
        <>
          <p className="mono">
            {pending.operationId} · {pending.entryId} · {pending.version}
          </p>
          <Status value={outcome} locale={locale} />
          <Space wrap>
            <Button
              disabled={!canExport || !unlocked || action.busy}
              onClick={() => void submit(pending)}
            >
              {l('使用原操作显式重新导出', 'Explicitly re-export with original operation')}
            </Button>
            <Button
              disabled={!canRead || action.busy}
              onClick={() =>
                void action.run(async () => {
                  await archive.operation({
                    operationId: pending.operationId,
                    action: 'export',
                    entryId: pending.entryId,
                    version: pending.version,
                    expectedRevision: null,
                  })
                  setReceipted(true)
                  setOutcome('confirmed')
                })
              }
            >
              {l('读取原导出回执', 'Read original export receipt')}
            </Button>
            <Button onClick={clear}>
              {l('关闭并清除导出内容', 'Close and clear exported content')}
            </Button>
            {outcome !== 'unknown' && (
              <Button
                disabled={action.busy}
                onClick={() => {
                  clear()
                  setPending(null)
                  setOutcome('none')
                  setReceipted(false)
                  action.clear()
                }}
              >
                {l('结束本次导出', 'Finish this export')}
              </Button>
            )}
          </Space>
        </>
      )}
      {receipted && (
        <p>
          {l(
            '原导出操作已记录。浏览器是否收到或保存文件仍须单独确认。',
            'The original export operation was recorded. Browser receipt and file saving remain separate facts.',
          )}
        </p>
      )}
      {downloads.length > 0 && (
        <ul className="passkey-list">
          {downloads.map((file) => (
            <li key={file.name}>
              <a download={file.name} href={file.url}>
                {l('保存文件', 'Save file')} · {file.name}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
