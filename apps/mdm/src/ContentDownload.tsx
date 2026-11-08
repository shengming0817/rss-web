import { useRef, useState } from 'react'
import { Alert, Button, Card, Space } from 'antd'
import type { DownloadRequest, DownloadSink } from '@rss/mdm-content'
import type { ContentUseCases } from './ContentUpload'
import { Failure, labels, useAction } from './AdminUi'
import { useProtectedDelivery } from './useProtectedDelivery'
import { usePendingSelection } from './SelectionGuard'
import type { Locale } from './i18n'

interface WritableFile {
  write(bytes: Uint8Array): Promise<void>
  close(): Promise<void>
  abort(): Promise<void>
}
interface FileHandle {
  createWritable(): Promise<WritableFile>
}
interface FilePicker {
  showSaveFilePicker(options: { suggestedName: string }): Promise<FileHandle>
}
function filePicker(): FilePicker | null {
  const host: unknown = window
  return typeof Reflect.get(window, 'showSaveFilePicker') === 'function'
    ? (host as FilePicker)
    : null
}
/** Both modes use the same verified content use case. Large materials never become a whole-file Blob. */
export function ContentDownload({
  content,
  request,
  permitted,
  locale,
}: {
  content: ContentUseCases
  request: DownloadRequest
  permitted: boolean
  locale: Locale
}) {
  const l = labels(locale),
    action = useAction(),
    controller = useRef<AbortController | null>(null),
    pendingSink = useRef<DownloadSink | null>(null),
    [cleanupUnknown, setCleanupUnknown] = useState(false),
    [saved, setSaved] = useState(false),
    delivery = useProtectedDelivery(() => {
      controller.current?.abort()
      setSaved(false)
      if (pendingSink.current) void pendingSink.current.abort().catch(() => setCleanupUnknown(true))
    }, permitted),
    smallLimit = 16 * 1024 * 1024,
    streamSupported = typeof ReadableStream !== 'undefined' && filePicker() !== null,
    filename = request.target.artifact.reference.split('/').at(-1) || 'material'
  usePendingSelection(action.busy)
  async function save(mode: 'small' | 'file') {
    setSaved(false)
    const generation = delivery.capture(),
      transfer = new AbortController()
    controller.current = transfer
    await action.run(async () => {
      if (mode === 'small') {
        const bytes = await content.downloadBytes(request, smallLimit, transfer.signal)
        delivery.deliver({ bytes, contentType: 'application/octet-stream', filename }, generation)
        return
      }
      const picker = filePicker()
      if (!picker) throw { cause: 'client', code: 'stream_save_unavailable' }
      const handle = await picker.showSaveFilePicker({ suggestedName: filename })
      if (!delivery.isCurrent(generation)) return
      const writer = await handle.createWritable()
      let state: 'open' | 'closed' | 'aborted' = 'open',
        stopping: Promise<void> | undefined
      const sink: DownloadSink = {
        async write(bytes) {
          if (state !== 'open' || transfer.signal.aborted)
            throw { cause: 'client', code: 'download_cancelled' }
          await writer.write(bytes)
        },
        async close() {
          if (transfer.signal.aborted) throw { cause: 'client', code: 'download_cancelled' }
          await writer.close()
          state = 'closed'
          if (pendingSink.current === sink) pendingSink.current = null
        },
        abort() {
          if (state !== 'open') return Promise.resolve()
          stopping ??= writer
            .abort()
            .then(() => {
              state = 'aborted'
              if (pendingSink.current === sink) pendingSink.current = null
            })
            .catch(() => {
              setCleanupUnknown(true)
              throw { cause: 'client', code: 'download_cleanup_unconfirmed' }
            })
          return stopping
        },
      }
      pendingSink.current = sink
      if (!delivery.isCurrent(generation)) {
        await sink.abort()
        return
      }
      await content.download(request, sink, transfer.signal)
      if (delivery.isCurrent(generation)) setSaved(true)
    })
    if (controller.current === transfer) controller.current = null
  }
  return (
    <Card size="small" title={l('下载此精确材料', 'Download this exact material')}>
      <p className="subtitle content-material-reference">
        {request.target.artifact.reference} · {request.target.artifact.length} {l('字节', 'bytes')}
      </p>
      {!streamSupported && (
        <Alert
          type="info"
          title={l(
            '当前浏览器不支持流式文件保存。小文件模式最大 16 MiB；更大材料请使用支持流式保存的浏览器。',
            'This browser does not support streamed file saving. Small-file mode is limited to 16 MiB; use a browser with streamed saving for larger materials.',
          )}
        />
      )}
      {cleanupUnknown && (
        <Alert
          type="error"
          title={l(
            '文件写入的中止未确认。请检查所选文件后再继续。',
            'File-write cancellation is unconfirmed. Check the selected file before continuing.',
          )}
        />
      )}
      {saved && (
        <Alert
          type="success"
          title={l(
            '材料已校验并保存到所选文件。',
            'Material verified and saved to the selected file.',
          )}
        />
      )}
      <Failure locale={locale} error={action.error} kind="read" />
      <Space wrap>
        <Button
          disabled={!permitted || action.busy || cleanupUnknown || !streamSupported}
          onClick={() => void save('file')}
        >
          {l('流式保存到文件', 'Stream to a file')}
        </Button>
        <Button
          disabled={
            !permitted ||
            action.busy ||
            cleanupUnknown ||
            request.target.artifact.length > smallLimit ||
            typeof ReadableStream === 'undefined'
          }
          onClick={() => void save('small')}
        >
          {l('读取小文件下载（最大 16 MiB）', 'Read small-file download (up to 16 MiB)')}
        </Button>
        {action.busy && (
          <Button onClick={() => controller.current?.abort()}>
            {l('取消当前下载', 'Cancel current download')}
          </Button>
        )}
        {delivery.download && (
          <>
            <a href={delivery.download.url} download={delivery.download.filename}>
              {l('保存已校验小文件', 'Save verified small file')}
            </a>
            <Button onClick={delivery.clear}>
              {l('清除临时下载', 'Clear temporary download')}
            </Button>
          </>
        )}
      </Space>
    </Card>
  )
}
