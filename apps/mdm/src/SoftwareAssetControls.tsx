import { useState } from 'react'
import { Alert, Button, Space, Tag } from 'antd'
import { freeze } from '@rss/mdm-inventory'
import type {
  AssetContext,
  createSoftwareAssets,
  SoftwareMutation,
  SoftwareReceipt,
  Risk,
  Dimension,
} from '@rss/mdm-inventory'
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
import { GroupPicker, type GroupsUseCases } from './GroupPicker'
import { usePendingSelection } from './SelectionGuard'
import type { Locale } from './i18n'

export type SoftwareAssetsUseCases = ReturnType<typeof createSoftwareAssets>
export const firstAssetPage = { limit: 20 }
export const assetContexts = ['associated_device', 'endpoint'] as const
export function contextName(context: AssetContext, locale: Locale) {
  const l = labels(locale)
  return context === 'endpoint' ? l('终端', 'Endpoint') : l('统一设备', 'Associated device')
}
export function riskName(risk: Risk, locale: Locale) {
  const l = labels(locale)
  return { low: l('低', 'Low'), medium: l('中', 'Medium'), high: l('高', 'High') }[risk]
}
export function dimensionName(dimension: Dimension, locale: Locale) {
  const l = labels(locale)
  return {
    version: l('版本', 'Version'),
    component: l('组件', 'Component'),
    publisher: l('发布者', 'Publisher'),
    platform: l('平台', 'Platform'),
    os: l('操作系统', 'Operating system'),
    architecture: l('架构', 'Architecture'),
    device_group: l('设备组', 'Device group'),
  }[dimension]
}

export function useSoftwareAssetCommand(
  assets: SoftwareAssetsUseCases,
  confirmed: (receipt: SoftwareReceipt) => void,
) {
  const action = useAction(),
    [pending, setPending] = useState<SoftwareMutation | null>(null),
    [unconfirmed, setUnconfirmed] = useState(false)
  usePendingSelection(action.busy || pending !== null)
  async function send(intent: SoftwareMutation) {
    const result = await action.run(() => assets.mutate(intent))
    if (result.ok) {
      setPending(null)
      setUnconfirmed(false)
      confirmed(result.value)
    } else if (isUnknown(result.error) || pending) setPending(intent)
  }
  return {
    action,
    pending,
    unconfirmed,
    submit: (intent: SoftwareMutation) => {
      if (!pending && !action.busy) return send(freeze(intent))
    },
    replay: () => pending && send(pending),
    async recover() {
      if (!pending) return
      const result = await action.run(() => assets.receipt(pending))
      if (!result.ok) return
      if (result.value) {
        setPending(null)
        setUnconfirmed(false)
        confirmed(result.value)
      } else setUnconfirmed(true)
    },
    dismiss() {
      setPending(null)
      setUnconfirmed(false)
      action.clear()
    },
  }
}

export function SoftwareAssetCommandState({
  command,
  locale,
  mayReplay,
  reload,
}: {
  command: ReturnType<typeof useSoftwareAssetCommand>
  locale: Locale
  mayReplay: boolean
  reload: () => void
}) {
  const l = labels(locale)
  return (
    <>
      <Failure error={command.action.error} locale={locale} />
      {command.pending && (
        <Alert
          type="warning"
          title={l('提交结果未知', 'Submission outcome unknown')}
          description={
            <Space wrap>
              <code>{command.pending.operation.operationId}</code>
              {command.unconfirmed && (
                <span>{l('尚未读到原回执', 'No original receipt found yet')}</span>
              )}
              <Button disabled={command.action.busy} onClick={() => void command.recover()}>
                {l('查询原回执', 'Read original receipt')}
              </Button>
              {mayReplay && (
                <Button disabled={command.action.busy} onClick={() => void command.replay()}>
                  {l('重提同一请求', 'Resubmit the same request')}
                </Button>
              )}
              <Button
                disabled={command.action.busy}
                onClick={() => {
                  command.dismiss()
                  reload()
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

export function AssetGroups({
  groups,
  locale,
  context,
  ids,
  onChange,
  disabled,
}: {
  groups: GroupsUseCases
  locale: Locale
  context: AssetContext
  ids: readonly string[]
  onChange: (ids: string[]) => void
  disabled: boolean
}) {
  const l = labels(locale),
    [open, setOpen] = useState(false)
  return (
    <Space direction="vertical">
      <Space wrap>
        {ids.map((id) => (
          <Tag
            key={id}
            closable={!disabled}
            onClose={() => onChange(ids.filter((other) => other !== id))}
          >
            {id}
          </Tag>
        ))}
        <Button disabled={disabled} onClick={() => setOpen(!open)}>
          {open
            ? l('关闭组选择器', 'Close group picker')
            : l('选择同域设备组', 'Choose groups in this domain')}
        </Button>
      </Space>
      {open && (
        <GroupPicker
          key={context}
          groups={groups}
          locale={locale}
          assetContext={context}
          value={null}
          disabled={disabled}
          onChange={(id) => onChange([...new Set([...ids, id])])}
        />
      )}
    </Space>
  )
}

export function StandardPicker({
  assets,
  locale,
  value,
  onSelect,
  disabled,
}: {
  assets: SoftwareAssetsUseCases
  locale: Locale
  value: readonly string[]
  onSelect: (id: string) => void
  disabled: boolean
}) {
  const l = labels(locale),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState<Query>(firstAssetPage),
    read = usePageRead(`software-standard-picker/${open}/${JSON.stringify(query)}`, (signal) =>
      open ? assets.standards(query, signal) : Promise.resolve(null),
    )
  return (
    <Space direction="vertical">
      {value.length > 0 && <code>{value.join(', ')}</code>}
      <Button disabled={disabled} onClick={() => setOpen(!open)}>
        {open
          ? l('关闭标准软件选择器', 'Close standard software picker')
          : l('选择标准软件', 'Choose standard software')}
      </Button>
      {open && (
        <>
          <ReadState
            locale={locale}
            busy={read.busy}
            error={read.error}
            empty={read.value?.items.length === 0}
            onRetry={read.reload}
            onRestart={() => setQuery(firstAssetPage)}
          />
          {read.value && (
            <>
              <Space wrap>
                {read.value.items
                  .filter((row) => row.definition !== null)
                  .map((row) => (
                    <Button
                      key={row.id}
                      disabled={disabled || value.includes(row.id)}
                      onClick={() => {
                        onSelect(row.id)
                        setOpen(false)
                      }}
                    >
                      {row.definition?.name}
                    </Button>
                  ))}
              </Space>
              <CursorControls
                locale={locale}
                query={query}
                next={read.value.nextCursor}
                count={read.value.items.length}
                onChange={setQuery}
              />
            </>
          )}
        </>
      )}
    </Space>
  )
}
