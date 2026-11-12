import { Alert, Button, Space } from 'antd'
import { useRef, useState } from 'react'
import type { Endpoint } from '@rss/mdm-devices'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, ReadState, codeOf, readFailure, labels, useAction, usePageRead } from './AdminUi'
import { useAdministration } from './useAdministration'
import { useProtectedDelivery } from './useProtectedDelivery'
import { EndpointPicker } from './EndpointPicker'
import { agentViewEntry, type EntryTarget } from './agent-entry'

export type CopyEntry = { readonly label: string; readonly target: EntryTarget }
function activeAgent(endpoint: Endpoint | undefined) {
  return endpoint?.channel === 'agent' && endpoint.status === 'active' ? endpoint : null
}

export function EntryCopies({
  runtime,
  locale,
  entries,
  device,
}: {
  runtime: Runtime
  locale: Locale
  entries: readonly CopyEntry[]
  device?: string
}) {
  const l = labels(locale),
    [open, setOpen] = useState(false),
    [chosen, setChosen] = useState<string>(),
    selected = device ?? chosen,
    { devices, binding } = useAdministration(runtime),
    delivery = useProtectedDelivery(undefined, open),
    read = usePageRead(
      `${binding}/agent-entry-device/${open}/${selected ?? ''}`,
      (signal) =>
        open && selected && entries.length
          ? devices.endpoint(selected, signal)
          : Promise.resolve(undefined),
      { retryReadConflict: true },
    ),
    current = activeAgent(read.value),
    copy = useAction(),
    [copied, setCopied] = useState(''),
    context = JSON.stringify([selected, entries]),
    latest = useRef(context),
    copyError = codeOf(copy.error),
    stale = copyError === 'registration_changed' || readFailure(copy.error) === 'denied'
  latest.current = context
  async function write(entry: CopyEntry, command: boolean) {
    if (!selected || !current) return
    setCopied('')
    const epoch = delivery.capture()
    const stillCurrent = () =>
      delivery.isCurrent(epoch) &&
      latest.current === context &&
      runtime.administration().binding === binding
    async function verify() {
      if (!selected || !current) throw new Error('Agent registration unavailable')
      const endpoint = await devices.endpoint(selected),
        registration = activeAgent(endpoint)
      if (!registration || registration.id !== current.id)
        throw { cause: 'client', code: 'registration_changed' }
      if (!stillCurrent()) throw { cause: 'client', code: 'stale' }
      const formatted = agentViewEntry(entry.target, {
        instance: runtime.host.serviceId,
        tenant: runtime.tenant,
        device: endpoint.id,
      })
      return new Blob([command ? formatted.command : formatted.uri], { type: 'text/plain' })
    }
    const result = await copy.run(async () => {
      // WebKit needs the write to begin during the click. No bytes are provided
      // to the ClipboardItem until the original binding has been verified.
      const content = verify()
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': content })])
      } catch {
        await content
        throw { cause: 'client', code: 'clipboard_unavailable' }
      }
    })
    if (result.ok && stillCurrent()) setCopied(entry.label)
  }
  if (!entries.length) return null
  return (
    <section aria-label={l('Agent 查看入口', 'Agent view entries')}>
      <Button
        onClick={() => {
          setOpen(!open)
          setCopied('')
          copy.clear()
        }}
      >
        {open
          ? l('收起 Agent 查看入口', 'Hide Agent view entries')
          : l('显示 Agent 查看入口', 'Show Agent view entries')}
      </Button>
      {open && (
        <>
          <p>
            {l(
              'Agent 会核对当前租户和设备，再打开查看入口。',
              'Agent checks the current tenant and device before opening the view.',
            )}
          </p>
          {!device && (
            <EndpointPicker
              devices={devices}
              locale={locale}
              onChange={(id) => {
                setChosen(id)
                setCopied('')
                copy.clear()
              }}
            />
          )}
          <ReadState locale={locale} busy={read.busy} error={read.error} onRetry={read.reload} />
          {copyError === 'clipboard_unavailable' ? (
            <Alert
              type="error"
              title={l(
                '无法写入剪贴板，请检查浏览器权限。',
                'Check browser clipboard permissions and try again.',
              )}
            />
          ) : (
            <Failure locale={locale} error={copy.error} kind="read" />
          )}
          {stale && (
            <Button
              onClick={() => {
                copy.clear()
                read.reload()
              }}
            >
              {l('重新读取当前注册', 'Read current registration again')}
            </Button>
          )}
          {selected && !read.busy && !read.error && !current && (
            <p>
              {l(
                '缺少匹配的有效 Agent 注册，无法复制此入口。',
                'A matching active Agent registration is required to copy this entry.',
              )}
            </p>
          )}
          {current &&
            !stale &&
            entries.map((entry) => (
              <div key={entry.label}>
                <Space wrap>
                  <span>{entry.label}</span>
                  <Button disabled={copy.busy} onClick={() => void write(entry, false)}>
                    {l('复制链接', 'Copy link')} · {entry.label}
                  </Button>
                  <Button
                    title={l('适用于 macOS Shell 和 PowerShell', 'For macOS shells and PowerShell')}
                    disabled={copy.busy}
                    onClick={() => void write(entry, true)}
                  >
                    {l('复制命令', 'Copy command')} · {entry.label}
                  </Button>
                </Space>
              </div>
            ))}
          {copied && (
            <p role="status">
              {l('已复制', 'Copied')} · {copied}
            </p>
          )}
        </>
      )}
    </section>
  )
}
