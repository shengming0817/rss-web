import { Button, Space } from 'antd'
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
type Registration = { readonly registrationId: string; readonly generation: number }
function agentRegistration(endpoint: Endpoint | undefined, expected?: Registration) {
  const active = endpoint?.channels.filter(
    (channel) => channel.channel === 'agent' && channel.status === 'active',
  )
  if (active?.length !== 1) return null
  const current = active[0]!
  return !expected ||
    (current.registrationId === expected.registrationId &&
      current.generation === expected.generation)
    ? current
    : null
}

export function EntryCopies({
  runtime,
  locale,
  entries,
  device,
  expected,
}: {
  runtime: Runtime
  locale: Locale
  entries: readonly CopyEntry[]
  device?: string
  expected?: Registration | undefined
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
    current = agentRegistration(read.value, expected),
    copy = useAction(),
    [copied, setCopied] = useState(''),
    context = JSON.stringify([selected, expected, entries]),
    latest = useRef(context),
    stale = codeOf(copy.error) === 'registration_changed' || readFailure(copy.error) === 'denied'
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
        registration = agentRegistration(endpoint, expected)
      if (
        !registration ||
        registration.registrationId !== current.registrationId ||
        registration.generation !== current.generation
      )
        throw { cause: 'client', code: 'registration_changed' }
      if (!stillCurrent()) throw { cause: 'client', code: 'stale' }
      const formatted = agentViewEntry(entry.target, {
        instance: runtime.host.serviceId,
        tenant: runtime.tenant,
        device: endpoint.id,
        registration: registration.registrationId,
        generation: registration.generation,
      })
      return new Blob([command ? formatted.command : formatted.uri], { type: 'text/plain' })
    }
    const result = await copy.run(async () => {
      // WebKit needs the write to begin during the click. No bytes are provided
      // to the ClipboardItem until the original binding has been verified.
      const content = verify()
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': content })])
      } catch (error) {
        await content
        throw error
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
              'Agent 会核对当前租户和注册，并显示当前可见的记录。',
              'Agent checks the current tenant and registration and displays the records it can read.',
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
          <Failure locale={locale} error={copy.error} kind="read" />
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
                  <Button disabled={copy.busy} onClick={() => void write(entry, true)}>
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
