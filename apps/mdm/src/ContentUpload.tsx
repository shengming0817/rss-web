import { useRef, useState } from 'react'
import { Alert, Button, Card, Space } from 'antd'
import { sameDefinition } from '@rss/mdm-resources'
import type { createContent, UploadIntent, UploadSession } from '@rss/mdm-content'
import type { OwnedMaterialSource } from './MaterialSource'
import { fileMaterial } from './MaterialSource'
import { Failure, isUnknown, labels, useAction } from './AdminUi'
import { usePendingSelection } from './SelectionGuard'
import { useProtectedDelivery } from './useProtectedDelivery'
import type { Locale } from './i18n'

export type ContentUseCases = ReturnType<typeof createContent>

/** One presentation of explicit content writes. File availability, storage frontier and durable commit are distinct. */
export function ContentUpload({
  content,
  intent,
  initialSource,
  initialSession,
  restore,
  locale,
  canWrite,
  confirmed,
  discarded,
}: {
  content: ContentUseCases
  intent: UploadIntent
  initialSource?: OwnedMaterialSource
  initialSession?: UploadSession
  restore?: (signal: AbortSignal) => Promise<OwnedMaterialSource>
  locale: Locale
  canWrite: boolean
  confirmed?: () => void
  discarded?: () => void
}) {
  const l = labels(locale),
    action = useAction(),
    source = useRef<OwnedMaterialSource | null>(initialSource ?? null),
    transfer = useRef<AbortController | null>(null),
    [available, setAvailable] = useState(initialSource !== undefined),
    [verified, setVerified] = useState(false),
    [session, setSession] = useState<UploadSession | null>(initialSession ?? null),
    [needsRead, setNeedsRead] = useState(false),
    [committed, setCommitted] = useState(false),
    [engaged, setEngaged] = useState(initialSession !== undefined),
    delivery = useProtectedDelivery(() => {
      transfer.current?.abort()
      source.current?.release()
      source.current = null
      setAvailable(false)
      setVerified(false)
    }, canWrite)
  usePendingSelection(action.busy || (engaged && !committed))
  function acknowledge() {
    setCommitted(true)
    confirmed?.()
  }
  async function obtain(work: (signal: AbortSignal) => Promise<OwnedMaterialSource>) {
    const generation = delivery.capture(),
      controller = new AbortController()
    transfer.current = controller
    await action.run(async () => {
      const incoming = await work(controller.signal)
      let retained = false
      try {
        if (!delivery.isCurrent(generation)) return
        try {
          await content.verify(incoming.source, intent.target, controller.signal)
        } catch (error) {
          if (controller.signal.aborted) throw error
          throw { cause: 'client', code: 'input_changed' }
        }
        if (!delivery.isCurrent(generation)) return
        source.current?.release()
        source.current = incoming
        retained = true
        setAvailable(true)
        setVerified(true)
      } finally {
        if (!retained) incoming.release()
      }
    })
    if (transfer.current === controller) transfer.current = null
  }
  async function verify() {
    if (!source.current) return
    const generation = delivery.capture(),
      controller = new AbortController()
    transfer.current = controller
    const result = await action.run(() =>
      content.verify(source.current!.source, intent.target, controller.signal),
    )
    if (result.ok && delivery.isCurrent(generation)) setVerified(true)
    if (transfer.current === controller) transfer.current = null
  }
  async function advance(kind: 'begin' | 'read' | 'append' | 'complete' | 'receipt') {
    const wasEngaged = engaged
    if (kind !== 'read' && kind !== 'receipt') setEngaged(true)
    if (kind !== 'read' && kind !== 'receipt') setNeedsRead(true)
    const generation = delivery.capture(),
      controller = new AbortController()
    transfer.current = controller
    const result = await action.run(async () => {
      if (kind === 'receipt') {
        await content.receipt(intent)
        return null
      }
      if (kind === 'complete') {
        await content.complete(intent, session!, controller.signal)
        return null
      }
      const value =
        kind === 'read'
          ? await content.read(intent.target.resource, intent.id, controller.signal)
          : kind === 'begin'
            ? await content.begin(intent, controller.signal)
            : await content.append(intent, session!, source.current!.source, controller.signal)
      if (!sameDefinition(value.target, intent.target))
        throw { cause: 'client', code: 'input_changed' }
      return value
    })
    if (transfer.current === controller) transfer.current = null
    if (!result.ok) {
      if (kind === 'begin' && !wasEngaged && !session && !isUnknown(result.error)) {
        setEngaged(false)
        setNeedsRead(false)
      }
      if (kind === 'read') setNeedsRead(true)
      return
    }
    if (!delivery.isCurrent(generation)) return
    if (kind === 'receipt' || kind === 'complete') {
      source.current?.release()
      source.current = null
      setAvailable(false)
      setVerified(false)
      acknowledge()
    } else {
      setSession(result.value)
      setEngaged(true)
      setNeedsRead(false)
    }
  }
  return (
    <Card
      className="mapping-upload"
      size="small"
      title={`${intent.target.platform} / ${intent.target.architecture} / ${intent.target.variant}`}
    >
      <dl className="device-facts">
        <div>
          <dt>{l('原上传标识', 'Original upload ID')}</dt>
          <dd>
            <code>{intent.id}</code>
          </dd>
        </div>
        <div>
          <dt>{l('资源 / 固定版本', 'Resource / fixed version')}</dt>
          <dd>
            {intent.target.resource} / {intent.target.version}
          </dd>
        </div>
        <div>
          <dt>{l('内容引用', 'Content reference')}</dt>
          <dd>{intent.target.artifact.reference}</dd>
        </div>
        <div>
          <dt>{l('已接收字节 / 内容长度', 'Received bytes / content length')}</dt>
          <dd>
            {session?.offset ?? '—'} / {intent.target.artifact.length}
          </dd>
        </div>
        <div>
          <dt>SHA-256</dt>
          <dd>
            <code>
              {intent.target.artifact.sha256
                .map((value) => value.toString(16).padStart(2, '0'))
                .join('')}
            </code>
          </dd>
        </div>
      </dl>
      <Failure locale={locale} error={action.error} />
      {committed ? (
        <Alert
          type="success"
          title={l('原内容提交回执已确认。', 'Original content commit acknowledged.')}
        />
      ) : (
        <>
          {!available && (
            <Alert
              type="info"
              title={l(
                '内容缓冲与文件句柄已清除或尚未提供。重新选择原文件或恢复固定材料后校验；不会自动重传。',
                'Content buffers and file handles were cleared or have not been provided. Reselect the original file or restore the fixed material and verify it. Transfers are explicit.',
              )}
            />
          )}
          {session?.complete && (
            <Alert
              type="info"
              title={l(
                '存储已完成。只有完成响应或原内容回执确认业务提交。',
                'Storage is complete. Only a completion acknowledgement or original content receipt confirms business commit.',
              )}
            />
          )}
          {needsRead && (
            <Alert
              type="warning"
              title={l(
                '请读取原上传状态后再续传。完成结果未知时查询原内容回执。',
                'Read the original upload before continuing. Query the original content receipt when completion is unknown.',
              )}
            />
          )}
          <label className="content-file">
            {l('选择原材料文件', 'Select original material file')}
            <input
              type="file"
              disabled={!canWrite || action.busy}
              aria-label={l('选择原材料文件', 'Select original material file')}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void obtain(async () => fileMaterial(file))
              }}
            />
          </label>
          <Space wrap>
            {!engaged && !session && (
              <Button
                disabled={action.busy}
                onClick={() => {
                  transfer.current?.abort()
                  source.current?.release()
                  source.current = null
                  setAvailable(false)
                  setVerified(false)
                  discarded?.()
                }}
              >
                {l('放弃本地材料准备', 'Discard local material preparation')}
              </Button>
            )}
            {restore && (
              <Button
                disabled={!canWrite || action.busy || available}
                onClick={() => void obtain(restore)}
              >
                {l('恢复原内容缓冲', 'Restore original content buffer')}
              </Button>
            )}
            <Button
              disabled={!canWrite || action.busy || !available || verified}
              onClick={() => void verify()}
            >
              {l('校验原材料长度与摘要', 'Verify original material length and digest')}
            </Button>
            <Button
              disabled={!canWrite || action.busy || session !== null}
              onClick={() => void advance('begin')}
            >
              {needsRead
                ? l('显式重提原上传开始请求', 'Resubmit original upload begin request')
                : l('开始原上传', 'Begin original upload')}
            </Button>
            <Button disabled={!canWrite || action.busy} onClick={() => void advance('read')}>
              {l('读取原上传状态', 'Read original upload state')}
            </Button>
            <Button
              disabled={
                !canWrite ||
                action.busy ||
                !verified ||
                !source.current ||
                needsRead ||
                !session ||
                session.complete ||
                session.offset >= intent.target.artifact.length
              }
              onClick={() => void advance('append')}
            >
              {l('从已确认位置续传一块', 'Upload one chunk from observed offset')}
            </Button>
            <Button
              disabled={
                !canWrite ||
                action.busy ||
                needsRead ||
                !session ||
                session.offset !== intent.target.artifact.length
              }
              onClick={() => void advance('complete')}
            >
              {l('完成原上传', 'Complete original upload')}
            </Button>
            <Button disabled={action.busy} onClick={() => void advance('receipt')}>
              {l('查询原内容回执', 'Read original content receipt')}
            </Button>
          </Space>
        </>
      )}
    </Card>
  )
}
