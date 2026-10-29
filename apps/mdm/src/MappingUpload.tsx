import { useRef, useState } from 'react'
import { Alert, Button, Card, Space } from 'antd'
import type { createMappings, PreparedUpload, UploadSession } from '@rss/mdm-inventory'
import type { Locale } from './i18n'
import { Failure, labels, useAction } from './AdminUi'
import { usePendingSelection } from './SelectionGuard'
import { useProtectedDelivery } from './useProtectedDelivery'

export type MappingUseCases = ReturnType<typeof createMappings>
/** Each artifact owns its exact upload ID. Advancing an offset always follows an observed session. */
export function MappingUpload({
  mappings,
  upload,
  scriptSourceVersion,
  locale,
  canWrite,
  confirmed,
  initialAvailable = true,
}: {
  mappings: MappingUseCases
  upload: PreparedUpload
  scriptSourceVersion?: string
  locale: Locale
  canWrite: boolean
  confirmed?: () => void
  initialAvailable?: boolean
}) {
  const l = labels(locale),
    action = useAction(),
    bytes = useRef<PreparedUpload>(upload),
    [available, setAvailable] = useState(initialAvailable),
    [session, setSession] = useState<UploadSession | null>(null),
    [needsRead, setNeedsRead] = useState(false),
    [receipt, setReceipt] = useState(false),
    delivery = useProtectedDelivery(() => {
      new Uint8Array(bytes.current.bytes).fill(0)
      setAvailable(false)
    }, canWrite)
  usePendingSelection(!receipt || action.busy)
  async function restore() {
    const generation = delivery.capture()
    await action.run(async () => {
      const restored = await mappings.restore(
        upload.target.resource,
        upload.id,
        scriptSourceVersion ? { version: scriptSourceVersion } : undefined,
      )
      // Resolve ownership inside work: useAction discards successful values after unmount.
      if (!delivery.isCurrent(generation)) {
        new Uint8Array(restored.bytes).fill(0)
        return
      }
      // The adapter verifies the original server binding and SHA; keep this panel on the same target.
      const a = restored.target,
        b = upload.target
      if (
        a.resource !== b.resource ||
        a.version !== b.version ||
        a.variant !== b.variant ||
        a.platform !== b.platform ||
        a.architecture !== b.architecture ||
        a.artifact.reference !== b.artifact.reference ||
        a.artifact.length !== b.artifact.length ||
        !a.artifact.sha256.every((byte, index) => byte === b.artifact.sha256[index])
      ) {
        new Uint8Array(restored.bytes).fill(0)
        setAvailable(false)
        throw { cause: 'client', code: 'input_changed' }
      }
      new Uint8Array(bytes.current.bytes).fill(0)
      bytes.current = restored
      setAvailable(true)
    })
  }
  async function advance(kind: 'begin' | 'read' | 'append') {
    const offset = session?.offset
    if (kind !== 'read') setNeedsRead(true)
    const result = await action.run(() =>
      kind === 'read'
        ? mappings.upload(bytes.current)
        : kind === 'begin'
          ? mappings.begin(bytes.current)
          : mappings.append(bytes.current, offset!),
    )
    if (result.ok) {
      setSession(result.value)
      setNeedsRead(false)
    } else if (kind === 'read') setNeedsRead(true)
  }
  return (
    <Card
      className="mapping-upload"
      size="small"
      title={`${upload.target.platform} / ${upload.target.architecture} / ${upload.target.variant}`}
    >
      <dl className="device-facts">
        <div>
          <dt>{l('原上传标识', 'Original upload ID')}</dt>
          <dd>
            <code>{upload.id}</code>
          </dd>
        </div>
        <div>
          <dt>{l('资源 / 固定版本', 'Resource / fixed version')}</dt>
          <dd>
            {upload.target.resource} / {upload.target.version}
          </dd>
        </div>
        <div>
          <dt>{l('内容引用', 'Content reference')}</dt>
          <dd>{upload.target.artifact.reference}</dd>
        </div>
        <div>
          <dt>{l('已接收字节 / 内容长度', 'Received bytes / content length')}</dt>
          <dd>
            {session?.offset ?? '—'} / {upload.target.artifact.length}
          </dd>
        </div>
        <div>
          <dt>SHA-256</dt>
          <dd>
            <code>
              {upload.target.artifact.sha256.map((n) => n.toString(16).padStart(2, '0')).join('')}
            </code>
          </dd>
        </div>
      </dl>
      <Failure locale={locale} error={action.error} />
      {!available && !receipt && (
        <Alert
          type="info"
          title={l(
            '内容缓冲已清除。先显式开始或读取原上传，再恢复精确固定版本内容。',
            'Content buffers were cleared. Explicitly begin or read the original upload, then restore its exact fixed-version content.',
          )}
        />
      )}
      {needsRead && !receipt && (
        <Alert
          type="warning"
          title={l(
            '请读取原上传状态后再续传。完成响应未知时查询内容回执。',
            'Read the original upload state before continuing. If completion is unconfirmed, read the content receipt.',
          )}
        />
      )}
      {receipt ? (
        <Alert
          type="success"
          title={l('原内容提交回执已确认。', 'Original content commit receipt confirmed.')}
        />
      ) : (
        <Space wrap>
          <Button
            disabled={!canWrite || action.busy || available || !session}
            onClick={() => void restore()}
          >
            {l('恢复原内容缓冲', 'Restore original content buffer')}
          </Button>
          <Button
            disabled={!canWrite || action.busy || session !== null}
            onClick={() => void advance('begin')}
          >
            {needsRead
              ? l('显式重提原上传开始请求', 'Resubmit original upload begin request')
              : l('开始原上传', 'Begin original upload')}
          </Button>
          <Button disabled={action.busy} onClick={() => void advance('read')}>
            {l('读取原上传状态', 'Read original upload state')}
          </Button>
          <Button
            disabled={
              !canWrite ||
              action.busy ||
              !available ||
              needsRead ||
              !session ||
              session.complete ||
              session.offset >= upload.target.artifact.length
            }
            onClick={() => void advance('append')}
          >
            {l('从已确认位置续传一块', 'Upload one chunk from observed offset')}
          </Button>
          <Button
            disabled={
              !canWrite ||
              action.busy ||
              !available ||
              needsRead ||
              !session ||
              session.complete ||
              session.offset !== upload.target.artifact.length
            }
            onClick={() => {
              setNeedsRead(true)
              void action.run(() => mappings.complete(bytes.current))
            }}
          >
            {l('完成原上传', 'Complete original upload')}
          </Button>
          <Button
            disabled={action.busy}
            onClick={() => {
              void action
                .run(() => mappings.receipt(bytes.current))
                .then((result) => {
                  if (result.ok) {
                    setReceipt(true)
                    new Uint8Array(bytes.current.bytes).fill(0)
                    setAvailable(false)
                    confirmed?.()
                  }
                })
            }}
          >
            {l('查询原内容提交回执', 'Read original content receipt')}
          </Button>
        </Space>
      )}
    </Card>
  )
}
